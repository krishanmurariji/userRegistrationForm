using System.ComponentModel.DataAnnotations;
using SmallMart.Api.Domain;
using SmallMart.Api.Storage;

namespace SmallMart.Api.Orders;

// ----- What customers see of shops -----

public record StoreShopDto(
    Guid Id, string Name, string? Description, string AddressLine, string City, string Pincode, string Phone,
    bool IsOpen, bool AcceptsUpi, decimal DeliveryFee, decimal MinimumOrder, string? LogoUrl)
{
    public static StoreShopDto From(Shop s) => new(
        s.Id, s.Name, s.Description, s.AddressLine, s.City, s.Pincode, s.Phone,
        s.IsOpen, s.UpiId != null, s.DeliveryFee, s.MinimumOrder, ImageStorage.Url(s.LogoPath));
}

public record StoreCategoryDto(Guid Id, string Name);

public record StoreItemDto(
    Guid Id, Guid? CategoryId, string Name, string? Description, decimal Price, decimal? Mrp, string Unit, string? ImageUrl)
{
    public static StoreItemDto From(Item i) => new(
        i.Id, i.CategoryId, i.Name, i.Description, i.Price, i.Mrp, i.Unit, ImageStorage.Url(i.ImagePath));
}

public record StoreShopDetailDto(StoreShopDto Shop, IReadOnlyList<StoreCategoryDto> Categories);

// ----- Placing an order -----

public record PlaceOrderLine([Required] Guid ItemId, [Range(1, 99)] int Quantity);

/// <param name="PaymentMethod">"CashOnDelivery" or "Upi".</param>
/// <param name="ExpectedTotal">
/// The total the customer saw. When prices changed in the meantime the order is refused, so nobody is
/// charged an amount they did not agree to.
/// </param>
public record PlaceOrderRequest(
    [Required] Guid ShopId,
    [Required, MinLength(1), MaxLength(100)] List<PlaceOrderLine> Items,
    [Required] string PaymentMethod,
    [Required, MaxLength(200)] string CustomerName,
    [Required, RegularExpression(@"^\+?[0-9][0-9 \-]{6,18}$", ErrorMessage = "Enter a valid phone number.")] string Phone,
    [Required, MaxLength(300)] string AddressLine,
    [Required, MaxLength(100)] string City,
    [Required, RegularExpression(@"^[1-9][0-9]{5}$", ErrorMessage = "Enter a 6-digit pincode.")] string Pincode,
    [MaxLength(500)] string? Note,
    decimal? ExpectedTotal);

public record DeliveryAddressDto(string CustomerName, string Phone, string AddressLine, string City, string Pincode);

public record ReasonRequest([Required, MaxLength(300)] string Reason);

public record StatusRequest([Required] string Status);

// ----- Orders as shown to customers and shops -----

public record OrderItemDto(Guid? ItemId, string Name, string Unit, decimal UnitPrice, int Quantity, decimal LineTotal);

public record OrderEventDto(DateTimeOffset At, string Title, string? Note);

/// <summary>Where to send a UPI payment. <see cref="PayUri"/> opens the customer's UPI app with everything filled in.</summary>
public record UpiPayDto(string UpiId, string PayeeName, decimal Amount, string PayUri);

public record OrderSummaryDto(
    Guid Id, string Number, Guid ShopId, string ShopName, string CustomerName, string Status,
    string PaymentMethod, string PaymentStatus, decimal Total, int ItemCount, DateTimeOffset CreatedAt)
{
    public static OrderSummaryDto From(Order o) => new(
        o.Id, o.DisplayNumber, o.ShopId, o.Shop.Name, o.CustomerName, o.Status.ToString(),
        o.PaymentMethod.ToString(), o.PaymentStatus.ToString(), o.Total, o.Items.Sum(i => i.Quantity), o.CreatedAt);
}

public record OrderDto(
    Guid Id, string Number, Guid ShopId, string ShopName, string ShopPhone,
    string Status, string PaymentMethod, string PaymentStatus,
    decimal Subtotal, decimal DeliveryFee, decimal Total,
    string CustomerName, string Phone, string AddressLine, string City, string Pincode,
    string? Note, string? CancelReason,
    UpiPayDto? Upi, string? UpiReference, bool HasUpiProof, DateTimeOffset? UpiSubmittedAt,
    string? PaymentRejectReason, DateTimeOffset? PaymentVerifiedAt,
    DateTimeOffset CreatedAt, IReadOnlyList<OrderItemDto> Items, IReadOnlyList<OrderEventDto> Events)
{
    /// <summary>Needs <c>Shop</c>, <c>Items</c> and <c>Events</c> loaded.</summary>
    public static OrderDto From(Order o)
    {
        UpiPayDto? upi = null;
        if (o.PaymentMethod == Domain.PaymentMethod.Upi && o.Shop.UpiId is { } upiId)
        {
            var uri = $"upi://pay?pa={Uri.EscapeDataString(upiId)}&pn={Uri.EscapeDataString(o.Shop.Name)}" +
                      $"&am={o.Total:0.00}&cu=INR&tn={Uri.EscapeDataString("Order " + o.DisplayNumber)}";
            upi = new UpiPayDto(upiId, o.Shop.Name, o.Total, uri);
        }

        return new OrderDto(
            o.Id, o.DisplayNumber, o.ShopId, o.Shop.Name, o.Shop.Phone,
            o.Status.ToString(), o.PaymentMethod.ToString(), o.PaymentStatus.ToString(),
            o.Subtotal, o.DeliveryFee, o.Total,
            o.CustomerName, o.Phone, o.AddressLine, o.City, o.Pincode,
            o.Note, o.CancelReason,
            upi, o.UpiReference, o.UpiScreenshotPath != null, o.UpiSubmittedAt,
            o.PaymentRejectReason, o.PaymentVerifiedAt,
            o.CreatedAt,
            o.Items.OrderBy(i => i.Name).Select(i => new OrderItemDto(i.ItemId, i.Name, i.Unit, i.UnitPrice, i.Quantity, i.LineTotal)).ToList(),
            o.Events.OrderBy(e => e.Id).Select(e => new OrderEventDto(e.At, e.Title, e.Note)).ToList());
    }
}
