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
using SmallMart.Api.Notifications;

namespace SmallMart.Api.Admin;

[ApiController]
[Route("api/admin/users")]
[Authorize(Roles = Roles.PlatformAdmin)]
public class AdminUsersController(
    AppDbContext db,
    UserManager<ApplicationUser> users,
    TokenService tokens,
    IEmailSender email,
    AuditLog audit,
    Notifier notifier,
    IConfiguration config,
    TimeProvider clock) : ControllerBase
{
    /// <summary>Users, newest first. Filter with <c>search</c> (name or email), <c>role</c> and <c>suspended</c>.</summary>
    [HttpGet]
    public async Task<Page<AdminUserDto>> List(
        [FromQuery] string? search, [FromQuery] string? role, [FromQuery] bool? suspended,
        [FromQuery] int skip = 0, [FromQuery] int take = 50, CancellationToken ct = default)
    {
        var now = clock.GetUtcNow();
        var query = db.Users.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToUpperInvariant();
            query = query.Where(u => u.NormalizedEmail!.Contains(term) || u.FullName.ToUpper().Contains(term));
        }
        if (!string.IsNullOrWhiteSpace(role))
        {
            query = query.Where(u => db.UserRoles.Any(ur =>
                ur.UserId == u.Id && db.Roles.Any(r => r.Id == ur.RoleId && r.Name == role)));
        }
        if (suspended is not null)
        {
            query = suspended.Value
                ? query.Where(u => u.LockoutEnd != null && u.LockoutEnd > now.AddYears(1))
                : query.Where(u => u.LockoutEnd == null || u.LockoutEnd <= now.AddYears(1));
        }

        var total = await query.CountAsync(ct);
        var page = await query.OrderByDescending(u => u.CreatedAt).ThenBy(u => u.Id)
            .Skip(Math.Max(skip, 0)).Take(Math.Clamp(take, 1, 200))
            .ToListAsync(ct);

        var ids = page.Select(u => u.Id).ToList();
        var roles = await db.UserRoles.Where(ur => ids.Contains(ur.UserId))
            .Join(db.Roles, ur => ur.RoleId, r => r.Id, (ur, r) => new { ur.UserId, r.Name })
            .ToListAsync(ct);
        var shopCounts = await db.ShopMembers.Where(m => ids.Contains(m.UserId) && m.Role == ShopRole.Owner)
            .GroupBy(m => m.UserId).Select(g => new { UserId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.UserId, g => g.Count, ct);

        var items = page.Select(u => new AdminUserDto(
            u.Id, u.Email!, u.FullName,
            roles.Where(r => r.UserId == u.Id).Select(r => r.Name!).Order().ToList(),
            u.EmailConfirmed, IsSuspended(u, now), shopCounts.GetValueOrDefault(u.Id), u.CreatedAt)).ToList();
        return new Page<AdminUserDto>(items, total);
    }

    /// <summary>
    /// Creates a shop owner account. With a password the owner can sign in at once; without one they receive
    /// an email with a link to choose their password.
    /// </summary>
    [HttpPost("shop-owners")]
    public async Task<IActionResult> CreateShopOwner(CreateShopOwnerRequest request, CancellationToken ct)
    {
        if (await users.FindByEmailAsync(request.Email) is not null)
            return this.ApiError(StatusCodes.Status409Conflict, "email_taken",
                "An account with this email already exists. Find it in the user list and make it a shop owner.");

        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = request.Email,
            Email = request.Email,
            EmailConfirmed = true, // the admin vouches for the address
            FullName = request.FullName.Trim(),
            CreatedAt = clock.GetUtcNow(),
        };
        var hasPassword = !string.IsNullOrEmpty(request.Password);
        var result = hasPassword ? await users.CreateAsync(user, request.Password!) : await users.CreateAsync(user);
        if (!result.Succeeded)
            return this.ApiError(StatusCodes.Status400BadRequest, "invalid_account",
                string.Join(" ", result.Errors.Select(e => e.Description)));

        await users.AddToRolesAsync(user, [Roles.ShopOwner, Roles.Customer]);
        await audit.WriteAsync("user.shop_owner_created", $"Created shop owner {user.Email}", "user", user.Id, ct: ct);

        if (!hasPassword)
        {
            var token = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(await users.GeneratePasswordResetTokenAsync(user)));
            var link = $"{config["App:ClientUrl"]?.TrimEnd('/')}/reset-password?userId={user.Id}&token={token}";
            await email.SendAsync(user.Email!, "Your Small Mart shop owner account",
                $"<p>Hello {WebUtility.HtmlEncode(user.FullName)},</p>" +
                "<p>A shop owner account has been created for you on Small Mart.</p>" +
                $"<p><a href=\"{WebUtility.HtmlEncode(link)}\">Choose your password</a> to get started. This link expires in 24 hours.</p>", ct);
        }

        return StatusCode(StatusCodes.Status201Created, await ToDtoAsync(user));
    }

    /// <summary>Makes an existing customer a shop owner. Takes effect the next time their sign-in refreshes.</summary>
    [HttpPost("{id:guid}/shop-owner")]
    public async Task<IActionResult> MakeShopOwner(Guid id, CancellationToken ct)
    {
        var user = await users.FindByIdAsync(id.ToString());
        if (user is null)
            return NotFound();
        if (await users.IsInRoleAsync(user, Roles.PlatformAdmin))
            return this.ApiError(StatusCodes.Status409Conflict, "is_admin", "A platform admin cannot be a shop owner.");

        if (!await users.IsInRoleAsync(user, Roles.ShopOwner))
        {
            await users.AddToRoleAsync(user, Roles.ShopOwner);
            await audit.WriteAsync("user.made_shop_owner", $"Made {user.Email} a shop owner", "user", user.Id, ct: ct);
            await notifier.ToUserAsync(user.Id, "You can now open a shop",
                "Your account is a shop owner account. Sign out and in again, then choose \"Manage my shops\".", "/my-shops", ct);
        }
        return Ok(await ToDtoAsync(user));
    }

    /// <summary>
    /// Takes the shop owner role away. Refused while the user still owns shops, so no shop is left without
    /// an owner who can manage it; deactivate those shops instead.
    /// </summary>
    [HttpDelete("{id:guid}/shop-owner")]
    public async Task<IActionResult> RemoveShopOwner(Guid id, CancellationToken ct)
    {
        var user = await users.FindByIdAsync(id.ToString());
        if (user is null)
            return NotFound();
        if (await db.ShopMembers.AnyAsync(m => m.UserId == id && m.Role == ShopRole.Owner, ct))
            return this.ApiError(StatusCodes.Status409Conflict, "owns_shops",
                "This user still owns shops. Deactivate the shops, or suspend the user instead.");

        if (await users.IsInRoleAsync(user, Roles.ShopOwner))
        {
            await users.RemoveFromRoleAsync(user, Roles.ShopOwner);
            await audit.WriteAsync("user.shop_owner_removed", $"Removed shop owner role from {user.Email}", "user", user.Id, ct: ct);
        }
        return Ok(await ToDtoAsync(user));
    }

    /// <summary>Blocks the account and signs it out everywhere.</summary>
    [HttpPost("{id:guid}/suspend")]
    public async Task<IActionResult> Suspend(Guid id, CancellationToken ct)
    {
        var user = await users.FindByIdAsync(id.ToString());
        if (user is null)
            return NotFound();
        if (await users.IsInRoleAsync(user, Roles.PlatformAdmin))
            return this.ApiError(StatusCodes.Status409Conflict, "is_admin", "A platform admin cannot be suspended.");

        await users.SetLockoutEndDateAsync(user, DateTimeOffset.MaxValue);
        await tokens.RevokeAllForUserAsync(user.Id, ct);
        await audit.WriteAsync("user.suspended", $"Suspended {user.Email}", "user", user.Id, ct: ct);
        return Ok(await ToDtoAsync(user));
    }

    [HttpPost("{id:guid}/unsuspend")]
    public async Task<IActionResult> Unsuspend(Guid id, CancellationToken ct)
    {
        var user = await users.FindByIdAsync(id.ToString());
        if (user is null)
            return NotFound();

        await users.SetLockoutEndDateAsync(user, null);
        await users.ResetAccessFailedCountAsync(user);
        await audit.WriteAsync("user.reactivated", $"Reactivated {user.Email}", "user", user.Id, ct: ct);
        return Ok(await ToDtoAsync(user));
    }

    /// <summary>Suspended means blocked by an admin (far-future lockout), not the 15-minute wrong-password lock.</summary>
    private static bool IsSuspended(ApplicationUser u, DateTimeOffset now) =>
        u.LockoutEnd is { } end && end > now.AddYears(1);

    private async Task<AdminUserDto> ToDtoAsync(ApplicationUser u)
    {
        var roles = (await users.GetRolesAsync(u)).Order().ToList();
        var shops = await db.ShopMembers.CountAsync(m => m.UserId == u.Id && m.Role == ShopRole.Owner);
        return new AdminUserDto(u.Id, u.Email!, u.FullName, roles, u.EmailConfirmed, IsSuspended(u, clock.GetUtcNow()), shops, u.CreatedAt);
    }
}
