using Microsoft.EntityFrameworkCore;
using SmallMart.Api.Data;
using SmallMart.Api.Domain;

namespace SmallMart.Api.Notifications;

/// <summary>
/// Writes in-app notifications. Call it after the main change has been saved: a notification must never be
/// the reason an order or payment fails, so problems here are logged and swallowed.
/// </summary>
public class Notifier(AppDbContext db, TimeProvider clock, ILogger<Notifier> logger)
{
    public Task ToUserAsync(Guid userId, string title, string body, string? link, CancellationToken ct = default) =>
        SendAsync([userId], title, body, link, ct);

    /// <summary>Everyone who works in the shop.</summary>
    public async Task ToShopAsync(Guid shopId, string title, string body, string? link, CancellationToken ct = default)
    {
        try
        {
            var members = await db.ShopMembers.Where(m => m.ShopId == shopId).Select(m => m.UserId).ToListAsync(ct);
            await SendAsync(members, title, body, link, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Could not notify shop {ShopId}: {Title}", shopId, title);
        }
    }

    private async Task SendAsync(IReadOnlyCollection<Guid> userIds, string title, string body, string? link, CancellationToken ct)
    {
        if (userIds.Count == 0)
            return;
        try
        {
            var now = clock.GetUtcNow();
            db.Notifications.AddRange(userIds.Distinct().Select(userId => new Notification
            {
                UserId = userId,
                Title = Truncate(title, 120),
                Body = Truncate(body, 400),
                Link = link,
                CreatedAt = now,
            }));
            await db.SaveChangesAsync(ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Could not save notification: {Title}", title);
        }
    }

    private static string Truncate(string value, int max) => value.Length <= max ? value : value[..max];
}
