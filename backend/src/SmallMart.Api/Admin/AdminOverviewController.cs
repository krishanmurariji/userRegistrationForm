using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmallMart.Api.Auth;
using SmallMart.Api.Data;

namespace SmallMart.Api.Admin;

[ApiController]
[Route("api/admin")]
[Authorize(Roles = Roles.PlatformAdmin)]
public class AdminOverviewController(AppDbContext db, TimeProvider clock) : ControllerBase
{
    /// <summary>Headline numbers for the admin dashboard.</summary>
    [HttpGet("stats")]
    public async Task<AdminStatsDto> Stats(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var suspendedAfter = now.AddYears(1);
        var weekAgo = now.AddDays(-7);
        var dayAgo = now.AddDays(-1);

        Task<int> InRole(string role) => db.UserRoles.CountAsync(
            ur => db.Roles.Any(r => r.Id == ur.RoleId && r.Name == role), ct);

        return new AdminStatsDto(
            TotalUsers: await db.Users.CountAsync(ct),
            Customers: await InRole(Roles.Customer),
            ShopOwners: await InRole(Roles.ShopOwner),
            SuspendedUsers: await db.Users.CountAsync(u => u.LockoutEnd != null && u.LockoutEnd > suspendedAfter, ct),
            NewUsersLast7Days: await db.Users.CountAsync(u => u.CreatedAt >= weekAgo, ct),
            ActiveShops: await db.Shops.CountAsync(s => s.IsActive, ct),
            DeactivatedShops: await db.Shops.CountAsync(s => !s.IsActive, ct),
            Items: await db.Items.CountAsync(ct),
            SignInsLast24Hours: await db.AuditEntries.CountAsync(a => a.Action == "user.signed_in" && a.At >= dayAgo, ct),
            FailedSignInsLast24Hours: await db.AuditEntries.CountAsync(
                a => (a.Action == "user.sign_in_failed" || a.Action == "user.locked_out") && a.At >= dayAgo, ct));
    }

    /// <summary>
    /// Activity log, newest first. Filter with <c>search</c> (email or description) and
    /// <c>action</c> (exact name, or a prefix such as "shop." or "user.").
    /// </summary>
    [HttpGet("audit-logs")]
    public async Task<Page<AuditEntryDto>> AuditLogs(
        [FromQuery] string? search, [FromQuery] string? action,
        [FromQuery] int skip = 0, [FromQuery] int take = 50, CancellationToken ct = default)
    {
        var query = db.AuditEntries.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(action))
            query = query.Where(a => a.Action.StartsWith(action.Trim()));
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(a => a.Summary.ToLower().Contains(term) || (a.ActorEmail != null && a.ActorEmail.ToLower().Contains(term)));
        }

        var total = await query.CountAsync(ct);
        var items = await query.OrderByDescending(a => a.Id)
            .Skip(Math.Max(skip, 0)).Take(Math.Clamp(take, 1, 200))
            .Select(a => new AuditEntryDto(a.Id, a.At, a.ActorEmail, a.Action, a.TargetType, a.TargetId, a.Summary, a.IpAddress))
            .ToListAsync(ct);
        return new Page<AuditEntryDto>(items, total);
    }
}
