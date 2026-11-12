using Google.Apis.Auth;
using Microsoft.Extensions.Options;
using JsonWebToken = Microsoft.IdentityModel.JsonWebTokens.JsonWebToken;
using JsonWebTokenHandler = Microsoft.IdentityModel.JsonWebTokens.JsonWebTokenHandler;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace SmallMart.Api.Auth;

/// <summary>The verified identity taken from a Google or Microsoft ID token.</summary>
/// <param name="Subject">The provider's stable, unique id for the account.</param>
/// <param name="EmailVerified">True only when the provider vouches that the user controls the email address.</param>
public record ExternalIdentity(string Subject, string? Email, bool EmailVerified, string? Name);

public interface IExternalTokenValidator
{
    /// <summary>Provider name used in the URL and stored with the login, for example "google".</summary>
    string Provider { get; }

    /// <summary>Returns the identity, or null when the token is invalid or the provider is not configured.</summary>
    Task<ExternalIdentity?> ValidateAsync(string idToken, CancellationToken ct = default);
}

public class ExternalAuthOptions
{
    public const string Section = "Authentication";

    public ProviderOptions Google { get; set; } = new();
    public ProviderOptions Microsoft { get; set; } = new();

    public class ProviderOptions
    {
        /// <summary>OAuth client ids allowed to sign in (web, Android and iOS clients each have their own).</summary>
        public string[] ClientIds { get; set; } = [];
    }
}

public class GoogleTokenValidator(IOptions<ExternalAuthOptions> options, ILogger<GoogleTokenValidator> logger)
    : IExternalTokenValidator
{
    public string Provider => "google";

    public async Task<ExternalIdentity?> ValidateAsync(string idToken, CancellationToken ct = default)
    {
        var clientIds = options.Value.Google.ClientIds;
        if (clientIds.Length == 0)
        {
            logger.LogWarning("Google sign-in attempted but Authentication:Google:ClientIds is empty.");
            return null;
        }

        try
        {
            var payload = await GoogleJsonWebSignature.ValidateAsync(idToken,
                new GoogleJsonWebSignature.ValidationSettings { Audience = clientIds });
            return new ExternalIdentity(payload.Subject, payload.Email, payload.EmailVerified, payload.Name);
        }
        catch (InvalidJwtException ex)
        {
            logger.LogInformation("Rejected Google ID token: {Reason}", ex.Message);
            return null;
        }
    }
}

public class MicrosoftTokenValidator(IOptions<ExternalAuthOptions> options, ILogger<MicrosoftTokenValidator> logger)
    : IExternalTokenValidator
{
    private const string Authority = "https://login.microsoftonline.com";

    // Signing keys for personal and work/school accounts; cached and refreshed automatically.
    private static readonly ConfigurationManager<OpenIdConnectConfiguration> Metadata = new(
        $"{Authority}/common/v2.0/.well-known/openid-configuration",
        new OpenIdConnectConfigurationRetriever());

    public string Provider => "microsoft";

    public async Task<ExternalIdentity?> ValidateAsync(string idToken, CancellationToken ct = default)
    {
        var clientIds = options.Value.Microsoft.ClientIds;
        if (clientIds.Length == 0)
        {
            logger.LogWarning("Microsoft sign-in attempted but Authentication:Microsoft:ClientIds is empty.");
            return null;
        }

        var config = await Metadata.GetConfigurationAsync(ct);
        var result = await new JsonWebTokenHandler().ValidateTokenAsync(idToken, new TokenValidationParameters
        {
            ValidAudiences = clientIds,
            IssuerSigningKeys = config.SigningKeys,
            ValidateIssuerSigningKey = true,
            ValidateLifetime = true,
            // Microsoft issues tokens from a different issuer per tenant, so check it against the token's tenant id.
            IssuerValidator = (issuer, token, parameters) =>
            {
                var tid = ((JsonWebToken)token).GetClaim("tid").Value;
                if (Guid.TryParse(tid, out _) && issuer == $"{Authority}/{tid}/v2.0")
                    return issuer;
                throw new SecurityTokenInvalidIssuerException("Unexpected issuer.");
            },
        });

        if (!result.IsValid)
        {
            logger.LogInformation("Rejected Microsoft ID token: {Reason}", result.Exception?.Message);
            return null;
        }

        var jwt = (JsonWebToken)result.SecurityToken;
        if (!jwt.TryGetPayloadValue<string>("tid", out var tenantId) ||
            !jwt.TryGetPayloadValue<string>("oid", out var objectId))
        {
            logger.LogInformation("Rejected Microsoft ID token: missing tid or oid claim (request the 'profile' scope).");
            return null;
        }

        jwt.TryGetPayloadValue<string>("email", out var email);
        if (string.IsNullOrEmpty(email) &&
            jwt.TryGetPayloadValue<string>("preferred_username", out var username) && username.Contains('@'))
        {
            email = username;
        }
        jwt.TryGetPayloadValue<string>("name", out var name);

        // Microsoft email claims can be set by a tenant admin to any value. Only "xms_edov" (an optional claim)
        // proves the domain owner was verified, so without it the email is treated as unverified.
        var verified = jwt.TryGetPayloadValue<object>("xms_edov", out var edov) &&
                       edov?.ToString() is "True" or "true" or "1";

        return new ExternalIdentity($"{tenantId}.{objectId}", email, verified, name);
    }
}
