using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmallMart.Api.Auth;
using SmallMart.Api.Data;
using SmallMart.Api.Domain;
using SmallMart.Api.Storage;

namespace SmallMart.Api.Shops;

/// <summary>Shop management for owners and staff. Customer-facing browsing is separate.</summary>
[ApiController]
[Route("api/shops")]
[Authorize]
public class ShopsController(AppDbContext db, ShopAccess access, ImageStorage images, TimeProvider clock) : ControllerBase
{
    private const int MaxShopsPerOwner = 10;

    /// <summary>Shops the signed-in user owns or works in.</summary>
    [HttpGet("mine")]
    public async Task<IReadOnlyList<ShopDto>> Mine(CancellationToken ct)
    {
        var userId = User.GetUserId();
        var rows = await db.ShopMembers.AsNoTracking()
            .Where(m => m.UserId == userId)
            .OrderBy(m => m.Shop.Name)
            .Select(m => new { m.Shop, m.Role })
            .ToListAsync(ct);
        return rows.Select(r => ShopDto.From(r.Shop, r.Role)).ToList();
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var role = await access.RoleAsync(id, User.GetUserId(), ct);
        if (role is null)
            return NotFound();
        var shop = await db.Shops.AsNoTracking().SingleAsync(s => s.Id == id, ct);
        return Ok(ShopDto.From(shop, role.Value));
    }

    [HttpPost]
    public async Task<IActionResult> Create(ShopRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        var owned = await db.ShopMembers.CountAsync(m => m.UserId == userId && m.Role == ShopRole.Owner, ct);
        if (owned >= MaxShopsPerOwner)
            return this.ApiError(StatusCodes.Status409Conflict, "shop_limit",
                $"You can own up to {MaxShopsPerOwner} shops.");

        var shop = new Shop { Id = Guid.NewGuid(), CreatedAt = clock.GetUtcNow() };
        Apply(shop, request);
        shop.Members.Add(new ShopMember { UserId = userId, Role = ShopRole.Owner });
        db.Shops.Add(shop);
        await db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(Get), new { id = shop.Id }, ShopDto.From(shop, ShopRole.Owner));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, ShopRequest request, CancellationToken ct)
    {
        var role = await access.RoleAsync(id, User.GetUserId(), ct);
        if (role is null)
            return NotFound();
        if (role < ShopRole.Manager)
            return Forbid();

        var shop = await db.Shops.SingleAsync(s => s.Id == id, ct);
        Apply(shop, request);
        await db.SaveChangesAsync(ct);
        return Ok(ShopDto.From(shop, role.Value));
    }

    /// <summary>Replaces the shop logo. Accepts a JPEG, PNG or WebP file up to 5 MB in the form field "file".</summary>
    [HttpPost("{id:guid}/logo")]
    [RequestSizeLimit(ImageStorage.MaxBytes + 64 * 1024)]
    public async Task<IActionResult> UploadLogo(Guid id, IFormFile file, CancellationToken ct)
    {
        var role = await access.RoleAsync(id, User.GetUserId(), ct);
        if (role is null)
            return NotFound();
        if (role < ShopRole.Manager)
            return Forbid();

        var path = await images.SaveAsync(file, $"shops/{id:N}", ct);
        if (path is null)
            return this.ApiError(StatusCodes.Status400BadRequest, "invalid_image",
                "Upload a JPEG, PNG or WebP picture up to 5 MB.");

        var shop = await db.Shops.SingleAsync(s => s.Id == id, ct);
        var previous = shop.LogoPath;
        shop.LogoPath = path;
        await db.SaveChangesAsync(ct);
        images.Delete(previous);
        return Ok(ShopDto.From(shop, role.Value));
    }

    private static void Apply(Shop shop, ShopRequest r)
    {
        shop.Name = r.Name.Trim();
        shop.Description = Clean(r.Description);
        shop.Phone = r.Phone.Trim();
        shop.AddressLine = r.AddressLine.Trim();
        shop.City = r.City.Trim();
        shop.Pincode = r.Pincode;
        shop.UpiId = Clean(r.UpiId);
        shop.DeliveryFee = r.DeliveryFee;
        shop.MinimumOrder = r.MinimumOrder;
        shop.IsOpen = r.IsOpen;
    }

    internal static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
