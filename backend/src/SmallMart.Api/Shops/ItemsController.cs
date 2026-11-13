using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmallMart.Api.Auth;
using SmallMart.Api.Data;
using SmallMart.Api.Domain;
using SmallMart.Api.Storage;

namespace SmallMart.Api.Shops;

[ApiController]
[Route("api/shops/{shopId:guid}/items")]
[Authorize]
public class ItemsController(AppDbContext db, ShopAccess access, ImageStorage images, TimeProvider clock) : ControllerBase
{
    /// <summary>Items of the shop, including inactive ones, sorted by name.</summary>
    [HttpGet]
    public async Task<IActionResult> List(
        Guid shopId, [FromQuery] Guid? categoryId, [FromQuery] string? search,
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

        Apply(item, request);
        item.UpdatedAt = clock.GetUtcNow();
        await db.SaveChangesAsync(ct);
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
    }
}
