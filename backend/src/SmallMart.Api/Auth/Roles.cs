namespace SmallMart.Api.Auth;

/// <summary>
/// An account has exactly one of these roles. Everyone who signs up is a <see cref="Customer"/>. Only a platform
/// admin can turn an account into a <see cref="ShopOwner"/>, and platform admins exist only through the startup seed.
/// A shop owner cannot shop and an admin cannot do either, so each kind of account sees only its own screens.
/// Manager / staff rights inside one shop are per-shop memberships, not global roles.
/// </summary>
public static class Roles
{
    public const string PlatformAdmin = "PlatformAdmin";
    public const string ShopOwner = "ShopOwner";
    public const string Customer = "Customer";

    public static readonly string[] All = [PlatformAdmin, ShopOwner, Customer];
}
