using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using SmallMart.Api.Auth;

namespace SmallMart.Api.Tests;

[Collection("api")]
public class AuthTests(TestApp app)
{
    private const string Password = "Passw0rd123";

    private static async Task<string?> ErrorCode(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();

    [Fact]
    public async Task Register_confirm_login_and_read_profile()
    {
        var client = app.CreateClient();
        var email = TestApp.NewEmail();

        var register = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(email, Password, "Asha Verma"));
        Assert.Equal(HttpStatusCode.OK, register.StatusCode);

        var early = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, Password));
        Assert.Equal(HttpStatusCode.Forbidden, early.StatusCode);
        Assert.Equal("email_not_confirmed", await ErrorCode(early));

        var confirm = await client.PostAsJsonAsync("/api/auth/confirm-email", app.Emails.LinkFor(email));
        Assert.Equal(HttpStatusCode.OK, confirm.StatusCode);

        var auth = await TestApp.LoginAsync(client, email, Password);
        Assert.Equal(email, auth.User.Email);
        Assert.Equal([Roles.Customer], auth.User.Roles);

        var me = await client.GetFromJsonAsync<UserDto>("/api/auth/me");
        Assert.Equal("Asha Verma", me!.FullName);
        Assert.True(me.EmailConfirmed);
    }

    [Fact]
    public async Task Profile_requires_a_token()
    {
        var response = await app.CreateClient().GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Register_rejects_weak_password()
    {
        var response = await app.CreateClient().PostAsJsonAsync("/api/auth/register",
            new RegisterRequest(TestApp.NewEmail(), "short", "Weak"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("weak_password", await ErrorCode(response));
    }

    [Fact]
    public async Task Registering_an_existing_email_looks_the_same_and_changes_nothing()
    {
        var (_, _, email, password) = await app.SignedInUserAsync();
        var sentBefore = app.Emails.CountFor(email);
        var client = app.CreateClient();

        var again = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(email, "Different123", "Intruder"));

        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        Assert.Equal(sentBefore, app.Emails.CountFor(email));
        await TestApp.LoginAsync(client, email, password); // original password still works
    }

    [Fact]
    public async Task Confirm_email_rejects_a_bad_token()
    {
        var client = app.CreateClient();
        var email = TestApp.NewEmail();
        await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(email, Password, "Bad Token"));
        var link = app.Emails.LinkFor(email);

        var response = await client.PostAsJsonAsync("/api/auth/confirm-email", link with { Token = "bm90LWEtdG9rZW4" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_token", await ErrorCode(response));
    }

    [Fact]
    public async Task Wrong_password_is_rejected_and_five_failures_lock_the_account()
    {
        var (_, _, email, password) = await app.SignedInUserAsync();
        var client = app.CreateClient();

        for (var attempt = 1; attempt <= 4; attempt++)
        {
            var wrong = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, "WrongPass1"));
            Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);
        }
        var fifth = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, "WrongPass1"));
        Assert.Equal(HttpStatusCode.Locked, fifth.StatusCode);

        var correct = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, password));
        Assert.Equal(HttpStatusCode.Locked, correct.StatusCode);
    }

    [Fact]
    public async Task Unknown_email_gets_the_same_answer_as_a_wrong_password()
    {
        var response = await app.CreateClient().PostAsJsonAsync("/api/auth/login",
            new LoginRequest(TestApp.NewEmail(), Password));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("invalid_credentials", await ErrorCode(response));
    }

    [Fact]
    public async Task Refresh_rotates_the_token_and_reuse_ends_the_session()
    {
        var (client, auth, _, _) = await app.SignedInUserAsync();

        var first = await client.PostAsJsonAsync("/api/auth/refresh", new RefreshRequest(auth.RefreshToken));
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var rotated = (await first.Content.ReadFromJsonAsync<AuthResponse>())!;
        Assert.NotEqual(auth.RefreshToken, rotated.RefreshToken);

        // The old token was already used: treat it as stolen and end the whole session.
        var replay = await client.PostAsJsonAsync("/api/auth/refresh", new RefreshRequest(auth.RefreshToken));
        Assert.Equal(HttpStatusCode.Unauthorized, replay.StatusCode);
        var afterReplay = await client.PostAsJsonAsync("/api/auth/refresh", new RefreshRequest(rotated.RefreshToken));
        Assert.Equal(HttpStatusCode.Unauthorized, afterReplay.StatusCode);
    }

    [Fact]
    public async Task Concurrent_refreshes_cannot_both_succeed()
    {
        var (client, auth, _, _) = await app.SignedInUserAsync();

        var responses = await Task.WhenAll(Enumerable.Range(0, 5).Select(_ =>
            client.PostAsJsonAsync("/api/auth/refresh", new RefreshRequest(auth.RefreshToken))));

        Assert.True(responses.Count(r => r.StatusCode == HttpStatusCode.OK) <= 1);
    }

    [Fact]
    public async Task Logout_revokes_the_refresh_token()
    {
        var (client, auth, _, _) = await app.SignedInUserAsync();

        var logout = await client.PostAsJsonAsync("/api/auth/logout", new RefreshRequest(auth.RefreshToken));
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);

        var refresh = await client.PostAsJsonAsync("/api/auth/refresh", new RefreshRequest(auth.RefreshToken));
        Assert.Equal(HttpStatusCode.Unauthorized, refresh.StatusCode);
    }

    [Fact]
    public async Task Password_reset_changes_the_password_and_signs_out_other_sessions()
    {
        var (client, auth, email, oldPassword) = await app.SignedInUserAsync();

        (await client.PostAsJsonAsync("/api/auth/forgot-password", new EmailRequest(email))).EnsureSuccessStatusCode();
        var link = app.Emails.LinkFor(email);
        var reset = await client.PostAsJsonAsync("/api/auth/reset-password",
            new ResetPasswordRequest(link.UserId, link.Token, "NewPassw0rd456"));
        Assert.Equal(HttpStatusCode.OK, reset.StatusCode);

        var withOld = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, oldPassword));
        Assert.Equal(HttpStatusCode.Unauthorized, withOld.StatusCode);
        var oldSession = await client.PostAsJsonAsync("/api/auth/refresh", new RefreshRequest(auth.RefreshToken));
        Assert.Equal(HttpStatusCode.Unauthorized, oldSession.StatusCode);
        await TestApp.LoginAsync(client, email, "NewPassw0rd456");

        // A reset link works only once.
        var reuse = await client.PostAsJsonAsync("/api/auth/reset-password",
            new ResetPasswordRequest(link.UserId, link.Token, "Another789pass"));
        Assert.Equal(HttpStatusCode.BadRequest, reuse.StatusCode);
    }

    [Fact]
    public async Task Forgot_password_for_unknown_email_sends_nothing_but_looks_the_same()
    {
        var email = TestApp.NewEmail();
        var response = await app.CreateClient().PostAsJsonAsync("/api/auth/forgot-password", new EmailRequest(email));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(0, app.Emails.CountFor(email));
    }

    [Theory]
    [InlineData("google")]
    [InlineData("microsoft")]
    public async Task External_sign_in_creates_an_account_then_reuses_it(string provider)
    {
        var client = app.CreateClient();
        var email = TestApp.NewEmail();
        var idToken = $"{Guid.NewGuid():N}|{email}|true|Ravi Kumar";

        var first = await client.PostAsJsonAsync($"/api/auth/external/{provider}", new ExternalLoginRequest(idToken));
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var created = (await first.Content.ReadFromJsonAsync<AuthResponse>())!;
        Assert.Equal(email, created.User.Email);
        Assert.Equal("Ravi Kumar", created.User.FullName);
        Assert.True(created.User.EmailConfirmed);

        var second = await client.PostAsJsonAsync($"/api/auth/external/{provider}", new ExternalLoginRequest(idToken));
        var returning = (await second.Content.ReadFromJsonAsync<AuthResponse>())!;
        Assert.Equal(created.User.Id, returning.User.Id);
    }

    [Fact]
    public async Task External_sign_in_with_verified_email_links_to_the_existing_account()
    {
        var (_, auth, email, _) = await app.SignedInUserAsync();

        var response = await app.CreateClient().PostAsJsonAsync("/api/auth/external/google",
            new ExternalLoginRequest($"{Guid.NewGuid():N}|{email}|true|Same Person"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(auth.User.Id, (await response.Content.ReadFromJsonAsync<AuthResponse>())!.User.Id);
    }

    [Fact]
    public async Task External_sign_in_with_unverified_email_cannot_take_over_an_existing_account()
    {
        var (_, _, email, _) = await app.SignedInUserAsync();

        var response = await app.CreateClient().PostAsJsonAsync("/api/auth/external/microsoft",
            new ExternalLoginRequest($"{Guid.NewGuid():N}|{email}|false|Attacker"));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("account_exists", await ErrorCode(response));
    }

    [Fact]
    public async Task Verified_external_sign_in_cannot_join_an_account_whose_email_was_never_confirmed()
    {
        // Someone registers with the victim's email but can never confirm it...
        var client = app.CreateClient();
        var email = TestApp.NewEmail();
        await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(email, Password, "Squatter"));

        // ...so the real owner signing in with Google must not be merged into that account.
        var response = await client.PostAsJsonAsync("/api/auth/external/google",
            new ExternalLoginRequest($"{Guid.NewGuid():N}|{email}|true|Real Owner"));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task External_sign_in_rejects_invalid_tokens_and_unknown_providers()
    {
        var client = app.CreateClient();
        var invalid = await client.PostAsJsonAsync("/api/auth/external/google", new ExternalLoginRequest("garbage"));
        Assert.Equal(HttpStatusCode.Unauthorized, invalid.StatusCode);
        var unknown = await client.PostAsJsonAsync("/api/auth/external/facebook", new ExternalLoginRequest("a|b@c.d|true|n"));
        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
    }

    [Fact]
    public async Task A_tampered_access_token_is_rejected()
    {
        var (_, auth, _, _) = await app.SignedInUserAsync();
        var client = app.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken[..^3] + "abc");
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
    }
}
