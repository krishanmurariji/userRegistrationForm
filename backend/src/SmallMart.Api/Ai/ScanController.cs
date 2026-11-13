using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SmallMart.Api.Auth;
using SmallMart.Api.Data;
using SmallMart.Api.Shops;
using SmallMart.Api.Storage;

namespace SmallMart.Api.Ai;

/// <summary>Reads product photos into draft items for a shop. Nothing is saved as an item here; the owner reviews first.</summary>
[ApiController]
[Route("api/shops/{shopId:guid}/items/scan")]
[Authorize]
public class ScanController(
    AppDbContext db, ShopAccess access, ProductScanner scanner, IOptions<AiOptions> options, TimeProvider clock) : ControllerBase
{
    /// <summary>Whether photo scanning is set up, and how many scans the shop has left today.</summary>
    [HttpGet("status")]
    public async Task<IActionResult> Status(Guid shopId, CancellationToken ct)
    {
        if (await access.RoleAsync(shopId, User.GetUserId(), ct) is null)
            return NotFound();
        return Ok(new ScanStatusDto(options.Value.Enabled, await RemainingAsync(shopId, ct), options.Value.DailyScansPerShop));
    }

    /// <summary>
    /// Reads one photo (form field "file": JPEG, PNG or WebP up to 5 MB) and returns a draft for each product in it.
    /// Each field says where it came from and whether it needs checking. There is never a selling price.
    /// </summary>
    [HttpPost]
    [RequestSizeLimit(ImageStorage.MaxBytes + 64 * 1024)]
    public async Task<IActionResult> Scan(Guid shopId, IFormFile? file, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (await access.RoleAsync(shopId, userId, ct) is null)
            return NotFound();
        if (!await access.IsActiveAsync(shopId, ct))
            return this.ShopDeactivated();
        if (!options.Value.Enabled)
            return this.ApiError(StatusCodes.Status503ServiceUnavailable, "ai_not_configured",
                "Reading items from photos is not set up yet. You can still add items by hand.");

        if (file is null || file.Length is 0 or > ImageStorage.MaxBytes)
            return InvalidImage();
        var bytes = new byte[file.Length];
        await using (var stream = file.OpenReadStream())
            await stream.ReadExactlyAsync(bytes, ct);
        if (ImageStorage.ContentTypeOf(bytes) is not { } contentType)
            return InvalidImage();

        if (await RemainingAsync(shopId, ct) <= 0)
            return this.ApiError(StatusCodes.Status429TooManyRequests, "scan_limit",
                $"This shop has used its {options.Value.DailyScansPerShop} photo scans for today. Add items by hand, or try again tomorrow.");

        // Count the attempt before calling the AI, so a burst of requests cannot slip past the limit.
        var scan = new AiScan { ShopId = shopId, UserId = userId, At = clock.GetUtcNow() };
        db.AiScans.Add(scan);
        await db.SaveChangesAsync(ct);

        IReadOnlyList<ScanProductDto> products;
        try
        {
            products = await scanner.ScanAsync(shopId, bytes, contentType, ct);
        }
        catch (AiUnavailableException ex)
        {
            // The shop got nothing, so it does not cost them a scan.
            db.AiScans.Remove(scan);
            await db.SaveChangesAsync(ct);
            return this.ApiError(StatusCodes.Status503ServiceUnavailable, ex.Code, ex.Message);
        }

        scan.ProductCount = products.Count;
        scan.Succeeded = true;
        await db.SaveChangesAsync(ct);
        return Ok(new ScanResultDto(products, await RemainingAsync(shopId, ct)));
    }

    private async Task<int> RemainingAsync(Guid shopId, CancellationToken ct)
    {
        var since = clock.GetUtcNow().AddHours(-24);
        var used = await db.AiScans.CountAsync(s => s.ShopId == shopId && s.At >= since, ct);
        return Math.Max(0, options.Value.DailyScansPerShop - used);
    }

    private ObjectResult InvalidImage() =>
        this.ApiError(StatusCodes.Status400BadRequest, "invalid_image", "Upload a JPEG, PNG or WebP photo up to 5 MB.");
}
