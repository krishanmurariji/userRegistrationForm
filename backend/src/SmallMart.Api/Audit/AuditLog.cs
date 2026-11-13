using SmallMart.Api.Auth;
using SmallMart.Api.Data;

namespace SmallMart.Api.Audit;

/// <summary>One line in the admin activity log: who did what, to what, from where.</summary>
public class AuditEntry
{
    public long Id { get; set; }
    public DateTimeOffset At { get; set; }
    public Guid? ActorUserId { get; set; }
    public string? ActorEmail { get; set; }
    /// <summary>Dotted name such as "user.signed_in" or "shop.deactivated".</summary>
    public string Action { get; set; } = string.Empty;
    public string? TargetType { get; set; }
    public string? TargetId { get; set; }
    /// <summary>Human-readable description shown in the admin screen.</summary>
    public string Summary { get; set; } = string.Empty;
    public string? IpAddress { get; set; }
}

public class AuditLog(AppDbContext db, IHttpContextAccessor http, TimeProvider clock)
{
    /// <summary>
    /// Records an event. The actor defaults to the signed-in user of the current request; pass
    /// <paramref name="actorId"/> and <paramref name="actorEmail"/> for sign-in events, where nobody is signed in yet.
    /// </summary>
    public async Task WriteAsync(
        string action, string summary, string? targetType = null, object? targetId = null,
        Guid? actorId = null, string? actorEmail = null, CancellationToken ct = default)
    {
        var context = http.HttpContext;
        var user = context?.User;
        if (actorId is null && user?.Identity?.IsAuthenticated == true)
        {
            actorId = user.GetUserId();
            actorEmail ??= user.FindFirst("email")?.Value;
        }

        db.AuditEntries.Add(new AuditEntry
        {
            At = clock.GetUtcNow(),
            ActorUserId = actorId,
            ActorEmail = Truncate(actorEmail, 256),
            Action = action,
            TargetType = targetType,
            TargetId = targetId?.ToString(),
            Summary = Truncate(summary, 500)!,
            IpAddress = context?.Connection.RemoteIpAddress?.ToString(),
        });
        await db.SaveChangesAsync(ct);
    }

    private static string? Truncate(string? value, int max) =>
        value is null || value.Length <= max ? value : value[..max];
}
