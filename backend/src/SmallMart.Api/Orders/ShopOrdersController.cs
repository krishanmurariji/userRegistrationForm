using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmallMart.Api.Audit;
using SmallMart.Api.Auth;
using SmallMart.Api.Data;
using SmallMart.Api.Domain;
using SmallMart.Api.Inventory;
using SmallMart.Api.Notifications;
using SmallMart.Api.Shops;
using SmallMart.Api.Storage;

namespace SmallMart.Api.Orders;

/// <summary>Orders as handled by the shop: moving them along, checking UPI payments, cancelling.</summary>
[ApiController]
[Route("api/shops/{shopId:guid}/orders")]
[Authorize]
public class ShopOrdersController(
    AppDbContext db, ShopAccess access, ImageStorage images, AuditLog audit, StockService stock, Notifier notifier,
    TimeProvider clock) : ControllerBase
{
    private static readonly Dictionary<OrderStatus, (OrderStatus Next, string Title)> Steps = new()
    {
        [OrderStatus.Placed] = (OrderStatus.Accepted, "Order accepted"),
        [OrderStatus.Accepted] = (OrderStatus.Packed, "Order packed"),
        [OrderStatus.Packed] = (OrderStatus.OutForDelivery, "Out for delivery"),
        [OrderStatus.OutForDelivery] = (OrderStatus.Delivered, "Delivered"),
    };

    /// <summary>
    /// Orders of the shop, newest first. <c>view</c> is "new" (waiting to be accepted), "active"
    /// (accepted but not delivered), "done" (delivered or cancelled), "payments" (UPI proofs to check) or empty for all.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> List(
        Guid shopId, [FromQuery] string? view, [FromQuery] int skip = 0, [FromQuery] int take = 50, CancellationToken ct = default)
    {
        if (await access.RoleAsync(shopId, User.GetUserId(), ct) is null)
            return NotFound();

        var query = db.Orders.AsNoTracking().Include(o => o.Shop).Include(o => o.Items).Where(o => o.ShopId == shopId);
        query = view switch
        {
            "new" => query.Where(o => o.Status == OrderStatus.Placed),
            "active" => query.Where(o => o.Status == OrderStatus.Accepted || o.Status == OrderStatus.Packed || o.Status == OrderStatus.OutForDelivery),
            "done" => query.Where(o => o.Status == OrderStatus.Delivered || o.Status == OrderStatus.Cancelled),
            "payments" => query.Where(o => o.PaymentStatus == PaymentStatus.AwaitingVerification && o.Status != OrderStatus.Cancelled),
            _ => query,
        };

        var orders = await query.OrderByDescending(o => o.CreatedAt).ThenByDescending(o => o.Number)
            .Skip(Math.Max(skip, 0)).Take(Math.Clamp(take, 1, 100))
            .ToListAsync(ct);
        return Ok(orders.Select(OrderSummaryDto.From));
    }

    /// <summary>How many orders need the shop's attention.</summary>
    [HttpGet("counts")]
    public async Task<IActionResult> Counts(Guid shopId, CancellationToken ct)
    {
        if (await access.RoleAsync(shopId, User.GetUserId(), ct) is null)
            return NotFound();
        var orders = db.Orders.Where(o => o.ShopId == shopId);
        return Ok(new
        {
            New = await orders.CountAsync(o => o.Status == OrderStatus.Placed, ct),
            Active = await orders.CountAsync(o => o.Status == OrderStatus.Accepted || o.Status == OrderStatus.Packed || o.Status == OrderStatus.OutForDelivery, ct),
            Payments = await orders.CountAsync(o => o.PaymentStatus == PaymentStatus.AwaitingVerification && o.Status != OrderStatus.Cancelled, ct),
        });
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid shopId, Guid id, CancellationToken ct)
    {
        if (await access.RoleAsync(shopId, User.GetUserId(), ct) is null)
            return NotFound();
        var order = await LoadAsync(shopId, id, tracking: false, ct);
        return order is null ? NotFound() : Ok(OrderDto.From(order));
    }

    /// <summary>The customer's payment screenshot, for the shop to compare with its bank or UPI app.</summary>
    [HttpGet("{id:guid}/upi-proof")]
    public async Task<IActionResult> UpiProof(Guid shopId, Guid id, CancellationToken ct)
    {
        if (await access.RoleAsync(shopId, User.GetUserId(), ct) is null)
            return NotFound();
        var path = await db.Orders.Where(o => o.Id == id && o.ShopId == shopId)
            .Select(o => o.UpiScreenshotPath).SingleOrDefaultAsync(ct);
        return images.OpenPrivate(path) is { } image ? File(image.Content, image.ContentType) : NotFound();
    }

    /// <summary>
    /// Moves the order to the next step: Accepted, Packed, OutForDelivery, Delivered. Steps cannot be skipped.
    /// A UPI order can be accepted only after its payment has been confirmed.
    /// </summary>
    [HttpPost("{id:guid}/status")]
    public Task<IActionResult> Advance(Guid shopId, Guid id, StatusRequest request, CancellationToken ct) =>
        ChangeAsync(shopId, id, ct, (order, now, userId) =>
        {
            if (!Enum.TryParse<OrderStatus>(request.Status, out var wanted) ||
                !Steps.TryGetValue(order.Status, out var step) || step.Next != wanted)
                return this.ApiError(StatusCodes.Status409Conflict, "invalid_step",
                    "This order cannot move to that step. Please reload to see where it is now.");
            if (order.PaymentMethod == PaymentMethod.Upi && order.PaymentStatus != PaymentStatus.Paid)
                return this.ApiError(StatusCodes.Status409Conflict, "payment_not_verified",
                    "Confirm the UPI payment before accepting this order.");

            order.Status = step.Next;
            string? note = null;
            if (step.Next == OrderStatus.Delivered && order.PaymentMethod == PaymentMethod.CashOnDelivery)
            {
                order.PaymentStatus = PaymentStatus.Paid;
                note = $"Cash collected: ₹{order.Total:0.##}";
            }
            order.Events.Add(new OrderEvent { At = now, Title = step.Title, Note = note, ActorUserId = userId });
            return null;
        }, order => ToCustomerAsync(order, order.Status switch
        {
            OrderStatus.Accepted => "The shop accepted your order and is preparing it.",
            OrderStatus.Packed => "Your order is packed.",
            OrderStatus.OutForDelivery => "Your order is on its way.",
            _ => "Your order was delivered. Thank you!",
        }, ct));

    /// <summary>Cancels (or refuses) the order with a reason the customer can read. Not possible once delivered.</summary>
    [HttpPost("{id:guid}/cancel")]
    public Task<IActionResult> Cancel(Guid shopId, Guid id, ReasonRequest request, CancellationToken ct) =>
        ChangeAsync(shopId, id, ct, (order, now, userId) =>
        {
            if (order.Status is OrderStatus.Delivered or OrderStatus.Cancelled)
                return this.ApiError(StatusCodes.Status409Conflict, "order_closed", "This order is already closed.");

            order.Status = OrderStatus.Cancelled;
            order.CancelReason = request.Reason.Trim();
            var refund = order.PaymentStatus is PaymentStatus.Paid or PaymentStatus.AwaitingVerification &&
                         order.PaymentMethod == PaymentMethod.Upi;
            order.Events.Add(new OrderEvent
            {
                At = now,
                Title = "Cancelled by shop",
                Note = order.CancelReason + (refund ? $". Refund ₹{order.Total:0.##} to the customer by UPI." : string.Empty),
                ActorUserId = userId,
            });
            return null;
        }, async order =>
        {
            await stock.ReturnForOrderAsync(order, User.GetUserId(), ct);
            await ToCustomerAsync(order, $"The shop cancelled your order: {order.CancelReason}", ct);
        });

    /// <summary>The shop found the money in its bank or UPI app.</summary>
    [HttpPost("{id:guid}/payment/verify")]
    public Task<IActionResult> VerifyPayment(Guid shopId, Guid id, CancellationToken ct) =>
        ChangeAsync(shopId, id, ct, (order, now, userId) =>
        {
            if (order.PaymentStatus != PaymentStatus.AwaitingVerification || order.Status == OrderStatus.Cancelled)
                return this.ApiError(StatusCodes.Status409Conflict, "nothing_to_verify", "There is no payment waiting to be checked on this order.");

            order.PaymentStatus = PaymentStatus.Paid;
            order.PaymentVerifiedByUserId = userId;
            order.PaymentVerifiedAt = now;
            order.Events.Add(new OrderEvent { At = now, Title = "Payment confirmed", Note = $"₹{order.Total:0.##} received by UPI", ActorUserId = userId });
            return null;
        }, async order =>
        {
            await audit.WriteAsync("order.payment_verified",
                $"Confirmed UPI payment of ₹{order.Total:0.##} for order {order.DisplayNumber} (ref {order.UpiReference})", "order", order.Id, ct: ct);
            await ToCustomerAsync(order, $"The shop confirmed your UPI payment of ₹{order.Total:0.##}.", ct);
        });

    /// <summary>The shop could not find the money. The customer can send proof again.</summary>
    [HttpPost("{id:guid}/payment/reject")]
    public Task<IActionResult> RejectPayment(Guid shopId, Guid id, ReasonRequest request, CancellationToken ct) =>
        ChangeAsync(shopId, id, ct, (order, now, userId) =>
        {
            if (order.PaymentStatus != PaymentStatus.AwaitingVerification || order.Status == OrderStatus.Cancelled)
                return this.ApiError(StatusCodes.Status409Conflict, "nothing_to_verify", "There is no payment waiting to be checked on this order.");

            order.PaymentStatus = PaymentStatus.Rejected;
            order.PaymentRejectReason = request.Reason.Trim();
            order.Events.Add(new OrderEvent { At = now, Title = "Payment not found", Note = order.PaymentRejectReason, ActorUserId = userId });
            return null;
        }, async order =>
        {
            await audit.WriteAsync("order.payment_rejected",
                $"Rejected UPI payment for order {order.DisplayNumber} (ref {order.UpiReference}): {order.PaymentRejectReason}", "order", order.Id, ct: ct);
            await ToCustomerAsync(order, $"The shop could not find your UPI payment: {order.PaymentRejectReason}. Please check and send it again.", ct);
        });

    private Task ToCustomerAsync(Order order, string body, CancellationToken ct) =>
        notifier.ToUserAsync(order.CustomerId, $"Order {order.DisplayNumber} from {order.Shop.Name}", body, $"/orders/{order.Id}", ct);

    /// <summary>Shared checks and saving for every change a shop makes to an order.</summary>
    private async Task<IActionResult> ChangeAsync(
        Guid shopId, Guid id, CancellationToken ct,
        Func<Order, DateTimeOffset, Guid, IActionResult?> change, Func<Order, Task>? afterSave = null)
    {
        var userId = User.GetUserId();
        if (await access.RoleAsync(shopId, userId, ct) is null)
            return NotFound();
        if (!await access.IsActiveAsync(shopId, ct))
            return this.ShopDeactivated();
        var order = await LoadAsync(shopId, id, tracking: true, ct);
        if (order is null)
            return NotFound();

        var now = clock.GetUtcNow();
        if (change(order, now, userId) is { } refusal)
            return refusal;
        order.UpdatedAt = now;
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return this.ApiError(StatusCodes.Status409Conflict, "order_changed", "This order has just changed. Please reload and try again.");
        }
        if (afterSave is not null)
            await afterSave(order);
        return Ok(OrderDto.From(order));
    }

    private Task<Order?> LoadAsync(Guid shopId, Guid id, bool tracking, CancellationToken ct)
    {
        var query = db.Orders.Include(o => o.Shop).Include(o => o.Items).Include(o => o.Events).AsQueryable();
        if (!tracking)
            query = query.AsNoTracking();
        return query.SingleOrDefaultAsync(o => o.Id == id && o.ShopId == shopId, ct);
    }
}
