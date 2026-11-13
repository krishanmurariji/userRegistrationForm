using System.ComponentModel.DataAnnotations;
using SmallMart.Api.Domain;
using SmallMart.Api.Storage;

namespace SmallMart.Api.Shops;

public record ShopRequest(
    [Required, MaxLength(120)] string Name,
    [MaxLength(1000)] string? Description,
    [Required, RegularExpression(@"^\+?[0-9][0-9 \-]{6,18}$", ErrorMessage = "Enter a valid phone number.")] string Phone,
    [Required, MaxLength(300)] string AddressLine,
    [Required, MaxLength(100)] string City,
    [Required, RegularExpression(@"^[1-9][0-9]{5}$", ErrorMessage = "Enter a 6-digit pincode.")] string Pincode,
    [RegularExpression(@"^[A-Za-z0-9._\-]{2,256}@[A-Za-z][A-Za-z0-9]{1,63}$", ErrorMessage = "Enter a valid UPI ID, for example name@bank.")] string? UpiId,
    [Range(0, 10000)] decimal DeliveryFee,
    [Range(0, 100000)] decimal MinimumOrder,
    bool IsOpen = true);

public record ShopDto(
    Guid Id, string Name, string? Description, string Phone, string AddressLine, string City, string Pincode,
    string? UpiId, decimal DeliveryFee, decimal MinimumOrder, bool IsOpen, bool IsActive, string? LogoUrl, string MyRole)
{
    public static ShopDto From(Shop s, ShopRole role) => new(
        s.Id, s.Name, s.Description, s.Phone, s.AddressLine, s.City, s.Pincode,
        s.UpiId, s.DeliveryFee, s.MinimumOrder, s.IsOpen, s.IsActive, ImageStorage.Url(s.LogoPath), role.ToString());
}

public record CategoryRequest([Required, MaxLength(80)] string Name, int SortOrder = 0);

public record CategoryDto(Guid Id, string Name, int SortOrder, int ItemCount);

public record ItemRequest(
    [Required, MaxLength(150)] string Name,
    [MaxLength(2000)] string? Description,
    Guid? CategoryId,
    [Range(0.01, 1000000)] decimal Price,
    [Range(0.01, 1000000)] decimal? Mrp,
    [Required, MaxLength(30)] string Unit,
    [MaxLength(64)] string? Barcode,
    bool IsActive = true,
    bool TrackStock = false,
    [Range(0, 100000)] int LowStockThreshold = 5,
    [Range(0, 1000000)] int? OpeningStock = null);

public record ItemDto(
    Guid Id, Guid? CategoryId, string Name, string? Description, decimal Price, decimal? Mrp,
    string Unit, string? Barcode, bool IsActive, string? ImageUrl,
    bool TrackStock, int StockQuantity, int LowStockThreshold)
{
    public static ItemDto From(Item i) => new(
        i.Id, i.CategoryId, i.Name, i.Description, i.Price, i.Mrp, i.Unit, i.Barcode, i.IsActive, ImageStorage.Url(i.ImagePath),
        i.TrackStock, i.StockQuantity, i.LowStockThreshold);
}

/// <summary>
/// A stock change made by hand. Give exactly one of <paramref name="Change"/> (add or remove this many)
/// or <paramref name="SetTo"/> (the shelf was counted and this is the real number).
/// </summary>
/// <param name="Reason">"Restock", "Damage" or "Correction".</param>
public record StockAdjustRequest(
    [Range(-1000000, 1000000)] int? Change,
    [Range(0, 1000000)] int? SetTo,
    [Required] string Reason,
    [MaxLength(300)] string? Note);

public record StockMovementDto(long Id, DateTimeOffset At, int Change, int QuantityAfter, string Reason, string? Note, string? OrderNumber);

public record StockSummaryDto(int Low, int Out);
