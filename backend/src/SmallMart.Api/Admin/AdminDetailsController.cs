using System.Net;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using SmallMart.Api.Audit;
using SmallMart.Api.Auth;
using SmallMart.Api.Data;
using SmallMart.Api.Domain;
using SmallMart.Api.Email;
using SmallMart.Api.Storage;

namespace SmallMart.Api.Admin;

/// <summary>Single-record views, edits and exports for the admin section.</summary>
[ApiController]
[Route("api/admin")]
[Authorize(Roles = Roles.PlatformAdmin)]
public class AdminDetailsController(
    AppDbContext db,
    UserManager<ApplicationUser> users,
    TokenService tokens,
    IEmailSender email,
    AuditLog audit,
    IConfiguration config,
    TimeProvider clock) : ControllerBase
{
    private const int ExportLimit = 50_000;

    [HttpGet("users/{id:guid}")]
    public async Task<IActionResult> UserDetail(Guid id, CancellationToken ct)
    {
        var user = await users.FindByIdAsync(id.ToString());
        return user is null ? NotFound() : Ok(await ToDetailAsync(user, ct));
    }

    /// <summary>Corrects a user's name or email. The new email must not belong to another account.</summary>
    [HttpPut("users/{id:guid}")]
    public async Task<IActionResult> UpdateUser(Guid id, UpdateUserRequest request, CancellationToken ct)
    {
        var user = await users.FindByIdAsync(id.ToString());
        if (user is null)
            return NotFound();
        if (await users.IsInRoleAsync(user, Roles.PlatformAdmin))
            return this.ApiError(StatusCodes.Status409Conflict, "is_admin", "The platform admin account is changed through the server settings, not here.");

        var newEmail = request.Email.Trim();
        var emailChanged = !string.Equals(user.Email, newEmail, StringComparison.OrdinalIgnoreCase);
        if (emailChanged && await users.FindByEmailAsync(newEmail) is not null)
            return this.ApiError(StatusCodes.Status409Conflict, "email_taken", "Another account already uses this email.");

        var oldEmail = user.Email;
        var oldName = user.FullName;
        user.FullName = request.FullName.Trim();
        if (emailChanged)
        {
            user.Email = newEmail;
            user.UserName = newEmail;
            user.EmailConfirmed = true; // the admin vouches for the corrected address
        }
        var result = await users.UpdateAsync(user);
        if (!result.Succeeded)
            return this.ApiError(StatusCodes.Status400BadRequest, "invalid_account", string.Join(" ", result.Errors.Select(e => e.Description)));

        if (emailChanged)
        {
            // Old sessions carry the old email; make every device sign in again.
            await users.UpdateSecurityStampAsync(user);
            await tokens.RevokeAllForUserAsync(user.Id, ct);
            await audit.WriteAsync("user.email_changed", $"Changed email of {oldEmail} to {newEmail}", "user", user.Id, ct: ct);
        }
        if (oldName != user.FullName)
            await audit.WriteAsync("user.renamed", $"Renamed {user.Email} from \"{oldName}\" to \"{user.FullName}\"", "user", user.Id, ct: ct);

        return Ok(await ToDetailAsync(user, ct));
    }

    /// <summary>Emails the user a link to choose a new password. The admin never sees or sets the password.</summary>
    [HttpPost("users/{id:guid}/send-password-reset")]
    public async Task<IActionResult> SendPasswordReset(Guid id, CancellationToken ct)
    {
        var user = await users.FindByIdAsync(id.ToString());
        if (user is null)
            return NotFound();
        if (await users.IsInRoleAsync(user, Roles.PlatformAdmin))
            return this.ApiError(StatusCodes.Status409Conflict, "is_admin", "Use \"Forgot password\" on the sign-in page for the admin account.");

        var token = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(await users.GeneratePasswordResetTokenAsync(user)));
        var link = $"{config["App:ClientUrl"]?.TrimEnd('/')}/reset-password?userId={user.Id}&token={token}";
        await email.SendAsync(user.Email!, "Reset your Small Mart password",
            $"<p>Hello {WebUtility.HtmlEncode(user.FullName)},</p>" +
            $"<p>Small Mart support sent you this link. <a href=\"{WebUtility.HtmlEncode(link)}\">Choose a new password</a>. It expires in 24 hours.</p>", ct);
        await audit.WriteAsync("user.password_reset_sent", $"Sent a password reset link to {user.Email}", "user", user.Id, ct: ct);
        return NoContent();
    }

    [HttpGet("shops/{id:guid}")]
    public async Task<IActionResult> ShopDetail(Guid id, CancellationToken ct)
    {
        var shop = await db.Shops.AsNoTracking().SingleOrDefaultAsync(s => s.Id == id, ct);
        if (shop is null)
            return NotFound();

        var owner = await db.ShopMembers.Where(m => m.ShopId == id && m.Role == ShopRole.Owner)
            .Select(m => new { m.User.Id, m.User.FullName, m.User.Email }).FirstOrDefaultAsync(ct);
        var orders = db.Orders.Where(o => o.ShopId == id);
        var targetId = id.ToString();
        var activity = await db.AuditEntries.AsNoTracking()
            .Where(a => a.TargetType == "shop" && a.TargetId == targetId)
            .OrderByDescending(a => a.Id).Take(20)
            .Select(a => new AuditEntryDto(a.Id, a.At, a.ActorEmail, a.Action, a.TargetType, a.TargetId, a.Summary, a.IpAddress))
            .ToListAsync(ct);

        return Ok(new AdminShopDetailDto(
            shop.Id, shop.Name, shop.Description, shop.Phone, shop.AddressLine, shop.City, shop.Pincode,
            shop.UpiId, shop.DeliveryFee, shop.MinimumOrder, shop.IsActive, shop.IsOpen, ImageStorage.Url(shop.LogoPath),
            shop.CreatedAt, owner?.Id, owner?.FullName, owner?.Email,
            await db.Categories.CountAsync(c => c.ShopId == id, ct),
            await db.Items.CountAsync(i => i.ShopId == id, ct),
            await orders.CountAsync(ct),
            await orders.CountAsync(o => o.Status != OrderStatus.Delivered && o.Status != OrderStatus.Cancelled, ct),
            await orders.Where(o => o.Status == OrderStatus.Delivered).SumAsync(o => (decimal?)o.Total, ct) ?? 0,
            activity));
    }

    // ----- Exports (CSV, opens in Excel) -----

    [HttpGet("users/export")]
    public async Task<IActionResult> ExportUsers(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var rows = await db.Users.AsNoTracking().OrderBy(u => u.CreatedAt).Take(ExportLimit)
            .Select(u => new
            {
                u.FullName, u.Email, u.EmailConfirmed, u.LockoutEnd, u.CreatedAt,
                Roles = db.UserRoles.Where(ur => ur.UserId == u.Id)
                    .Join(db.Roles, ur => ur.RoleId, r => r.Id, (ur, r) => r.Name).ToList(),
                Shops = db.ShopMembers.Count(m => m.UserId == u.Id && m.Role == ShopRole.Owner),
                Orders = db.Orders.Count(o => o.CustomerId == u.Id),
            })
            .ToListAsync(ct);
        await audit.WriteAsync("export.users", $"Exported {rows.Count} users", ct: ct);
        return Csv.File($"smallmart-users-{now:yyyyMMdd-HHmm}.csv",
            ["Name", "Email", "Roles", "Email confirmed", "Suspended", "Shops owned", "Orders placed", "Joined (UTC)"],
            rows.Select(u => new object?[]
            {
                u.FullName, u.Email, string.Join(" + ", u.Roles.Order()), u.EmailConfirmed,
                u.LockoutEnd is { } end && end > now.AddYears(1), u.Shops, u.Orders, u.CreatedAt,
            }));
    }

    [HttpGet("shops/export")]
    public async Task<IActionResult> ExportShops(CancellationToken ct)
    {
        var rows = await db.Shops.AsNoTracking().OrderBy(s => s.CreatedAt).Take(ExportLimit)
            .Select(s => new
            {
                s.Name, s.Phone, s.AddressLine, s.City, s.Pincode, s.UpiId, s.IsActive, s.IsOpen, s.CreatedAt,
                OwnerName = s.Members.Where(m => m.Role == ShopRole.Owner).Select(m => m.User.FullName).FirstOrDefault(),
                OwnerEmail = s.Members.Where(m => m.Role == ShopRole.Owner).Select(m => m.User.Email).FirstOrDefault(),
                Items = db.Items.Count(i => i.ShopId == s.Id),
                Orders = db.Orders.Count(o => o.ShopId == s.Id),
            })
            .ToListAsync(ct);
        await audit.WriteAsync("export.shops", $"Exported {rows.Count} shops", ct: ct);
        return Csv.File($"smallmart-shops-{clock.GetUtcNow():yyyyMMdd-HHmm}.csv",
            ["Shop", "Owner", "Owner email", "Phone", "Address", "City", "Pincode", "UPI ID", "Active", "Taking orders", "Items", "Orders", "Opened (UTC)"],
            rows.Select(s => new object?[]
            {
                s.Name, s.OwnerName, s.OwnerEmail, s.Phone, s.AddressLine, s.City, s.Pincode, s.UpiId,
                s.IsActive, s.IsOpen, s.Items, s.Orders, s.CreatedAt,
            }));
    }

    [HttpGet("audit-logs/export")]
    public async Task<IActionResult> ExportAuditLogs(CancellationToken ct)
    {
        var rows = await db.AuditEntries.AsNoTracking().OrderByDescending(a => a.Id).Take(ExportLimit).ToListAsync(ct);
        await audit.WriteAsync("export.activity", $"Exported {rows.Count} activity entries", ct: ct);
        return Csv.File($"smallmart-activity-{clock.GetUtcNow():yyyyMMdd-HHmm}.csv",
            ["When (UTC)", "Who", "Action", "Description", "Target type", "Target id", "IP address"],
            rows.Select(a => new object?[] { a.At, a.ActorEmail, a.Action, a.Summary, a.TargetType, a.TargetId, a.IpAddress }));
    }

    private async Task<AdminUserDetailDto> ToDetailAsync(ApplicationUser user, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var roles = (await users.GetRolesAsync(user)).Order().ToList();
        var shops = await db.ShopMembers.Where(m => m.UserId == user.Id && m.Role == ShopRole.Owner)
            .OrderBy(m => m.Shop.Name)
            .Select(m => new AdminUserShopDto(m.Shop.Id, m.Shop.Name, m.Shop.City, m.Shop.IsActive))
            .ToListAsync(ct);
        var hasPassword = await users.HasPasswordAsync(user);
        var methods = (await users.GetLoginsAsync(user)).Select(l => l.LoginProvider).ToList();
        if (hasPassword)
            methods.Insert(0, "password");

        var targetId = user.Id.ToString();
        var activity = await db.AuditEntries.AsNoTracking()
            .Where(a => a.ActorUserId == user.Id || (a.TargetType == "user" && a.TargetId == targetId))
            .OrderByDescending(a => a.Id).Take(20)
            .Select(a => new AuditEntryDto(a.Id, a.At, a.ActorEmail, a.Action, a.TargetType, a.TargetId, a.Summary, a.IpAddress))
            .ToListAsync(ct);

        var dto = new AdminUserDto(
            user.Id, user.Email!, user.FullName, roles, user.EmailConfirmed,
            user.LockoutEnd is { } end && end > now.AddYears(1), shops.Count, user.CreatedAt);
        return new AdminUserDetailDto(dto, hasPassword, methods, shops,
            await db.Orders.CountAsync(o => o.CustomerId == user.Id, ct), activity);
    }
}
