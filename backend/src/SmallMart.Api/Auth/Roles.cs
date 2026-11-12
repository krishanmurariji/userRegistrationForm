namespace SmallMart.Api.Auth;

/// <summary>
/// Platform-wide roles. Shop owner / manager / staff are per-shop memberships (added in phase 2), not global roles.
/// </summary>
public static class Roles
{
    public const string PlatformAdmin = "PlatformAdmin";
    public const string User = "User";

    public static readonly string[] All = [PlatformAdmin, User];
}
