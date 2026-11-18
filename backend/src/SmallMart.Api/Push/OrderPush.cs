using System.Threading.Channels;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using SmallMart.Api.Data;
using SmallMart.Api.Domain;

namespace SmallMart.Api.Push;

/// <summary>
/// Queues "new order" pushes so placing an order never waits on Firebase. A background worker sends them to the phones
/// of everyone who works in the shop.
/// </summary>
public class OrderPushQueue
{
    private readonly Channel<Guid> _orders = Channel.CreateBounded<Guid>(new BoundedChannelOptions(1000) { FullMode = BoundedChannelFullMode.DropOldest });
    public void NewOrder(Guid orderId) => _orders.Writer.TryWrite(orderId);
    public ChannelReader<Guid> Reader => _orders.Reader;
}

/// <summary>
/// Signs the short-lived code a notification's Accept and Decline buttons send back, so the phone can act on the order
/// without the app being open. The code names one order and one person and expires after a few hours.
/// </summary>
public class OrderActionTokens(IDataProtectionProvider provider)
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromHours(6);
    private readonly ITimeLimitedDataProtector _protector = provider.CreateProtector("SmallMart.OrderAction.v1").ToTimeLimitedDataProtector();

    public string Create(Guid orderId, Guid userId) => _protector.Protect($"{orderId:N}|{userId:N}", Lifetime);

    public (Guid OrderId, Guid UserId)? Read(string token)
    {
        try
        {
            var parts = _protector.Unprotect(token).Split('|');
            return parts.Length == 2 && Guid.TryParse(parts[0], out var order) && Guid.TryParse(parts[1], out var user) ? (order, user) : null;
        }
        catch (Exception)
        {
            return null;
        }
    }
}

public class OrderPushWorker(OrderPushQueue queue, IServiceScopeFactory scopes, IPushTransport transport, ILogger<OrderPushWorker> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var orderId in queue.Reader.ReadAllAsync(stoppingToken))
        {
            if (!transport.IsConfigured)
                continue;
            try
            {
                await SendAsync(orderId, stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Could not send the push for order {OrderId}", orderId);
            }
        }
    }

    private async Task SendAsync(Guid orderId, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var tokens = scope.ServiceProvider.GetRequiredService<OrderActionTokens>();

        var order = await db.Orders.AsNoTracking().Include(o => o.Shop).Include(o => o.Items).SingleOrDefaultAsync(o => o.Id == orderId, ct);
        if (order is null || order.Status != OrderStatus.Placed)
            return;
        var devices = await db.DeviceTokens.AsNoTracking()
            .Where(d => db.ShopMembers.Any(m => m.ShopId == order.ShopId && m.UserId == d.UserId))
            .ToListAsync(ct);
        if (devices.Count == 0)
            return;

        var count = order.Items.Sum(i => i.Quantity);
        var lines = string.Join(", ", order.Items.Take(4).Select(i => $"{i.Quantity}× {i.Name}")) + (order.Items.Count > 4 ? $" +{order.Items.Count - 4} more" : "");
        var payment = order.PaymentMethod == PaymentMethod.Upi ? "Paid by UPI, check your UPI app" : "Cash on delivery";
        var dead = new List<long>();
        foreach (var device in devices)
        {
            var data = new Dictionary<string, string>
            {
                ["type"] = "new_order",
                ["orderId"] = order.Id.ToString(),
                ["shopId"] = order.ShopId.ToString(),
                ["number"] = order.DisplayNumber,
                ["title"] = $"New order {order.DisplayNumber} · ₹{order.Total:0.##}",
                ["body"] = $"{order.CustomerName} · {count} {(count == 1 ? "item" : "items")} · {payment}",
                ["lines"] = lines,
                ["shopName"] = order.Shop.Name,
                ["acceptLabel"] = order.PaymentMethod == PaymentMethod.Upi ? "Paid · Accept" : "Accept",
                ["actionToken"] = tokens.Create(order.Id, device.UserId),
            };
            if (await transport.SendAsync(device.Token, data, ct) == PushResult.Unregistered)
                dead.Add(device.Id);
        }
        if (dead.Count > 0)
            await db.DeviceTokens.Where(d => dead.Contains(d.Id)).ExecuteDeleteAsync(ct);
    }
}
