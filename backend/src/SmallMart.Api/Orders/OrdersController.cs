using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmallMart.Api.Auth;
using SmallMart.Api.Data;
using SmallMart.Api.Domain;
using SmallMart.Api.Inventory;
using SmallMart.Api.Notifications;
using SmallMart.Api.Storage;

namespace SmallMart.Api.Orders;

/// <summary>A customer's own orders: placing, paying by UPI, following and cancelling.</summary>
[ApiController]
[Route("api/orders")]
[Authorize]
public partial class OrdersController(
    AppDbContext db, ImageStorage images, StockService stock, Notifier notifier, TimeProvider clock) : ControllerBase
{
    [HttpGet("mine")]
    public async Task<IReadOnlyList<OrderSummaryDto>> Mine(
        [FromQuery] int skip = 0, [FromQuery] int take = 50, CancellationToken ct = default)
    {
        var userId = User.GetUserId();
        var orders = await db.Orders.AsNoTracking().Include(o => o.Shop).Include(o => o.Items)
            .Where(o => o.CustomerId == userId)
            .OrderByDescending(o => o.CreatedAt).ThenByDescending(o => o.Number)
            .Skip(Math.Max(skip, 0)).Take(Math.Clamp(take, 1, 100))
            .ToListAsync(ct);
        return orders.Select(OrderSummaryDto.From).ToList();
    }

    /// <summary>The delivery details of the customer's latest order, to fill in the next checkout. 204 when there is none.</summary>
    [HttpGet("last-address")]
    public async Task<IActionResult> LastAddress(CancellationToken ct)
    {
        var userId = User.GetUserId();
        var address = await db.Orders.AsNoTracking().Where(o => o.CustomerId == userId)
            .OrderByDescending(o => o.CreatedAt)
            .Select(o => new DeliveryAddressDto(o.CustomerName, o.Phone, o.AddressLine, o.City, o.Pincode))
            .FirstOrDefaultAsync(ct);
        return address is null ? NoContent() : Ok(address);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var order = await LoadAsync(id, tracking: false, ct);
        return order is null ? NotFound() : Ok(OrderDto.From(order));
    }

    [HttpPost]
    public async Task<IActionResult> Place(PlaceOrderRequest request, CancellationToken ct)
    {
        if (!Enum.TryParse<PaymentMethod>(request.PaymentMethod, out var method) || !Enum.IsDefined(method))
            return this.ApiError(StatusCodes.Status400BadRequest, "invalid_payment_method", "Choose cash on delivery or UPI.");

        var shop = await db.Shops.AsNoTracking().SingleOrDefaultAsync(s => s.Id == request.ShopId && s.IsActive, ct);
        if (shop is null)
            return this.ApiError(StatusCodes.Status404NotFound, "shop_unavailable", "This shop is not available.");
        if (!shop.IsOpen)
            return this.ApiError(StatusCodes.Status409Conflict, "shop_closed", "This shop is closed right now. Please try again later.");
        if (method == PaymentMethod.Upi && shop.UpiId is null)
            return this.ApiError(StatusCodes.Status409Conflict, "upi_unavailable", "This shop does not accept UPI. Choose cash on delivery.");

        // The same item sent twice is added up.
        var quantities = request.Items.GroupBy(l => l.ItemId).ToDictionary(g => g.Key, g => g.Sum(l => l.Quantity));
        if (quantities.Values.Any(q => q > 99))
            return this.ApiError(StatusCodes.Status400BadRequest, "invalid_quantity", "You can order up to 99 of one item.");

        // Prices always come from the database, never from the request.
        var ids = quantities.Keys.ToList();
        var items = await db.Items.AsNoTracking()
            .Where(i => ids.Contains(i.Id) && i.ShopId == shop.Id && i.IsActive)
            .ToListAsync(ct);
        if (items.Count != ids.Count)
            return this.ApiError(StatusCodes.Status409Conflict, "items_unavailable",
                "Some items in your cart are no longer available. Please review your cart.");

        var short_ = items.Where(i => i.TrackStock && i.StockQuantity < quantities[i.Id]).ToList();
        if (short_.Count > 0)
            return OutOfStock(short_.Select(i => i.StockQuantity <= 0 ? $"{i.Name} is out of stock" : $"only {i.StockQuantity} left of {i.Name}"));

        var now = clock.GetUtcNow();
        var order = new Order
        {
            Id = Guid.NewGuid(),
            ShopId = shop.Id,
            CustomerId = User.GetUserId(),
            Status = OrderStatus.Placed,
            PaymentMethod = method,
            PaymentStatus = PaymentStatus.Pending,
            DeliveryFee = shop.DeliveryFee,
            CustomerName = request.CustomerName.Trim(),
            Phone = request.Phone.Trim(),
            AddressLine = request.AddressLine.Trim(),
            City = request.City.Trim(),
            Pincode = request.Pincode,
            Note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim(),
            CreatedAt = now,
            UpdatedAt = now,
        };
        foreach (var item in items)
        {
            var quantity = quantities[item.Id];
            order.Items.Add(new OrderItem
            {
                Id = Guid.NewGuid(),
                ItemId = item.Id,
                Name = item.Name,
                Unit = item.Unit,
                UnitPrice = item.Price,
                Quantity = quantity,
                LineTotal = item.Price * quantity,
            });
        }
        order.Subtotal = order.Items.Sum(i => i.LineTotal);
        order.Total = order.Subtotal + order.DeliveryFee;

        if (order.Subtotal < shop.MinimumOrder)
            return this.ApiError(StatusCodes.Status409Conflict, "below_minimum",
                $"The minimum order for this shop is ₹{shop.MinimumOrder:0.##}.");
        if (request.ExpectedTotal is { } expected && expected != order.Total)
            return this.ApiError(StatusCodes.Status409Conflict, "cart_changed",
                $"Prices have changed. The new total is ₹{order.Total:0.##}. Please review your cart.");

        order.Events.Add(new OrderEvent
        {
            At = now,
            Title = "Order placed",
            Note = method == PaymentMethod.Upi ? "Waiting for UPI payment" : "Pay cash on delivery",
            ActorUserId = order.CustomerId,
        });
        // The order and its stock are saved together or not at all.
        var lines = items.Select(i => new StockService.Line(i.Id, i.Name, quantities[i.Id])).ToList();
        await using (var transaction = await db.Database.BeginTransactionAsync(ct))
        {
            db.Orders.Add(order);
            await db.SaveChangesAsync(ct);
            if (await stock.TakeForOrderAsync(shop.Id, order.Id, order.CustomerId, lines, ct) is { } soldOut)
            {
                await transaction.RollbackAsync(ct);
                return OutOfStock([$"{soldOut} has just sold out or has too few left"]);
            }
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
        }

        order.Shop = shop;
        await notifier.ToShopAsync(shop.Id, $"New order {order.DisplayNumber}",
            $"{order.CustomerName} ordered {order.Items.Sum(i => i.Quantity)} item(s) for ₹{order.Total:0.##}" +
            (method == PaymentMethod.Upi ? ", paying by UPI." : ", cash on delivery."),
            $"/shops/{shop.Id}/orders/{order.Id}", ct);
        await stock.WarnIfLowAsync(shop.Id, lines, ct);
        return CreatedAtAction(nameof(Get), new { id = order.Id }, OrderDto.From(order));
    }

    /// <summary>
    /// The customer says they have paid by UPI: the transaction reference (form field "reference") and a
    /// screenshot (form field "file"). The shop then checks its bank or UPI app and confirms or rejects.
    /// </summary>
    [HttpPost("{id:guid}/upi-proof")]
    [RequestSizeLimit(ImageStorage.MaxBytes + 64 * 1024)]
    public async Task<IActionResult> SubmitUpiProof(Guid id, [FromForm] string? reference, IFormFile? file, CancellationToken ct)
    {
        var order = await LoadAsync(id, tracking: true, ct);
        if (order is null)
            return NotFound();
        if (order.PaymentMethod != PaymentMethod.Upi)
            return this.ApiError(StatusCodes.Status409Conflict, "not_upi", "This order is not paid by UPI.");
        if (order.Status is OrderStatus.Cancelled or OrderStatus.Delivered)
            return this.ApiError(StatusCodes.Status409Conflict, "order_closed", "This order is already closed.");
        if (order.PaymentStatus is PaymentStatus.Paid or PaymentStatus.AwaitingVerification)
            return this.ApiError(StatusCodes.Status409Conflict, "proof_not_needed",
                order.PaymentStatus == PaymentStatus.Paid ? "This order is already paid." : "The shop is already checking your payment.");

        reference = reference?.Trim().ToUpperInvariant() ?? string.Empty;
        if (!UpiReferencePattern().IsMatch(reference))
            return this.ApiError(StatusCodes.Status400BadRequest, "invalid_reference",
                "Enter the UPI transaction ID (UTR) shown in your UPI app, usually 12 digits.");
        if (await db.Orders.AnyAsync(o => o.UpiReference == reference && o.Id != id, ct))
            return this.ApiError(StatusCodes.Status409Conflict, "reference_used", "This UPI transaction ID was already used for another order.");
        if (file is null)
            return this.ApiError(StatusCodes.Status400BadRequest, "invalid_image", "Attach a screenshot of the payment.");

        var path = await images.SaveAsync(file, $"upi/{order.ShopId:N}", ct, isPrivate: true);
        if (path is null)
            return this.ApiError(StatusCodes.Status400BadRequest, "invalid_image", "Upload a JPEG, PNG or WebP screenshot up to 5 MB.");

        var previous = order.UpiScreenshotPath;
        var now = clock.GetUtcNow();
        order.UpiReference = reference;
        order.UpiScreenshotPath = path;
        order.UpiSubmittedAt = now;
        order.PaymentStatus = PaymentStatus.AwaitingVerification;
        order.PaymentRejectReason = null;
        order.UpdatedAt = now;
        order.Events.Add(new OrderEvent { At = now, Title = "Payment proof sent", Note = $"UPI transaction ID {reference}", ActorUserId = order.CustomerId });
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Lost a race: another order took this reference, or the order changed meanwhile.
            images.Delete(path, isPrivate: true);
            return this.ApiError(StatusCodes.Status409Conflict, "order_changed", "This order has just changed. Please reload and try again.");
        }
        images.Delete(previous, isPrivate: true);
        await notifier.ToShopAsync(order.ShopId, $"Check UPI payment for {order.DisplayNumber}",
            $"{order.CustomerName} says they paid ₹{order.Total:0.##} (transaction ID {reference}).",
            $"/shops/{order.ShopId}/orders/{order.Id}", ct);
        return Ok(OrderDto.From(order));
    }

    /// <summary>The payment screenshot, for the customer who sent it.</summary>
    [HttpGet("{id:guid}/upi-proof")]
    public async Task<IActionResult> UpiProof(Guid id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        var path = await db.Orders.Where(o => o.Id == id && o.CustomerId == userId)
            .Select(o => o.UpiScreenshotPath).SingleOrDefaultAsync(ct);
        return images.OpenPrivate(path) is { } image ? File(image.Content, image.ContentType) : NotFound();
    }

    /// <summary>A customer can cancel only until the shop accepts the order.</summary>
    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id, CancellationToken ct)
    {
        var order = await LoadAsync(id, tracking: true, ct);
        if (order is null)
            return NotFound();
        if (order.Status != OrderStatus.Placed)
            return this.ApiError(StatusCodes.Status409Conflict, "cannot_cancel",
                "This order can no longer be cancelled here. Please call the shop.");

        var now = clock.GetUtcNow();
        order.Status = OrderStatus.Cancelled;
        order.CancelReason = "Cancelled by customer";
        order.UpdatedAt = now;
        order.Events.Add(new OrderEvent
        {
            At = now,
            Title = "Cancelled by customer",
            Note = order.PaymentStatus is PaymentStatus.Paid or PaymentStatus.AwaitingVerification
                ? "A UPI payment was sent for this order. The shop will refund it." : null,
            ActorUserId = order.CustomerId,
        });
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return this.ApiError(StatusCodes.Status409Conflict, "order_changed", "This order has just changed. Please reload and try again.");
        }
        await stock.ReturnForOrderAsync(order, order.CustomerId, ct);
        await notifier.ToShopAsync(order.ShopId, $"Order {order.DisplayNumber} cancelled",
            $"{order.CustomerName} cancelled the order.", $"/shops/{order.ShopId}/orders/{order.Id}", ct);
        return Ok(OrderDto.From(order));
    }

    private ObjectResult OutOfStock(IEnumerable<string> problems) =>
        this.ApiError(StatusCodes.Status409Conflict, "insufficient_stock",
            $"Not enough stock: {string.Join("; ", problems)}. Please review your cart.");

    private Task<Order?> LoadAsync(Guid id, bool tracking, CancellationToken ct)
    {
        var userId = User.GetUserId();
        var query = db.Orders.Include(o => o.Shop).Include(o => o.Items).Include(o => o.Events).AsQueryable();
        if (!tracking)
            query = query.AsNoTracking();
        return query.SingleOrDefaultAsync(o => o.Id == id && o.CustomerId == userId, ct);
    }

    [GeneratedRegex("^[A-Z0-9]{8,35}$")]
    private static partial Regex UpiReferencePattern();
}
