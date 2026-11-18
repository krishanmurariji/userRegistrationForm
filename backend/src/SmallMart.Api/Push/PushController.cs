using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using SmallMart.Api.Auth;
using SmallMart.Api.Data;
using SmallMart.Api.Domain;
using SmallMart.Api.Orders;

namespace SmallMart.Api.Push;

public record DeviceRequest([Required, MaxLength(512)] string Token, [MaxLength(20)] string? Platform);

public record OrderActionRequest([Required, MaxLength(2000)] string Token, [Required] string Action, [MaxLength(300)] string? Reason);

public record OrderActionResult(string Status, string Number, string Message);

[ApiController]
[Route("api/push")]
public class PushController(AppDbContext db, OrderActionTokens actionTokens, OrderDecisions decisions, TimeProvider clock) : ControllerBase
{
    /// <summary>Remembers this phone for the signed-in user. A token moves to whoever signed in on the phone last.</summary>
    [HttpPost("devices")]
    [Authorize]
    public async Task<IActionResult> Register(DeviceRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        var now = clock.GetUtcNow();
        var token = request.Token.Trim();
        var device = await db.DeviceTokens.SingleOrDefaultAsync(d => d.Token == token, ct);
        if (device is null)
            db.DeviceTokens.Add(new DeviceToken { UserId = userId, Token = token, Platform = request.Platform ?? "android", CreatedAt = now, LastSeenAt = now });
        else
        {
            device.UserId = userId;
            device.LastSeenAt = now;
        }
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>Called on sign-out, so the phone stops getting this user's notifications.</summary>
    [HttpPost("devices/remove")]
    [Authorize]
    public async Task<IActionResult> Remove(DeviceRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        await db.DeviceTokens.Where(d => d.Token == request.Token.Trim() && d.UserId == userId).ExecuteDeleteAsync(ct);
        return NoContent();
    }

    /// <summary>
    /// The Accept and Decline buttons on a phone notification. Works without signing in: the signed code inside the
    /// notification says which order and which shop worker it is for, and it expires after a few hours.
    /// </summary>
    [HttpPost("order-action")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> OrderAction(OrderActionRequest request, CancellationToken ct)
    {
        if (actionTokens.Read(request.Token) is not { } target)
            return this.ApiError(StatusCodes.Status401Unauthorized, "expired", "This notification has expired. Open the app to handle the order.");
        // A worker removed from the shop (or a deleted account) can no longer act through an old notification.
        if (!await db.Users.AnyAsync(u => u.Id == target.UserId && (u.LockoutEnd == null || u.LockoutEnd < clock.GetUtcNow()), ct))
            return this.ApiError(StatusCodes.Status401Unauthorized, "expired", "This notification has expired. Open the app to handle the order.");

        var result = request.Action switch
        {
            "accept" => await decisions.AcceptAsync(target.OrderId, target.UserId, ct),
            "decline" => await decisions.DeclineAsync(target.OrderId, target.UserId, request.Reason ?? "The shop cannot take this order right now", ct),
            _ => DecisionResult.Fail(400, "invalid_action", "Unknown action."),
        };
        if (!result.Ok)
            return this.ApiError(result.Status, result.Code!, result.Message!);
        var order = result.Order!;
        return Ok(new OrderActionResult(order.Status.ToString(), order.DisplayNumber,
            order.Status == OrderStatus.Accepted ? $"Order {order.DisplayNumber} accepted" : $"Order {order.DisplayNumber} declined"));
    }
}
