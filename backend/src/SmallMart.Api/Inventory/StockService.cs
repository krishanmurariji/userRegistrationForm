using Microsoft.EntityFrameworkCore;
using SmallMart.Api.Data;
using SmallMart.Api.Domain;
using SmallMart.Api.Notifications;

namespace SmallMart.Api.Inventory;

/// <summary>
/// The only place stock numbers change. Every change is done in the database in one statement, so two
/// customers buying the last unit at the same moment cannot both get it, and each change is written to the history.
/// </summary>
public class StockService(AppDbContext db, Notifier notifier, TimeProvider clock)
{
    public record Line(Guid ItemId, string Name, int Quantity);

    /// <summary>
    /// Takes stock for an order. Call inside the transaction that saves the order.
    /// Returns the name of the first item that did not have enough, or null when everything was taken.
    /// Items the shop does not count are skipped.
    /// </summary>
    public async Task<string?> TakeForOrderAsync(Guid shopId, Guid orderId, Guid actorId, IEnumerable<Line> lines, CancellationToken ct)
    {
        foreach (var line in lines)
        {
            var taken = await db.Items
                .Where(i => i.Id == line.ItemId && i.TrackStock && i.StockQuantity >= line.Quantity)
                .ExecuteUpdateAsync(s => s.SetProperty(i => i.StockQuantity, i => i.StockQuantity - line.Quantity), ct);
            if (taken == 0)
            {
                if (await db.Items.AnyAsync(i => i.Id == line.ItemId && i.TrackStock, ct))
                    return line.Name;
                continue; // not counted
            }
            await RecordAsync(shopId, line.ItemId, -line.Quantity, StockReason.Sale, null, orderId, actorId, ct);
        }
        return null;
    }

    /// <summary>Puts an order's stock back after it was cancelled.</summary>
    public async Task ReturnForOrderAsync(Order order, Guid actorId, CancellationToken ct)
    {
        foreach (var line in order.Items.Where(i => i.ItemId is not null))
        {
            var itemId = line.ItemId!.Value;
            var returned = await db.Items.Where(i => i.Id == itemId && i.TrackStock)
                .ExecuteUpdateAsync(s => s.SetProperty(i => i.StockQuantity, i => i.StockQuantity + line.Quantity), ct);
            if (returned > 0)
                await RecordAsync(order.ShopId, itemId, line.Quantity, StockReason.OrderCancelled, null, order.Id, actorId, ct);
        }
        await db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// A change made by hand. Returns the new quantity, or null when it would take stock below zero.
    /// </summary>
    public async Task<int?> AdjustAsync(Item item, int change, StockReason reason, string? note, Guid actorId, CancellationToken ct)
    {
        if (change != 0)
        {
            var done = await db.Items
                .Where(i => i.Id == item.Id && i.StockQuantity + change >= 0)
                .ExecuteUpdateAsync(s => s.SetProperty(i => i.StockQuantity, i => i.StockQuantity + change), ct);
            if (done == 0)
                return null;
        }
        var after = await RecordAsync(item.ShopId, item.Id, change, reason, note, null, actorId, ct);
        await db.SaveChangesAsync(ct);
        return after;
    }

    /// <summary>Sets the stock to a counted number, retrying if an order changes it at the same moment.</summary>
    public async Task<int> SetToAsync(Item item, int quantity, StockReason reason, string? note, Guid actorId, CancellationToken ct)
    {
        for (var attempt = 0; ; attempt++)
        {
            var current = await db.Items.Where(i => i.Id == item.Id).Select(i => i.StockQuantity).SingleAsync(ct);
            var done = await db.Items.Where(i => i.Id == item.Id && i.StockQuantity == current)
                .ExecuteUpdateAsync(s => s.SetProperty(i => i.StockQuantity, quantity), ct);
            if (done == 0 && attempt < 5)
                continue;
            db.StockMovements.Add(new StockMovement
            {
                ShopId = item.ShopId, ItemId = item.Id, Change = quantity - current, QuantityAfter = quantity,
                Reason = reason, Note = note, ActorUserId = actorId, At = clock.GetUtcNow(),
            });
            await db.SaveChangesAsync(ct);
            return quantity;
        }
    }

    /// <summary>
    /// Tells the shop about items that an order just took to, or below, their warning level.
    /// Call after the order is saved.
    /// </summary>
    public async Task WarnIfLowAsync(Guid shopId, IEnumerable<Line> lines, CancellationToken ct)
    {
        var quantities = lines.ToDictionary(l => l.ItemId, l => l.Quantity);
        var ids = quantities.Keys.ToList();
        var items = await db.Items.AsNoTracking()
            .Where(i => ids.Contains(i.Id) && i.TrackStock && i.StockQuantity <= i.LowStockThreshold)
            .Select(i => new { i.Id, i.Name, i.StockQuantity, i.LowStockThreshold })
            .ToListAsync(ct);
        foreach (var item in items)
        {
            // Warn once, when this order crossed the line, and again when the last unit goes.
            var before = item.StockQuantity + quantities[item.Id];
            if (before <= item.LowStockThreshold && item.StockQuantity > 0)
                continue;
            await notifier.ToShopAsync(shopId,
                item.StockQuantity == 0 ? $"Out of stock: {item.Name}" : $"Low stock: {item.Name}",
                item.StockQuantity == 0 ? "Customers can no longer order it. Add stock to sell it again." : $"Only {item.StockQuantity} left.",
                $"/shops/{shopId}/items/{item.Id}/stock", ct);
        }
    }

    /// <summary>Adds a history row using the quantity now in the database. The caller saves.</summary>
    private async Task<int> RecordAsync(
        Guid shopId, Guid itemId, int change, StockReason reason, string? note, Guid? orderId, Guid actorId, CancellationToken ct)
    {
        var after = await db.Items.Where(i => i.Id == itemId).Select(i => i.StockQuantity).SingleAsync(ct);
        db.StockMovements.Add(new StockMovement
        {
            ShopId = shopId, ItemId = itemId, Change = change, QuantityAfter = after,
            Reason = reason, Note = note, OrderId = orderId, ActorUserId = actorId, At = clock.GetUtcNow(),
        });
        return after;
    }
}
