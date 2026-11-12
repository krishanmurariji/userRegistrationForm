namespace SmallMart.Api.Auth;

public class JwtOptions
{
    public const string Section = "Jwt";

    public string Issuer { get; set; } = "SmallMart";
    public string Audience { get; set; } = "SmallMart";
    /// <summary>Signing secret, at least 32 characters. Never commit a real one.</summary>
    public string Key { get; set; } = string.Empty;
    public int AccessTokenMinutes { get; set; } = 15;
    public int RefreshTokenDays { get; set; } = 30;
}
