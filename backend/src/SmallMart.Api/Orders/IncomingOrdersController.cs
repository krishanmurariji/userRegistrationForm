using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmallMart.Api.Auth;
using SmallMart.Api.Data;
using SmallMart.Api.Domain;

namespace SmallMart.Api.Orders;

/// <summary>One line of an incoming order, with what is left on the shelf after it.</summary>
/// <param name="StockLeft">Units left after this order (stock is set aside when the order is placed); null when the item does not track stock.</param>
public record IncomingLineDto(
    Guid? ItemId, string Name, string Unit, int Quantity, decimal LineTotal, string? ImageUrl,
    int? StockLeft, int? LowStockThreshold, bool ItemRemoved);

/// <summary>A new order that is waiting for the shop to accept or decline it.</summary>
/// <param name="CanAccept">False for a UPI order whose payment has not been sent yet.</param>
public record IncomingOrderDto(
    Guid Id, string Number, Guid ShopId, string ShopName, string CustomerName, string City,
    string PaymentMethod, string PaymentStatus, string? UpiReference, bool HasUpiProof,
    decimal Subtotal, decimal DeliveryFee, decimal Total, string? Note, DateTimeOffset CreatedAt,
    bool CanAccept, IReadOnlyList<IncomingLineDto> Items);

public record DeclineRequest([MaxLength(300)] string? Reason);

/// <summary>
/// New orders across every shop the signed-in owner works in, oldest first, so none is missed. A UPI order shows up
/// once the customer has sent the payment proof.
/// </summary>
[ApiController]
[Route("api/owner/incoming-orders")]
[Authorize]
public class IncomingOrdersController(AppDbContext db, OrderDecisions decisions) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        var userId = User.GetUserId();
        var shopIds = db.ShopMembers.Where(m => m.UserId == userId).Select(m => m.ShopId);
        var orders = await db.Orders.AsNoTracking().Include(o => o.Shop).Include(o => o.Items)
            .Where(o => shopIds.Contains(o.ShopId) && o.Shop.IsActive && o.Status == OrderStatus.Placed &&
                        (o.PaymentMethod == PaymentMethod.CashOnDelivery || o.PaymentStatus == PaymentStatus.AwaitingVerification ||
                         o.PaymentStatus == PaymentStatus.Paid))
            .OrderBy(o => o.CreatedAt)
            .Take(20)
            .ToListAsync(ct);

        var itemIds = orders.SelectMany(o => o.Items).Where(i => i.ItemId != null).Select(i => i.ItemId!.Value).Distinct().ToList();
        var items = await db.Items.AsNoTracking().Where(i => itemIds.Contains(i.Id))
            .Select(i => new { i.Id, i.TrackStock, i.StockQuantity, i.LowStockThreshold, i.ImagePath })
            .ToDictionaryAsync(i => i.Id, ct);

        return Ok(orders.Select(o => new IncomingOrderDto(
            o.Id, o.DisplayNumber, o.ShopId, o.Shop.Name, o.CustomerName, o.City,
            o.PaymentMethod.ToString(), o.PaymentStatus.ToString(), o.UpiReference, o.UpiScreenshotPath != null,
            o.Subtotal, o.DeliveryFee, o.Total, o.Note, o.CreatedAt,
            CanAccept: o.PaymentMethod == PaymentMethod.CashOnDelivery || o.PaymentStatus is PaymentStatus.AwaitingVerification or PaymentStatus.Paid,
            o.Items.Select(line =>
            {
                var item = line.ItemId is { } id && items.TryGetValue(id, out var found) ? found : null;
                return new IncomingLineDto(line.ItemId, line.Name, line.Unit, line.Quantity, line.LineTotal,
                    SmallMart.Api.Storage.ImageStorage.Url(item?.ImagePath),
                    item is { TrackStock: true } ? item.StockQuantity : null,
                    item is { TrackStock: true } ? item.LowStockThreshold : null,
                    ItemRemoved: item is null);
            }).ToList())));
    }

    [HttpPost("{id:guid}/accept")]
    public async Task<IActionResult> Accept(Guid id, CancellationToken ct) =>
        Result(await decisions.AcceptAsync(id, User.GetUserId(), ct));

    [HttpPost("{id:guid}/decline")]
    public async Task<IActionResult> Decline(Guid id, DeclineRequest request, CancellationToken ct) =>
        Result(await decisions.DeclineAsync(id, User.GetUserId(), request.Reason ?? string.Empty, ct));

    private IActionResult Result(DecisionResult result) =>
        result.Ok ? Ok(OrderDto.From(result.Order!)) : this.ApiError(result.Status, result.Code!, result.Message!);
}
