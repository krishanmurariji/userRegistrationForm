using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using SmallMart.Api.Audit;
using SmallMart.Api.Data;
using SmallMart.Api.Domain;

namespace SmallMart.Api.Auth;

/// <param name="Password">Required for accounts that have a password.</param>
/// <param name="Confirm">Must be the word DELETE, so an account is never removed by a stray tap.</param>
public record DeleteAccountRequest(string? Password, string? Confirm);

/// <summary>
/// Lets people delete their own account, as app stores require. The sign-in and personal details are erased at once.
/// Orders stay (the shop needs them for its accounts) but lose the name, phone and address. Shops the person owned are
/// switched off so customers no longer see them.
/// </summary>
[ApiController]
[Route("api/auth")]
[Authorize]
[EnableRateLimiting("auth")]
public class AccountDeletionController(UserManager<ApplicationUser> users, AppDbContext db, AuditLog audit) : ControllerBase
{
    public const string DeletedName = "Deleted user";

    [HttpPost("delete-account")]
    public async Task<IActionResult> Delete(DeleteAccountRequest request, CancellationToken ct)
    {
        var user = await users.FindByIdAsync(User.GetUserId().ToString());
        if (user is null)
            return Unauthorized();

        if (!string.Equals(request.Confirm?.Trim(), "DELETE", StringComparison.Ordinal))
            return this.ApiError(StatusCodes.Status400BadRequest, "confirm_required", "Type DELETE to confirm.");
        if (await users.HasPasswordAsync(user) && !await users.CheckPasswordAsync(user, request.Password ?? string.Empty))
            return this.ApiError(StatusCodes.Status400BadRequest, "wrong_password", "The password is incorrect.");
        if (await users.IsInRoleAsync(user, Roles.PlatformAdmin))
            return this.ApiError(StatusCodes.Status403Forbidden, "admin_account",
                "The platform admin account cannot be deleted from the app.");

        var open = new[] { OrderStatus.Placed, OrderStatus.Accepted, OrderStatus.Packed, OrderStatus.OutForDelivery };
        if (await db.Orders.AnyAsync(o => o.CustomerId == user.Id && open.Contains(o.Status), ct))
            return this.ApiError(StatusCodes.Status409Conflict, "open_orders",
                "You have orders that are still on their way. Wait until they are delivered, or cancel them, then try again.");

        var ownedShopIds = await db.ShopMembers
            .Where(m => m.UserId == user.Id && m.Role == ShopRole.Owner)
            .Select(m => m.ShopId)
            .ToListAsync(ct);
        if (await db.Orders.AnyAsync(o => ownedShopIds.Contains(o.ShopId) && open.Contains(o.Status), ct))
            return this.ApiError(StatusCodes.Status409Conflict, "open_shop_orders",
                "Your shop still has orders in progress. Finish or cancel them first, then try again.");

        var email = user.Email;
        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        // Orders: keep the money side, drop who and where.
        await db.Orders.Where(o => o.CustomerId == user.Id).ExecuteUpdateAsync(s => s
            .SetProperty(o => o.CustomerName, DeletedName)
            .SetProperty(o => o.Phone, string.Empty)
            .SetProperty(o => o.AddressLine, string.Empty)
            .SetProperty(o => o.Pincode, string.Empty)
            .SetProperty(o => o.Note, (string?)null), ct);

        // Shops this person ran on their own are switched off; their membership goes either way.
        foreach (var shopId in ownedShopIds)
        {
            var otherOwner = await db.ShopMembers.AnyAsync(m => m.ShopId == shopId && m.UserId != user.Id && m.Role == ShopRole.Owner, ct);
            if (!otherOwner)
                await db.Shops.Where(s => s.Id == shopId).ExecuteUpdateAsync(s => s.SetProperty(x => x.IsActive, false), ct);
        }
        await db.ShopMembers.Where(m => m.UserId == user.Id).ExecuteDeleteAsync(ct);
        await db.RefreshTokens.Where(t => t.UserId == user.Id).ExecuteDeleteAsync(ct);
        await db.Notifications.Where(n => n.UserId == user.Id).ExecuteDeleteAsync(ct);
        await db.DeviceTokens.Where(d => d.UserId == user.Id).ExecuteDeleteAsync(ct);

        foreach (var login in await users.GetLoginsAsync(user))
            await users.RemoveLoginAsync(user, login.LoginProvider, login.ProviderKey);

        // The row itself stays so old orders still point somewhere, but nothing in it identifies the person any more
        // and it can never sign in again.
        var placeholder = $"deleted-{user.Id:N}@deleted.invalid";
        user.FullName = DeletedName;
        user.Email = placeholder;
        user.NormalizedEmail = placeholder.ToUpperInvariant();
        user.UserName = placeholder;
        user.NormalizedUserName = placeholder.ToUpperInvariant();
        user.EmailConfirmed = false;
        user.PhoneNumber = null;
        user.PasswordHash = null;
        user.LockoutEnabled = true;
        user.LockoutEnd = DateTimeOffset.MaxValue;
        user.SecurityStamp = Guid.NewGuid().ToString();
        var result = await users.UpdateAsync(user);
        if (!result.Succeeded)
            return this.ApiError(StatusCodes.Status500InternalServerError, "delete_failed", "The account could not be deleted. Please try again.");

        await audit.WriteAsync("user.deleted", $"Deleted their account ({MaskEmail(email)})", "user", user.Id, user.Id, null, ct);
        await transaction.CommitAsync(ct);
        return NoContent();
    }

    /// <summary>Keeps enough of the address to recognise a support request, without storing the address itself.</summary>
    private static string MaskEmail(string? email)
    {
        if (string.IsNullOrEmpty(email) || !email.Contains('@'))
            return "no email";
        var at = email.IndexOf('@');
        return $"{email[0]}***{email[at..]}";
    }
}
