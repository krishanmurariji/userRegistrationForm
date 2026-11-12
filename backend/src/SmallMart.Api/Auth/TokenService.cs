using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using SmallMart.Api.Data;
using SmallMart.Api.Domain;

namespace SmallMart.Api.Auth;

public class TokenService(
    AppDbContext db,
    UserManager<ApplicationUser> userManager,
    IOptions<JwtOptions> jwtOptions,
    TimeProvider clock)
{
    private readonly JwtOptions _jwt = jwtOptions.Value;

    /// <summary>Issues a new access token and refresh token. Pass <paramref name="familyId"/> when rotating.</summary>
    public async Task<AuthResponse> IssueAsync(ApplicationUser user, Guid? familyId = null, CancellationToken ct = default)
    {
        var now = clock.GetUtcNow();
        var roles = (await userManager.GetRolesAsync(user)).ToList();

        var accessExpires = now.AddMinutes(_jwt.AccessTokenMinutes);
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email ?? string.Empty),
            new("name", user.FullName),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
        };
        claims.AddRange(roles.Select(r => new Claim("role", r)));

        var accessToken = new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = _jwt.Issuer,
            Audience = _jwt.Audience,
            Subject = new ClaimsIdentity(claims),
            NotBefore = now.UtcDateTime,
            IssuedAt = now.UtcDateTime,
            Expires = accessExpires.UtcDateTime,
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwt.Key)), SecurityAlgorithms.HmacSha256),
        });

        var rawRefresh = Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));
        var refresh = new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            TokenHash = Hash(rawRefresh),
            FamilyId = familyId ?? Guid.NewGuid(),
            CreatedAt = now,
            ExpiresAt = now.AddDays(_jwt.RefreshTokenDays),
        };
        db.RefreshTokens.Add(refresh);
        await db.SaveChangesAsync(ct);

        return new AuthResponse(
            accessToken,
            accessExpires,
            rawRefresh,
            refresh.ExpiresAt,
            new UserDto(user.Id, user.Email ?? string.Empty, user.FullName, user.EmailConfirmed, roles));
    }

    /// <summary>
    /// Exchanges a refresh token for a new pair. Returns null when the token is unknown, expired or already used.
    /// Presenting an already-used token revokes every token from the same sign-in, because it means the token leaked.
    /// </summary>
    public async Task<AuthResponse?> RotateAsync(string rawRefreshToken, CancellationToken ct = default)
    {
        var now = clock.GetUtcNow();
        var hash = Hash(rawRefreshToken);
        var token = await db.RefreshTokens.AsNoTracking().Include(t => t.User)
            .SingleOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (token is null)
            return null;

        if (token.RevokedAt is not null)
        {
            await RevokeFamilyAsync(token.FamilyId, ct);
            return null;
        }

        if (token.ExpiresAt <= now)
            return null;

        // Atomic claim: only one concurrent request can consume the token.
        var claimed = await db.RefreshTokens
            .Where(t => t.Id == token.Id && t.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, now), ct);
        if (claimed == 0)
        {
            await RevokeFamilyAsync(token.FamilyId, ct);
            return null;
        }

        if (await userManager.IsLockedOutAsync(token.User))
            return null;

        return await IssueAsync(token.User, token.FamilyId, ct);
    }

    /// <summary>Signs out the session that owns this refresh token. Unknown tokens are ignored.</summary>
    public async Task RevokeAsync(string rawRefreshToken, CancellationToken ct = default)
    {
        var hash = Hash(rawRefreshToken);
        var familyId = await db.RefreshTokens.Where(t => t.TokenHash == hash)
            .Select(t => (Guid?)t.FamilyId).SingleOrDefaultAsync(ct);
        if (familyId is not null)
            await RevokeFamilyAsync(familyId.Value, ct);
    }

    /// <summary>Signs the user out everywhere, for example after a password reset.</summary>
    public Task RevokeAllForUserAsync(Guid userId, CancellationToken ct = default)
    {
        var now = clock.GetUtcNow();
        return db.RefreshTokens.Where(t => t.UserId == userId && t.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, now), ct);
    }

    private Task RevokeFamilyAsync(Guid familyId, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        return db.RefreshTokens.Where(t => t.FamilyId == familyId && t.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, now), ct);
    }

    private static string Hash(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
}
