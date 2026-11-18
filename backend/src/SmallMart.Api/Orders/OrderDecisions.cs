using Microsoft.EntityFrameworkCore;
using SmallMart.Api.Audit;
using SmallMart.Api.Data;
using SmallMart.Api.Domain;
using SmallMart.Api.Inventory;
using SmallMart.Api.Notifications;

namespace SmallMart.Api.Orders;

/// <summary>The result of accepting or declining: the updated order, or why it could not be done.</summary>
public record DecisionResult(Order? Order, int Status = 200, string? Code = null, string? Message = null)
{
    public bool Ok => Order is not null && Code is null;
    public static DecisionResult Fail(int status, string code, string message) => new(null, status, code, message);
}

/// <summary>
/// Accepts or declines a new order in one step, used by the full-screen alert in the app and by the buttons on the
/// phone notification. Accepting a UPI order whose payment proof has arrived also confirms the payment.
/// </summary>
public class OrderDecisions(AppDbContext db, AuditLog audit, StockService stock, Notifier notifier, TimeProvider clock)
{
    public async Task<DecisionResult> AcceptAsync(Guid orderId, Guid userId, CancellationToken ct)
    {
        var (order, refusal) = await LoadAsync(orderId, userId, ct);
        if (refusal is not null)
            return refusal;
        if (order!.Status != OrderStatus.Placed)
            return AlreadyHandled(order);
        if (order.PaymentMethod == PaymentMethod.Upi && order.PaymentStatus is not (PaymentStatus.Paid or PaymentStatus.AwaitingVerification))
            return DecisionResult.Fail(409, "payment_not_received", "The customer has not sent the UPI payment yet.");

        var now = clock.GetUtcNow();
        var confirmedPayment = false;
        if (order.PaymentMethod == PaymentMethod.Upi && order.PaymentStatus == PaymentStatus.AwaitingVerification)
        {
            order.PaymentStatus = PaymentStatus.Paid;
            order.PaymentVerifiedByUserId = userId;
            order.PaymentVerifiedAt = now;
            order.Events.Add(new OrderEvent { At = now, Title = "Payment confirmed", Note = $"₹{order.Total:0.##} received by UPI", ActorUserId = userId });
            confirmedPayment = true;
        }
        order.Status = OrderStatus.Accepted;
        order.Events.Add(new OrderEvent { At = now, Title = "Order accepted", ActorUserId = userId });
        order.UpdatedAt = now;
        if (await SaveAsync(ct) is { } conflict)
            return conflict;

        if (confirmedPayment)
            await audit.WriteAsync("order.payment_verified",
                $"Confirmed UPI payment of ₹{order.Total:0.##} for order {order.DisplayNumber} (ref {order.UpiReference})", "order", order.Id, userId, ct: ct);
        await ToCustomerAsync(order, confirmedPayment
            ? $"The shop confirmed your UPI payment of ₹{order.Total:0.##} and accepted your order."
            : "The shop accepted your order and is preparing it.", ct);
        return new DecisionResult(order);
    }

    public async Task<DecisionResult> DeclineAsync(Guid orderId, Guid userId, string reason, CancellationToken ct)
    {
        reason = string.IsNullOrWhiteSpace(reason) ? "The shop cannot take this order right now" : reason.Trim();
        if (reason.Length > 300)
            reason = reason[..300];
        var (order, refusal) = await LoadAsync(orderId, userId, ct);
        if (refusal is not null)
            return refusal;
        if (order!.Status != OrderStatus.Placed)
            return AlreadyHandled(order);

        var now = clock.GetUtcNow();
        var refund = order.PaymentMethod == PaymentMethod.Upi && order.PaymentStatus is PaymentStatus.Paid or PaymentStatus.AwaitingVerification;
        order.Status = OrderStatus.Cancelled;
        order.CancelReason = reason;
        order.Events.Add(new OrderEvent
        {
            At = now,
            Title = "Cancelled by shop",
            Note = reason + (refund ? $". Refund ₹{order.Total:0.##} to the customer by UPI." : string.Empty),
            ActorUserId = userId,
        });
        order.UpdatedAt = now;
        if (await SaveAsync(ct) is { } conflict)
            return conflict;

        await stock.ReturnForOrderAsync(order, userId, ct);
        await ToCustomerAsync(order, $"The shop cancelled your order: {reason}", ct);
        return new DecisionResult(order);
    }

    private async Task<(Order?, DecisionResult?)> LoadAsync(Guid orderId, Guid userId, CancellationToken ct)
    {
        var order = await db.Orders.Include(o => o.Shop).Include(o => o.Items).Include(o => o.Events)
            .SingleOrDefaultAsync(o => o.Id == orderId, ct);
        if (order is null || !await db.ShopMembers.AnyAsync(m => m.ShopId == order.ShopId && m.UserId == userId, ct))
            return (null, DecisionResult.Fail(404, "not_found", "This order was not found."));
        if (!order.Shop.IsActive)
            return (null, DecisionResult.Fail(403, "shop_deactivated", "This shop has been deactivated by the platform admin."));
        return (order, null);
    }

    private static DecisionResult AlreadyHandled(Order order) => DecisionResult.Fail(409, "already_handled",
        order.Status == OrderStatus.Cancelled ? "This order was already cancelled." : "This order was already accepted.");

    private async Task<DecisionResult?> SaveAsync(CancellationToken ct)
    {
        try
        {
            await db.SaveChangesAsync(ct);
            return null;
        }
        catch (DbUpdateConcurrencyException)
        {
            return DecisionResult.Fail(409, "order_changed", "This order has just changed. Please reload and try again.");
        }
    }

    private Task ToCustomerAsync(Order order, string body, CancellationToken ct) =>
        notifier.ToUserAsync(order.CustomerId, $"Order {order.DisplayNumber} from {order.Shop.Name}", body, $"/orders/{order.Id}", ct);
}
