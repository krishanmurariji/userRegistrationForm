using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmallMart.Api.Audit;
using SmallMart.Api.Auth;
using SmallMart.Api.Data;
using SmallMart.Api.Domain;
using SmallMart.Api.Notifications;

namespace SmallMart.Api.Admin;

[ApiController]
[Route("api/admin/shops")]
[Authorize(Roles = Roles.PlatformAdmin)]
public class AdminShopsController(AppDbContext db, AuditLog audit, Notifier notifier) : ControllerBase
{
    /// <summary>All shops, newest first. Filter with <c>search</c> (shop name, city or owner email) and <c>active</c>.</summary>
    [HttpGet]
    public async Task<Page<AdminShopDto>> List(
        [FromQuery] string? search, [FromQuery] bool? active,
        [FromQuery] int skip = 0, [FromQuery] int take = 50, CancellationToken ct = default)
    {
        var query = db.Shops.AsNoTracking();
        if (active is not null)
            query = query.Where(s => s.IsActive == active);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            var upper = search.Trim().ToUpperInvariant();
            query = query.Where(s =>
                s.Name.ToLower().Contains(term) || s.City.ToLower().Contains(term) ||
                s.Members.Any(m => m.Role == ShopRole.Owner && m.User.NormalizedEmail!.Contains(upper)));
        }

        var total = await query.CountAsync(ct);
        var items = await query.OrderByDescending(s => s.CreatedAt).ThenBy(s => s.Id)
            .Skip(Math.Max(skip, 0)).Take(Math.Clamp(take, 1, 200))
            .Select(s => new AdminShopDto(
                s.Id, s.Name, s.City, s.Phone, s.IsActive, s.IsOpen,
                s.Members.Where(m => m.Role == ShopRole.Owner).Select(m => m.User.Email).FirstOrDefault(),
                s.Members.Where(m => m.Role == ShopRole.Owner).Select(m => m.User.FullName).FirstOrDefault(),
                db.Items.Count(i => i.ShopId == s.Id), s.CreatedAt))
            .ToListAsync(ct);
        return new Page<AdminShopDto>(items, total);
    }

    /// <summary>Hides the shop from customers and stops its owner from changing it.</summary>
    [HttpPost("{id:guid}/deactivate")]
    public Task<IActionResult> Deactivate(Guid id, CancellationToken ct) => SetActiveAsync(id, false, ct);

    [HttpPost("{id:guid}/activate")]
    public Task<IActionResult> Activate(Guid id, CancellationToken ct) => SetActiveAsync(id, true, ct);

    private async Task<IActionResult> SetActiveAsync(Guid id, bool active, CancellationToken ct)
    {
        var shop = await db.Shops.SingleOrDefaultAsync(s => s.Id == id, ct);
        if (shop is null)
            return NotFound();

        if (shop.IsActive != active)
        {
            shop.IsActive = active;
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync(
                active ? "shop.activated" : "shop.deactivated",
                $"{(active ? "Activated" : "Deactivated")} shop \"{shop.Name}\"", "shop", shop.Id, ct: ct);
            await notifier.ToShopAsync(shop.Id,
                active ? $"{shop.Name} is active again" : $"{shop.Name} was deactivated",
                active ? "Customers can see your shop and order again." : "Customers cannot see your shop, and it cannot be changed. Contact support for details.",
                $"/shops/{shop.Id}", ct);
        }
        return NoContent();
    }
}
