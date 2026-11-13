using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmallMart.Api.Auth;
using SmallMart.Api.Data;
using SmallMart.Api.Storage;

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

    /// <summary>
    /// Category names across all active shops, biggest first, each with a picture of one of its items.
    /// Shops name their own categories, so the same name in two shops is shown as one tile.
    /// </summary>
    [HttpGet("categories")]
    public async Task<IReadOnlyList<StoreCategoryTileDto>> Categories([FromQuery] int take = 12, CancellationToken ct = default)
    {
        var rows = await db.Items.AsNoTracking()
            .Where(i => i.IsActive && i.Shop.IsActive && i.Category != null)
            .Select(i => new { i.Category!.Name, i.ImagePath })
            .ToListAsync(ct);
        return rows
            .GroupBy(r => r.Name.Trim(), StringComparer.OrdinalIgnoreCase)
            .Select(g => new StoreCategoryTileDto(g.Key, g.Count(), ImageStorage.Url(g.Select(r => r.ImagePath).FirstOrDefault(p => p != null))))
            .OrderByDescending(c => c.ItemCount).ThenBy(c => c.Name)
            .Take(Math.Clamp(take, 1, 50))
            .ToList();
    }

    /// <summary>
    /// Searches items across all active shops by name (<c>search</c>) or by category name (<c>category</c>),
    /// and shops by name or city. Items from open shops come first.
    /// </summary>
    [HttpGet("search")]
    public async Task<IActionResult> Search(
        [FromQuery] string? search, [FromQuery] string? category, [FromQuery] int take = 60, CancellationToken ct = default)
    {
        var term = search?.Trim().ToLower();
        var categoryName = category?.Trim().ToLower();
        if (string.IsNullOrEmpty(term) && string.IsNullOrEmpty(categoryName))
            return this.ApiError(StatusCodes.Status400BadRequest, "search_required", "Type something to search for.");

        var query = db.Items.AsNoTracking().Where(i => i.IsActive && i.Shop.IsActive);
        if (!string.IsNullOrEmpty(categoryName))
            query = query.Where(i => i.Category != null && i.Category.Name.ToLower() == categoryName);
        if (!string.IsNullOrEmpty(term))
            query = query.Where(i => i.Name.ToLower().Contains(term));

        var items = await query
            .OrderByDescending(i => i.Shop.IsOpen).ThenBy(i => i.Name).ThenBy(i => i.Id)
            .Take(Math.Clamp(take, 1, 100))
            .ToListAsync(ct);

        var shopIds = items.Select(i => i.ShopId).Distinct().ToList();
        var shops = await db.Shops.AsNoTracking()
            .Where(s => s.IsActive && (shopIds.Contains(s.Id) ||
                (term != null && term != "" && (s.Name.ToLower().Contains(term) || s.City.ToLower().Contains(term) || s.Pincode == term))))
            .OrderByDescending(s => s.IsOpen).ThenBy(s => s.Name)
            .Take(50)
            .ToListAsync(ct);

        return Ok(new StoreSearchDto(
            items.Select(i => new StoreSearchItemDto(StoreItemDto.From(i), i.ShopId)).ToList(),
            shops.Select(StoreShopDto.From).ToList()));
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
