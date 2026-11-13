using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using SmallMart.Api.Admin;
using SmallMart.Api.Auth;
using SmallMart.Api.Shops;

namespace SmallMart.Api.Tests;

[Collection("api")]
public class AdminDetailTests(TestApp app)
{
    private static async Task<T> Read<T>(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    private static async Task<string?> ErrorCode(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();

    [Theory]
    [InlineData("GET", "/api/admin/users/00000000-0000-0000-0000-000000000001")]
    [InlineData("PUT", "/api/admin/users/00000000-0000-0000-0000-000000000001")]
    [InlineData("POST", "/api/admin/users/00000000-0000-0000-0000-000000000001/send-password-reset")]
    [InlineData("GET", "/api/admin/shops/00000000-0000-0000-0000-000000000001")]
    [InlineData("GET", "/api/admin/users/export")]
    [InlineData("GET", "/api/admin/shops/export")]
    [InlineData("GET", "/api/admin/audit-logs/export")]
    public async Task Detail_and_export_endpoints_are_admin_only(string method, string url)
    {
        var (owner, _, _, _) = await app.SignedInOwnerAsync();
        HttpRequestMessage Request() => new(new HttpMethod(method), url) { Content = JsonContent.Create(new { }) };
        Assert.Equal(HttpStatusCode.Unauthorized, (await app.CreateClient().SendAsync(Request())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.SendAsync(Request())).StatusCode);
    }

    [Fact]
    public async Task User_detail_shows_sign_in_methods_shops_and_activity()
    {
        var (owner, auth, email, _) = await app.SignedInOwnerAsync();
        var shop = await Read<ShopDto>(await owner.PostAsJsonAsync("/api/shops",
            new ShopRequest("Detail Store", null, "9876543210", "1 Main Road", "Pune", "411001", null, 0, 0)));
        var admin = await app.AdminClientAsync();

        var detail = await admin.GetFromJsonAsync<AdminUserDetailDto>($"/api/admin/users/{auth.User.Id}");
        Assert.Equal(email, detail!.User.Email);
        Assert.True(detail.HasPassword);
        Assert.Equal(["password"], detail.SignInMethods);
        Assert.Equal(shop.Id, Assert.Single(detail.Shops).Id);
        Assert.Contains(detail.RecentActivity, a => a.Action == "shop.created");
        Assert.Contains(detail.RecentActivity, a => a.Action == "user.registered");

        var social = await Read<AuthResponse>(await app.CreateClient().PostAsJsonAsync("/api/auth/external/google",
            new ExternalLoginRequest($"{Guid.NewGuid():N}|{TestApp.NewEmail()}|true|Google Person")));
        var socialDetail = await admin.GetFromJsonAsync<AdminUserDetailDto>($"/api/admin/users/{social.User.Id}");
        Assert.False(socialDetail!.HasPassword);
        Assert.Equal(["google"], socialDetail.SignInMethods);

        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/admin/users/{Guid.NewGuid()}")).StatusCode);
    }

    [Fact]
    public async Task Admin_can_correct_a_users_name_and_email()
    {
        var (client, auth, oldEmail, password) = await app.SignedInUserAsync();
        var (_, _, takenEmail, _) = await app.SignedInUserAsync();
        var admin = await app.AdminClientAsync();
        var newEmail = TestApp.NewEmail();

        var taken = await admin.PutAsJsonAsync($"/api/admin/users/{auth.User.Id}", new UpdateUserRequest("New Name", takenEmail));
        Assert.Equal("email_taken", await ErrorCode(taken));
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/admin/users/{auth.User.Id}", new UpdateUserRequest("", "not-an-email"))).StatusCode);

        var updated = await Read<AdminUserDetailDto>(await admin.PutAsJsonAsync($"/api/admin/users/{auth.User.Id}", new UpdateUserRequest("  Corrected Name ", newEmail)));
        Assert.Equal("Corrected Name", updated.User.FullName);
        Assert.Equal(newEmail, updated.User.Email);
        Assert.Contains(updated.RecentActivity, a => a.Action == "user.email_changed");
        Assert.Contains(updated.RecentActivity, a => a.Action == "user.renamed");

        // The old session is ended, the old email no longer signs in, the new one does.
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/auth/refresh", new RefreshRequest(auth.RefreshToken))).StatusCode);
        client.DefaultRequestHeaders.Authorization = null;
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(oldEmail, password))).StatusCode);
        var signedIn = await TestApp.LoginAsync(client, newEmail, password);
        Assert.Equal("Corrected Name", signedIn.User.FullName);

        // Changing only the name keeps the session.
        var renamed = await Read<AdminUserDetailDto>(await admin.PutAsJsonAsync($"/api/admin/users/{auth.User.Id}", new UpdateUserRequest("Another Name", newEmail.ToUpperInvariant())));
        Assert.Equal(newEmail, renamed.User.Email);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/auth/refresh", new RefreshRequest(signedIn.RefreshToken))).StatusCode);
    }

    [Fact]
    public async Task Admin_can_send_a_password_reset_link_but_never_sets_the_password()
    {
        var (client, auth, email, _) = await app.SignedInUserAsync();
        var admin = await app.AdminClientAsync();
        var before = app.Emails.CountFor(email);

        Assert.Equal(HttpStatusCode.NoContent, (await admin.PostAsync($"/api/admin/users/{auth.User.Id}/send-password-reset", null)).StatusCode);
        Assert.Equal(before + 1, app.Emails.CountFor(email));

        var link = app.Emails.LinkFor(email);
        (await client.PostAsJsonAsync("/api/auth/reset-password", new ResetPasswordRequest(link.UserId, link.Token, "FromAdminLink1"))).EnsureSuccessStatusCode();
        await TestApp.LoginAsync(client, email, "FromAdminLink1");
    }

    [Fact]
    public async Task The_admin_account_cannot_be_edited_or_reset_from_the_admin_section()
    {
        var admin = await app.AdminClientAsync();
        var me = (await admin.GetFromJsonAsync<Page<AdminUserDto>>($"/api/admin/users?search={TestApp.AdminEmail}"))!.Items.Single();

        Assert.Equal("is_admin", await ErrorCode(await admin.PutAsJsonAsync($"/api/admin/users/{me.Id}", new UpdateUserRequest("Hacked", TestApp.NewEmail()))));
        Assert.Equal("is_admin", await ErrorCode(await admin.PostAsync($"/api/admin/users/{me.Id}/send-password-reset", null)));
    }

    [Fact]
    public async Task Shop_detail_shows_owner_counts_and_activity()
    {
        var (owner, _, ownerEmail, _) = await app.SignedInOwnerAsync();
        var shop = await Read<ShopDto>(await owner.PostAsJsonAsync("/api/shops",
            new ShopRequest("Inspect Me", "About", "9876543210", "9 Hill Road", "Nashik", "422001", "inspect@upi", 15, 50)));
        await owner.PostAsJsonAsync($"/api/shops/{shop.Id}/categories", new CategoryRequest("Dairy"));
        await owner.PostAsJsonAsync($"/api/shops/{shop.Id}/items", new ItemRequest("Milk", null, null, 30, null, "500 ml", null));
        var admin = await app.AdminClientAsync();
        await admin.PostAsync($"/api/admin/shops/{shop.Id}/deactivate", null);

        var detail = await admin.GetFromJsonAsync<AdminShopDetailDto>($"/api/admin/shops/{shop.Id}");
        Assert.Equal("Inspect Me", detail!.Name);
        Assert.Equal(ownerEmail, detail.OwnerEmail);
        Assert.Equal("inspect@upi", detail.UpiId);
        Assert.False(detail.IsActive);
        Assert.Equal((1, 1, 0), (detail.CategoryCount, detail.ItemCount, detail.OrderCount));
        Assert.Equal(["shop.deactivated", "shop.created"], detail.RecentActivity.Select(a => a.Action));
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/admin/shops/{Guid.NewGuid()}")).StatusCode);
    }

    [Fact]
    public async Task Exports_are_CSV_files_Excel_can_open_and_are_safe_from_formula_injection()
    {
        var evilName = "=HYPERLINK(\"http://evil\",\"x\")";
        var email = TestApp.NewEmail();
        await app.CreateClient().PostAsJsonAsync("/api/auth/register", new RegisterRequest(email, "Passw0rd123", evilName));
        var (owner, _, ownerEmail, _) = await app.SignedInOwnerAsync();
        await owner.PostAsJsonAsync("/api/shops", new ShopRequest("Comma, \"Quote\" Store", null, "9876543210", "1 Road", "Pune", "411001", null, 0, 0));
        var admin = await app.AdminClientAsync();

        var response = await admin.GetAsync("/api/admin/users/export");
        Assert.Equal("text/csv", response.Content.Headers.ContentType!.MediaType);
        Assert.EndsWith(".csv", response.Content.Headers.ContentDisposition!.FileName!.Trim('"'));
        var bytes = await response.Content.ReadAsByteArrayAsync();
        Assert.Equal(Encoding.UTF8.GetPreamble(), bytes[..3]);
        var users = Encoding.UTF8.GetString(bytes[3..]);
        Assert.StartsWith("Name,Email,Roles,", users);
        Assert.Contains($",{email},Customer,", users);
        Assert.Contains("\"'=HYPERLINK(\"\"http://evil\"\",\"\"x\"\")\"", users);   // neutralised and quoted
        Assert.DoesNotContain("\n=HYPERLINK", users);
        Assert.Contains($"{ownerEmail},Customer + ShopOwner,", users);

        var shops = await admin.GetStringAsync("/api/admin/shops/export");
        Assert.Contains("\"Comma, \"\"Quote\"\" Store\"", shops);
        Assert.Contains(ownerEmail, shops);

        var activity = await admin.GetStringAsync("/api/admin/audit-logs/export");
        Assert.Contains("export.users", activity);
        Assert.Contains("user.registered", activity);
    }

    [Fact]
    public async Task Dashboard_counts_orders_and_payments_waiting()
    {
        var admin = await app.AdminClientAsync();
        var stats = await admin.GetFromJsonAsync<AdminStatsDto>("/api/admin/stats");
        Assert.True(stats!.Orders >= 0);
        Assert.True(stats.OrdersLast24Hours <= stats.Orders);
        Assert.True(stats.PaymentsAwaitingVerification <= stats.Orders);
    }
}
