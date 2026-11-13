using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmallMart.Api.Auth;
using SmallMart.Api.Data;

namespace SmallMart.Api.Notifications;

public record NotificationDto(long Id, string Title, string Body, string? Link, DateTimeOffset CreatedAt, bool Read);

public record NotificationListDto(IReadOnlyList<NotificationDto> Items, int Unread);

/// <summary>The signed-in user's own notifications.</summary>
[ApiController]
[Route("api/notifications")]
[Authorize]
public class NotificationsController(AppDbContext db, TimeProvider clock) : ControllerBase
{
    /// <summary>The newest notifications and how many are unread in total.</summary>
    [HttpGet]
    public async Task<NotificationListDto> List([FromQuery] int take = 50, CancellationToken ct = default)
    {
        var userId = User.GetUserId();
        var items = await db.Notifications.AsNoTracking().Where(n => n.UserId == userId)
            .OrderByDescending(n => n.Id).Take(Math.Clamp(take, 1, 100))
            .Select(n => new NotificationDto(n.Id, n.Title, n.Body, n.Link, n.CreatedAt, n.ReadAt != null))
            .ToListAsync(ct);
        return new NotificationListDto(items, await UnreadAsync(userId, ct));
    }

    /// <summary>Just the unread number, for the bell in the header.</summary>
    [HttpGet("unread-count")]
    public async Task<IActionResult> UnreadCount(CancellationToken ct) =>
        Ok(new { Unread = await UnreadAsync(User.GetUserId(), ct) });

    [HttpPost("{id:long}/read")]
    public async Task<IActionResult> MarkRead(long id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        var now = clock.GetUtcNow();
        var changed = await db.Notifications.Where(n => n.Id == id && n.UserId == userId && n.ReadAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.ReadAt, now), ct);
        if (changed == 0 && !await db.Notifications.AnyAsync(n => n.Id == id && n.UserId == userId, ct))
            return NotFound();
        return NoContent();
    }

    [HttpPost("read-all")]
    public async Task<IActionResult> MarkAllRead(CancellationToken ct)
    {
        var userId = User.GetUserId();
        var now = clock.GetUtcNow();
        await db.Notifications.Where(n => n.UserId == userId && n.ReadAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.ReadAt, now), ct);
        return NoContent();
    }

    private Task<int> UnreadAsync(Guid userId, CancellationToken ct) =>
        db.Notifications.CountAsync(n => n.UserId == userId && n.ReadAt == null, ct);
}
