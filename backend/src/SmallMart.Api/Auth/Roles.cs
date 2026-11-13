namespace SmallMart.Api.Auth;

/// <summary>
/// Platform-wide roles. Everyone who signs up is a <see cref="Customer"/>. Only a platform admin can make
/// someone a <see cref="ShopOwner"/>, and platform admins exist only through the startup seed.
/// Manager / staff rights inside one shop are per-shop memberships, not global roles.
/// </summary>
public static class Roles
{
    public const string PlatformAdmin = "PlatformAdmin";
    public const string ShopOwner = "ShopOwner";
    public const string Customer = "Customer";

    public static readonly string[] All = [PlatformAdmin, ShopOwner, Customer];
}
