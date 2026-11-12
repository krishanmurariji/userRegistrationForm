using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmallMart.Api.Domain;

namespace SmallMart.Api.Auth;

[ApiController]
[Route("api/admin/users")]
[Authorize(Roles = Roles.PlatformAdmin)]
public class AdminUsersController(UserManager<ApplicationUser> users, TokenService tokens) : ControllerBase
{
    public record AdminUserDto(Guid Id, string Email, string FullName, bool EmailConfirmed, bool Suspended, DateTimeOffset CreatedAt);

    [HttpGet]
    public async Task<IReadOnlyList<AdminUserDto>> List(
        [FromQuery] string? search, [FromQuery] int skip = 0, [FromQuery] int take = 50, CancellationToken ct = default)
    {
        var now = DateTimeOffset.UtcNow;
        var query = users.Users.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToUpperInvariant();
            query = query.Where(u => u.NormalizedEmail!.Contains(term) || u.FullName.ToUpper().Contains(term));
        }

        return await query.OrderBy(u => u.CreatedAt)
            .Skip(Math.Max(skip, 0)).Take(Math.Clamp(take, 1, 200))
            .Select(u => new AdminUserDto(u.Id, u.Email!, u.FullName, u.EmailConfirmed,
                u.LockoutEnd != null && u.LockoutEnd > now, u.CreatedAt))
            .ToListAsync(ct);
    }

    /// <summary>Blocks the account and signs it out everywhere.</summary>
    [HttpPost("{id:guid}/suspend")]
    public async Task<IActionResult> Suspend(Guid id, CancellationToken ct)
    {
        var user = await users.FindByIdAsync(id.ToString());
        if (user is null)
            return NotFound();
        if (await users.IsInRoleAsync(user, Roles.PlatformAdmin))
            return Conflict(new ProblemDetails { Title = "A platform admin cannot be suspended." });

        await users.SetLockoutEndDateAsync(user, DateTimeOffset.MaxValue);
        await tokens.RevokeAllForUserAsync(user.Id, ct);
        return NoContent();
    }

    [HttpPost("{id:guid}/unsuspend")]
    public async Task<IActionResult> Unsuspend(Guid id)
    {
        var user = await users.FindByIdAsync(id.ToString());
        if (user is null)
            return NotFound();
        await users.SetLockoutEndDateAsync(user, null);
        await users.ResetAccessFailedCountAsync(user);
        return NoContent();
    }
}
