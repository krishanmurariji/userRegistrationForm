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
    string? UpiId, decimal DeliveryFee, decimal MinimumOrder, bool IsOpen, string? LogoUrl, string MyRole)
{
    public static ShopDto From(Shop s, ShopRole role) => new(
        s.Id, s.Name, s.Description, s.Phone, s.AddressLine, s.City, s.Pincode,
        s.UpiId, s.DeliveryFee, s.MinimumOrder, s.IsOpen, ImageStorage.Url(s.LogoPath), role.ToString());
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
    bool IsActive = true);

public record ItemDto(
    Guid Id, Guid? CategoryId, string Name, string? Description, decimal Price, decimal? Mrp,
    string Unit, string? Barcode, bool IsActive, string? ImageUrl)
{
    public static ItemDto From(Item i) => new(
        i.Id, i.CategoryId, i.Name, i.Description, i.Price, i.Mrp, i.Unit, i.Barcode, i.IsActive, ImageStorage.Url(i.ImagePath));
}
