using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmallMart.Api.Auth;
using SmallMart.Api.Data;
using SmallMart.Api.Domain;
using SmallMart.Api.Inventory;
using SmallMart.Api.Storage;

namespace SmallMart.Api.Shops;

[ApiController]
[Route("api/shops/{shopId:guid}/items")]
[Authorize]
public class ItemsController(
    AppDbContext db, ShopAccess access, ImageStorage images, StockService stock, TimeProvider clock) : ControllerBase
{
    /// <summary>Items of the shop, including inactive ones, sorted by name. <c>stock</c> can be "low" or "out".</summary>
    [HttpGet]
    public async Task<IActionResult> List(
        Guid shopId, [FromQuery] Guid? categoryId, [FromQuery] string? search, [FromQuery] string? stock = null,
        [FromQuery] int skip = 0, [FromQuery] int take = 100, CancellationToken ct = default)
    {
        if (await access.RoleAsync(shopId, User.GetUserId(), ct) is null)
            return NotFound();

        var query = db.Items.AsNoTracking().Where(i => i.ShopId == shopId);
        if (categoryId is not null)
            query = query.Where(i => i.CategoryId == categoryId);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(i => i.Name.ToLower().Contains(term) || i.Barcode == search.Trim());
        }
        // "low" = at or below the warning level (including none left); "out" = none left.
        if (stock == "low")
            query = query.Where(i => i.TrackStock && i.StockQuantity <= i.LowStockThreshold);
        else if (stock == "out")
            query = query.Where(i => i.TrackStock && i.StockQuantity <= 0);

        var items = await query.OrderBy(i => i.Name).ThenBy(i => i.Id)
            .Skip(Math.Max(skip, 0)).Take(Math.Clamp(take, 1, 200))
            .ToListAsync(ct);
        return Ok(items.Select(ItemDto.From));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid shopId, Guid id, CancellationToken ct)
    {
        if (await access.RoleAsync(shopId, User.GetUserId(), ct) is null)
            return NotFound();
        var item = await db.Items.AsNoTracking().SingleOrDefaultAsync(i => i.Id == id && i.ShopId == shopId, ct);
        return item is null ? NotFound() : Ok(ItemDto.From(item));
    }

    [HttpPost]
    public async Task<IActionResult> Create(Guid shopId, ItemRequest request, CancellationToken ct)
    {
        if (await access.RoleAsync(shopId, User.GetUserId(), ct) is null)
            return NotFound();
        if (!await access.IsActiveAsync(shopId, ct))
            return this.ShopDeactivated();
        if (await ValidateAsync(shopId, request, ct) is { } error)
            return error;

        var now = clock.GetUtcNow();
        var item = new Item { Id = Guid.NewGuid(), ShopId = shopId, CreatedAt = now, UpdatedAt = now };
        Apply(item, request);
        db.Items.Add(item);
        await db.SaveChangesAsync(ct);
        if (item.TrackStock)
            item.StockQuantity = await stock.SetToAsync(item, request.OpeningStock ?? 0, StockReason.Opening, null, User.GetUserId(), ct);
        return CreatedAtAction(nameof(Get), new { shopId, id = item.Id }, ItemDto.From(item));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid shopId, Guid id, ItemRequest request, CancellationToken ct)
    {
        if (await access.RoleAsync(shopId, User.GetUserId(), ct) is null)
            return NotFound();
        if (!await access.IsActiveAsync(shopId, ct))
            return this.ShopDeactivated();
        var item = await db.Items.SingleOrDefaultAsync(i => i.Id == id && i.ShopId == shopId, ct);
        if (item is null)
            return NotFound();
        if (await ValidateAsync(shopId, request, ct) is { } error)
            return error;

        var startsTracking = request.TrackStock && !item.TrackStock;
        Apply(item, request);
        item.UpdatedAt = clock.GetUtcNow();
        await db.SaveChangesAsync(ct);
        // Switching stock counting on starts from the number the shop gives (or zero).
        if (startsTracking)
            await stock.SetToAsync(item, request.OpeningStock ?? 0, StockReason.Opening, null, User.GetUserId(), ct);
        await db.Entry(item).ReloadAsync(ct);
        return Ok(ItemDto.From(item));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid shopId, Guid id, CancellationToken ct)
    {
        if (await access.RoleAsync(shopId, User.GetUserId(), ct) is null)
            return NotFound();
        if (!await access.IsActiveAsync(shopId, ct))
            return this.ShopDeactivated();
        var item = await db.Items.SingleOrDefaultAsync(i => i.Id == id && i.ShopId == shopId, ct);
        if (item is null)
            return NotFound();

        db.Items.Remove(item);
        await db.SaveChangesAsync(ct);
        images.Delete(item.ImagePath);
        return NoContent();
    }

    /// <summary>Replaces the item photo. Accepts a JPEG, PNG or WebP file up to 5 MB in the form field "file".</summary>
    [HttpPost("{id:guid}/image")]
    [RequestSizeLimit(ImageStorage.MaxBytes + 64 * 1024)]
    public async Task<IActionResult> UploadImage(Guid shopId, Guid id, IFormFile file, CancellationToken ct)
    {
        if (await access.RoleAsync(shopId, User.GetUserId(), ct) is null)
            return NotFound();
        if (!await access.IsActiveAsync(shopId, ct))
            return this.ShopDeactivated();
        var item = await db.Items.SingleOrDefaultAsync(i => i.Id == id && i.ShopId == shopId, ct);
        if (item is null)
            return NotFound();

        var path = await images.SaveAsync(file, $"shops/{shopId:N}/items", ct);
        if (path is null)
            return this.ApiError(StatusCodes.Status400BadRequest, "invalid_image",
                "Upload a JPEG, PNG or WebP picture up to 5 MB.");

        var previous = item.ImagePath;
        item.ImagePath = path;
        item.UpdatedAt = clock.GetUtcNow();
        await db.SaveChangesAsync(ct);
        images.Delete(previous);
        return Ok(ItemDto.From(item));
    }

    /// <summary>How many counted items are low (at or below their warning level) and how many have none left.</summary>
    [HttpGet("stock-summary")]
    public async Task<IActionResult> StockSummary(Guid shopId, CancellationToken ct)
    {
        if (await access.RoleAsync(shopId, User.GetUserId(), ct) is null)
            return NotFound();
        var counted = db.Items.Where(i => i.ShopId == shopId && i.TrackStock);
        return Ok(new StockSummaryDto(
            await counted.CountAsync(i => i.StockQuantity <= i.LowStockThreshold, ct),
            await counted.CountAsync(i => i.StockQuantity <= 0, ct)));
    }

    /// <summary>Adds or removes stock by hand, or corrects the count. Every change is kept in the item's stock history.</summary>
    [HttpPost("{id:guid}/stock")]
    public async Task<IActionResult> AdjustStock(Guid shopId, Guid id, StockAdjustRequest request, CancellationToken ct)
    {
        if (await access.RoleAsync(shopId, User.GetUserId(), ct) is null)
            return NotFound();
        if (!await access.IsActiveAsync(shopId, ct))
            return this.ShopDeactivated();
        var item = await db.Items.SingleOrDefaultAsync(i => i.Id == id && i.ShopId == shopId, ct);
        if (item is null)
            return NotFound();
        if (!item.TrackStock)
            return this.ApiError(StatusCodes.Status409Conflict, "stock_not_tracked", "Switch on stock counting for this item first.");
        if (!Enum.TryParse<StockReason>(request.Reason, out var reason) ||
            reason is not (StockReason.Restock or StockReason.Damage or StockReason.Correction))
            return this.ApiError(StatusCodes.Status400BadRequest, "invalid_reason", "Choose stock received, damaged or expired, or count corrected.");
        if (request.Change is null == request.SetTo is null)
            return this.ApiError(StatusCodes.Status400BadRequest, "invalid_adjustment", "Give either a change or the counted quantity.");

        var note = ShopsController.Clean(request.Note);
        if (request.SetTo is { } counted)
        {
            await stock.SetToAsync(item, counted, reason, note, User.GetUserId(), ct);
        }
        else
        {
            var change = request.Change!.Value;
            if (change == 0 || (reason == StockReason.Restock && change < 0) || (reason == StockReason.Damage && change > 0))
                return this.ApiError(StatusCodes.Status400BadRequest, "invalid_adjustment",
                    "Stock received must add stock, and damaged or expired must remove it.");
            if (await stock.AdjustAsync(item, change, reason, note, User.GetUserId(), ct) is null)
                return this.ApiError(StatusCodes.Status409Conflict, "insufficient_stock", "You cannot remove more than is in stock.");
        }

        await db.Entry(item).ReloadAsync(ct);
        return Ok(ItemDto.From(item));
    }

    /// <summary>The item's stock history, newest first.</summary>
    [HttpGet("{id:guid}/stock")]
    public async Task<IActionResult> StockHistory(Guid shopId, Guid id, [FromQuery] int take = 100, CancellationToken ct = default)
    {
        if (await access.RoleAsync(shopId, User.GetUserId(), ct) is null)
            return NotFound();
        if (!await db.Items.AnyAsync(i => i.Id == id && i.ShopId == shopId, ct))
            return NotFound();

        var rows = await db.StockMovements.AsNoTracking().Where(m => m.ItemId == id)
            .OrderByDescending(m => m.Id).Take(Math.Clamp(take, 1, 200))
            .Select(m => new
            {
                m.Id, m.At, m.Change, m.QuantityAfter, m.Reason, m.Note,
                OrderNumber = db.Orders.Where(o => o.Id == m.OrderId).Select(o => (int?)o.Number).FirstOrDefault(),
            })
            .ToListAsync(ct);
        return Ok(rows.Select(m => new StockMovementDto(
            m.Id, m.At, m.Change, m.QuantityAfter, m.Reason.ToString(), m.Note,
            m.OrderNumber is { } number ? $"SM-{number:D5}" : null)));
    }

    private async Task<ObjectResult?> ValidateAsync(Guid shopId, ItemRequest request, CancellationToken ct)
    {
        if (request.Mrp is { } mrp && mrp < request.Price)
            return this.ApiError(StatusCodes.Status400BadRequest, "price_above_mrp", "The price cannot be higher than the MRP.");

        // The category must belong to this shop, so items can never point into another shop.
        if (request.CategoryId is { } categoryId &&
            !await db.Categories.AnyAsync(c => c.Id == categoryId && c.ShopId == shopId, ct))
            return this.ApiError(StatusCodes.Status400BadRequest, "unknown_category", "That category does not exist in this shop.");

        return null;
    }

    private static void Apply(Item item, ItemRequest r)
    {
        item.Name = r.Name.Trim();
        item.Description = ShopsController.Clean(r.Description);
        item.CategoryId = r.CategoryId;
        item.Price = r.Price;
        item.Mrp = r.Mrp;
        item.Unit = r.Unit.Trim();
        item.Barcode = ShopsController.Clean(r.Barcode);
        item.IsActive = r.IsActive;
        item.TrackStock = r.TrackStock;
        item.LowStockThreshold = r.LowStockThreshold;
    }
}
