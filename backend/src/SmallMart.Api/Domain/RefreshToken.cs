namespace SmallMart.Api.Domain;

/// <summary>
/// A long-lived token that lets the app get a new access token without asking the user to sign in again.
/// Only the SHA-256 hash is stored. Tokens are rotated on every use; all tokens that descend from one
/// sign-in share a <see cref="FamilyId"/>, so reuse of an old token revokes the whole family.
/// </summary>
public class RefreshToken
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;
    public string TokenHash { get; set; } = string.Empty;
    public Guid FamilyId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
}
