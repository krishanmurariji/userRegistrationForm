using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using SmallMart.Api.Auth;

namespace SmallMart.Api.Tests;

/// <summary>The real Google validator (the API tests use a fake one) must refuse junk without throwing.</summary>
public class ExternalTokenValidatorTests
{
    private static GoogleTokenValidator Google(params string[] clientIds) => new(
        Options.Create(new ExternalAuthOptions { Google = new() { ClientIds = clientIds } }),
        NullLogger<GoogleTokenValidator>.Instance);

    [Theory]
    [InlineData("not.a.token")]
    [InlineData("garbage")]
    [InlineData("")]
    [InlineData("a.b")]
    [InlineData("eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0.")] // well-formed but unsigned
    public async Task Google_validator_refuses_text_that_is_not_a_valid_token(string token)
    {
        Assert.Null(await Google("client-id.apps.googleusercontent.com").ValidateAsync(token));
    }

    [Fact]
    public async Task Google_validator_refuses_everything_when_no_client_id_is_configured()
    {
        Assert.Null(await Google().ValidateAsync("not.a.token"));
    }
}
