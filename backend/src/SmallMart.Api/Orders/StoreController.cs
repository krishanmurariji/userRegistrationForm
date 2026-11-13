using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmallMart.Api.Data;

namespace SmallMart.Api.Orders;

/// <summary>What customers browse: shops the admin has not deactivated, and their visible items.</summary>
[ApiController]
[Route("api/store")]
[Authorize]
public class StoreController(AppDbContext db) : ControllerBase
{
    /// <summary>Shops, open ones first. <c>search</c> matches the name, city or pincode.</summary>
    [HttpGet("shops")]
    public async Task<IReadOnlyList<StoreShopDto>> Shops(
        [FromQuery] string? search, [FromQuery] int skip = 0, [FromQuery] int take = 50, CancellationToken ct = default)
    {
        var query = db.Shops.AsNoTracking().Where(s => s.IsActive);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(s => s.Name.ToLower().Contains(term) || s.City.ToLower().Contains(term) || s.Pincode == term);
        }

        var shops = await query.OrderByDescending(s => s.IsOpen).ThenBy(s => s.Name).ThenBy(s => s.Id)
            .Skip(Math.Max(skip, 0)).Take(Math.Clamp(take, 1, 100))
            .ToListAsync(ct);
        return shops.Select(StoreShopDto.From).ToList();
    }

    /// <summary>A shop and the categories that have at least one visible item.</summary>
    [HttpGet("shops/{id:guid}")]
    public async Task<IActionResult> Shop(Guid id, CancellationToken ct)
    {
        var shop = await db.Shops.AsNoTracking().SingleOrDefaultAsync(s => s.Id == id && s.IsActive, ct);
        if (shop is null)
            return NotFound();

        var categories = await db.Categories.AsNoTracking()
            .Where(c => c.ShopId == id && db.Items.Any(i => i.CategoryId == c.Id && i.IsActive))
            .OrderBy(c => c.SortOrder).ThenBy(c => c.Name)
            .Select(c => new StoreCategoryDto(c.Id, c.Name))
            .ToListAsync(ct);
        return Ok(new StoreShopDetailDto(StoreShopDto.From(shop), categories));
    }

    /// <summary>Visible items of a shop, sorted by name.</summary>
    [HttpGet("shops/{id:guid}/items")]
    public async Task<IActionResult> Items(
        Guid id, [FromQuery] Guid? categoryId, [FromQuery] string? search,
        [FromQuery] int skip = 0, [FromQuery] int take = 200, CancellationToken ct = default)
    {
        if (!await db.Shops.AnyAsync(s => s.Id == id && s.IsActive, ct))
            return NotFound();

        var query = db.Items.AsNoTracking().Where(i => i.ShopId == id && i.IsActive);
        if (categoryId is not null)
            query = query.Where(i => i.CategoryId == categoryId);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(i => i.Name.ToLower().Contains(term));
        }

        var items = await query.OrderBy(i => i.Name).ThenBy(i => i.Id)
            .Skip(Math.Max(skip, 0)).Take(Math.Clamp(take, 1, 200))
            .ToListAsync(ct);
        return Ok(items.Select(StoreItemDto.From));
    }
}
