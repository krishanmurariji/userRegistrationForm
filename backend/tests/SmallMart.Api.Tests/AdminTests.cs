using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using SmallMart.Api.Admin;
using SmallMart.Api.Auth;
using SmallMart.Api.Shops;

namespace SmallMart.Api.Tests;

[Collection("api")]
public class AdminTests(TestApp app)
{
    private static readonly ShopRequest Shop = new(
        "Admin Test Store", null, "9876543210", "1 Main Road", "Pune", "411001", null, 0, 0);

    private static async Task<T> Read<T>(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    private static async Task<string?> ErrorCode(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();

    private static async Task<AdminUserDto> FindUser(HttpClient admin, string email) =>
        (await admin.GetFromJsonAsync<Page<AdminUserDto>>($"/api/admin/users?search={email}"))!.Items.Single();

    [Theory]
    [InlineData("GET", "/api/admin/users")]
    [InlineData("GET", "/api/admin/shops")]
    [InlineData("GET", "/api/admin/stats")]
    [InlineData("GET", "/api/admin/audit-logs")]
    [InlineData("POST", "/api/admin/users/shop-owners")]
    [InlineData("POST", "/api/admin/users/00000000-0000-0000-0000-000000000001/suspend")]
    [InlineData("POST", "/api/admin/users/00000000-0000-0000-0000-000000000001/shop-owner")]
    [InlineData("POST", "/api/admin/shops/00000000-0000-0000-0000-000000000001/deactivate")]
    public async Task Admin_area_is_closed_to_everyone_but_the_platform_admin(string method, string url)
    {
        var (customer, _, _, _) = await app.SignedInUserAsync();
        var (owner, _, _, _) = await app.SignedInOwnerAsync();
        HttpRequestMessage Request() => new(new HttpMethod(method), url) { Content = JsonContent.Create(new { }) };

        Assert.Equal(HttpStatusCode.Unauthorized, (await app.CreateClient().SendAsync(Request())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await customer.SendAsync(Request())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.SendAsync(Request())).StatusCode);
    }

    [Fact]
    public async Task The_seeded_admin_is_only_an_admin_and_nobody_can_sign_up_as_one()
    {
        var client = app.CreateClient();
        var admin = await TestApp.LoginAsync(client, TestApp.AdminEmail, TestApp.AdminPassword);
        Assert.Equal([Roles.PlatformAdmin], admin.User.Roles);

        // Extra fields in a sign-up request are ignored: the account is always a customer.
        var email = TestApp.NewEmail();
        var sneaky = await client.PostAsJsonAsync("/api/auth/register",
            new { email, password = "Passw0rd123", fullName = "Sneaky", roles = new[] { "PlatformAdmin" }, role = "PlatformAdmin" });
        Assert.Equal(HttpStatusCode.OK, sneaky.StatusCode);
        Assert.Equal([Roles.Customer], (await FindUser(client, email)).Roles);
    }

    [Fact]
    public async Task Users_can_be_listed_searched_and_filtered()
    {
        var (_, _, customerEmail, _) = await app.SignedInUserAsync();
        var (_, _, ownerEmail, _) = await app.SignedInOwnerAsync();
        var admin = await app.AdminClientAsync();

        Assert.Equal([Roles.Customer], (await FindUser(admin, customerEmail)).Roles);
        Assert.Equal([Roles.Customer, Roles.ShopOwner], (await FindUser(admin, ownerEmail)).Roles);

        var owners = await admin.GetFromJsonAsync<Page<AdminUserDto>>($"/api/admin/users?role={Roles.ShopOwner}&take=200");
        Assert.Contains(owners!.Items, u => u.Email == ownerEmail);
        Assert.DoesNotContain(owners.Items, u => u.Email == customerEmail);
        Assert.True(owners.Total >= owners.Items.Count);

        var firstPage = await admin.GetFromJsonAsync<Page<AdminUserDto>>("/api/admin/users?take=1");
        Assert.Single(firstPage!.Items);
        Assert.True(firstPage.Total > 1);
    }

    [Fact]
    public async Task Admin_creates_a_shop_owner_with_a_password_who_can_then_open_a_shop()
    {
        var admin = await app.AdminClientAsync();
        var email = TestApp.NewEmail();

        var created = await Read<AdminUserDto>(await admin.PostAsJsonAsync("/api/admin/users/shop-owners",
            new CreateShopOwnerRequest(email, "Sunita Rao", "Owner12345")));
        Assert.Equal([Roles.Customer, Roles.ShopOwner], created.Roles);
        Assert.True(created.EmailConfirmed);
        Assert.Equal(0, app.Emails.CountFor(email));

        var owner = app.CreateClient();
        await TestApp.LoginAsync(owner, email, "Owner12345");
        var shop = await Read<ShopDto>(await owner.PostAsJsonAsync("/api/shops", Shop));
        Assert.Equal("Owner", shop.MyRole);
        Assert.Equal(1, (await FindUser(admin, email)).ShopCount);

        var duplicate = await admin.PostAsJsonAsync("/api/admin/users/shop-owners", new CreateShopOwnerRequest(email, "Again", null));
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
        Assert.Equal("email_taken", await ErrorCode(duplicate));

        var weak = await admin.PostAsJsonAsync("/api/admin/users/shop-owners", new CreateShopOwnerRequest(TestApp.NewEmail(), "Weak", "123"));
        Assert.Equal(HttpStatusCode.BadRequest, weak.StatusCode);
    }

    [Fact]
    public async Task A_shop_owner_created_without_a_password_is_invited_by_email()
    {
        var admin = await app.AdminClientAsync();
        var email = TestApp.NewEmail();
        await Read<AdminUserDto>(await admin.PostAsJsonAsync("/api/admin/users/shop-owners",
            new CreateShopOwnerRequest(email, "Imran Khan", null)));

        var owner = app.CreateClient();
        var noPassword = await owner.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, "anything1"));
        Assert.Equal(HttpStatusCode.Unauthorized, noPassword.StatusCode);

        var link = app.Emails.LinkFor(email);
        (await owner.PostAsJsonAsync("/api/auth/reset-password",
            new ResetPasswordRequest(link.UserId, link.Token, "Chosen12345"))).EnsureSuccessStatusCode();
        var auth = await TestApp.LoginAsync(owner, email, "Chosen12345");
        Assert.Contains(Roles.ShopOwner, auth.User.Roles);
    }

    [Fact]
    public async Task An_existing_customer_can_be_made_a_shop_owner_and_back()
    {
        var (client, auth, email, password) = await app.SignedInUserAsync();
        var admin = await app.AdminClientAsync();
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/shops", Shop)).StatusCode);

        var promoted = await Read<AdminUserDto>(await admin.PostAsync($"/api/admin/users/{auth.User.Id}/shop-owner", null));
        Assert.Contains(Roles.ShopOwner, promoted.Roles);

        await TestApp.LoginAsync(client, email, password);
        var shop = await Read<ShopDto>(await client.PostAsJsonAsync("/api/shops", Shop));

        // The role cannot be removed while a shop would be left without its owner.
        var blocked = await admin.DeleteAsync($"/api/admin/users/{auth.User.Id}/shop-owner");
        Assert.Equal("owns_shops", await ErrorCode(blocked));
        Assert.NotEqual(Guid.Empty, shop.Id);

        var (_, other, _, _) = await app.SignedInOwnerAsync();
        var demoted = await Read<AdminUserDto>(await admin.DeleteAsync($"/api/admin/users/{other.User.Id}/shop-owner"));
        Assert.Equal([Roles.Customer], demoted.Roles);
    }

    [Fact]
    public async Task Suspending_a_user_blocks_sign_in_and_refresh_until_reactivated()
    {
        var (client, auth, email, password) = await app.SignedInUserAsync();
        var admin = await app.AdminClientAsync();

        var suspended = await Read<AdminUserDto>(await admin.PostAsync($"/api/admin/users/{auth.User.Id}/suspend", null));
        Assert.True(suspended.Suspended);
        var list = await admin.GetFromJsonAsync<Page<AdminUserDto>>($"/api/admin/users?suspended=true&search={email}");
        Assert.Single(list!.Items);

        client.DefaultRequestHeaders.Authorization = null;
        Assert.Equal(HttpStatusCode.Locked, (await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, password))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/auth/refresh", new RefreshRequest(auth.RefreshToken))).StatusCode);

        var restored = await Read<AdminUserDto>(await admin.PostAsync($"/api/admin/users/{auth.User.Id}/unsuspend", null));
        Assert.False(restored.Suspended);
        await TestApp.LoginAsync(client, email, password);
    }

    [Fact]
    public async Task The_admin_cannot_be_suspended_or_made_a_shop_owner()
    {
        var admin = await app.AdminClientAsync();
        var me = await FindUser(admin, TestApp.AdminEmail);

        Assert.Equal("is_admin", await ErrorCode(await admin.PostAsync($"/api/admin/users/{me.Id}/suspend", null)));
        Assert.Equal("is_admin", await ErrorCode(await admin.PostAsync($"/api/admin/users/{me.Id}/shop-owner", null)));
    }

    [Fact]
    public async Task A_wrong_password_lock_is_not_shown_as_suspended()
    {
        var (_, _, email, _) = await app.SignedInUserAsync();
        var client = app.CreateClient();
        for (var i = 0; i < 5; i++)
            await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, "WrongPass1"));

        var admin = await app.AdminClientAsync();
        Assert.False((await FindUser(admin, email)).Suspended);
    }

    [Fact]
    public async Task Deactivating_a_shop_freezes_it_for_its_owner_until_activated()
    {
        var (owner, _, ownerEmail, _) = await app.SignedInOwnerAsync();
        var shop = await Read<ShopDto>(await owner.PostAsJsonAsync("/api/shops", Shop with { Name = "Freeze Me" }));
        var category = await Read<CategoryDto>(await owner.PostAsJsonAsync($"/api/shops/{shop.Id}/categories", new CategoryRequest("Snacks")));
        var item = await Read<ItemDto>(await owner.PostAsJsonAsync($"/api/shops/{shop.Id}/items",
            new ItemRequest("Chips", null, category.Id, 20, null, "1 pack", null)));
        var admin = await app.AdminClientAsync();

        var listed = (await admin.GetFromJsonAsync<Page<AdminShopDto>>($"/api/admin/shops?search={ownerEmail}"))!.Items.Single();
        Assert.Equal(shop.Id, listed.Id);
        Assert.Equal(ownerEmail, listed.OwnerEmail);
        Assert.Equal(1, listed.ItemCount);
        Assert.True(listed.IsActive);

        Assert.Equal(HttpStatusCode.NoContent, (await admin.PostAsync($"/api/admin/shops/{shop.Id}/deactivate", null)).StatusCode);
        Assert.Empty((await admin.GetFromJsonAsync<Page<AdminShopDto>>($"/api/admin/shops?search={ownerEmail}&active=true"))!.Items);

        // The owner can still look, but every change is refused.
        Assert.False((await owner.GetFromJsonAsync<ShopDto>($"/api/shops/{shop.Id}"))!.IsActive);
        Assert.Single((await owner.GetFromJsonAsync<List<ItemDto>>($"/api/shops/{shop.Id}/items"))!);
        var itemBody = new ItemRequest("Chips XL", null, category.Id, 30, null, "1 pack", null);
        HttpResponseMessage[] refused =
        [
            await owner.PutAsJsonAsync($"/api/shops/{shop.Id}", Shop with { Name = "Renamed" }),
            await owner.PostAsJsonAsync($"/api/shops/{shop.Id}/categories", new CategoryRequest("New")),
            await owner.PutAsJsonAsync($"/api/shops/{shop.Id}/categories/{category.Id}", new CategoryRequest("Renamed")),
            await owner.DeleteAsync($"/api/shops/{shop.Id}/categories/{category.Id}"),
            await owner.PostAsJsonAsync($"/api/shops/{shop.Id}/items", itemBody),
            await owner.PutAsJsonAsync($"/api/shops/{shop.Id}/items/{item.Id}", itemBody),
            await owner.DeleteAsync($"/api/shops/{shop.Id}/items/{item.Id}"),
        ];
        foreach (var response in refused)
        {
            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
            Assert.Equal("shop_deactivated", await ErrorCode(response));
        }

        Assert.Equal(HttpStatusCode.NoContent, (await admin.PostAsync($"/api/admin/shops/{shop.Id}/activate", null)).StatusCode);
        await Read<ItemDto>(await owner.PutAsJsonAsync($"/api/shops/{shop.Id}/items/{item.Id}", itemBody));
    }

    [Fact]
    public async Task Activity_log_records_who_did_what()
    {
        var (owner, ownerAuth, ownerEmail, _) = await app.SignedInOwnerAsync();
        var shop = await Read<ShopDto>(await owner.PostAsJsonAsync("/api/shops", Shop with { Name = "Logged Store" }));
        await app.CreateClient().PostAsJsonAsync("/api/auth/login", new LoginRequest(ownerEmail, "WrongPass1"));
        var admin = await app.AdminClientAsync();
        await admin.PostAsync($"/api/admin/shops/{shop.Id}/deactivate", null);
        await admin.PostAsync($"/api/admin/users/{ownerAuth.User.Id}/suspend", null);

        var byOwner = await admin.GetFromJsonAsync<Page<AuditEntryDto>>($"/api/admin/audit-logs?search={ownerEmail}&take=200");
        var actions = byOwner!.Items.Select(e => e.Action).ToList();
        Assert.Contains("user.registered", actions);
        Assert.Contains("user.signed_in", actions);
        Assert.Contains("user.sign_in_failed", actions);
        Assert.Contains("shop.created", actions);
        Assert.Contains("user.suspended", actions); // found through the description, performed by the admin

        var suspended = byOwner.Items.First(e => e.Action == "user.suspended");
        Assert.Equal(TestApp.AdminEmail, suspended.ActorEmail);
        Assert.Equal(ownerAuth.User.Id.ToString(), suspended.TargetId);

        var shopEvents = await admin.GetFromJsonAsync<Page<AuditEntryDto>>("/api/admin/audit-logs?action=shop.&search=Logged Store");
        Assert.Equal(["shop.deactivated", "shop.created"], shopEvents!.Items.Select(e => e.Action));
        Assert.True(shopEvents.Items[0].At >= shopEvents.Items[1].At);
    }

    [Fact]
    public async Task Dashboard_numbers_move_with_the_data()
    {
        var admin = await app.AdminClientAsync();
        var before = (await admin.GetFromJsonAsync<AdminStatsDto>("/api/admin/stats"))!;

        var (owner, _, _, _) = await app.SignedInOwnerAsync();
        var shop = await Read<ShopDto>(await owner.PostAsJsonAsync("/api/shops", Shop with { Name = "Counted" }));
        await Read<ItemDto>(await owner.PostAsJsonAsync($"/api/shops/{shop.Id}/items", new ItemRequest("Soap", null, null, 30, null, "1 piece", null)));
        await admin.PostAsync($"/api/admin/shops/{shop.Id}/deactivate", null);

        var after = (await admin.GetFromJsonAsync<AdminStatsDto>("/api/admin/stats"))!;
        Assert.True(after.TotalUsers > before.TotalUsers);
        Assert.True(after.ShopOwners > before.ShopOwners);
        Assert.True(after.DeactivatedShops > before.DeactivatedShops);
        Assert.True(after.Items > before.Items);
        Assert.True(after.SignInsLast24Hours > before.SignInsLast24Hours);
        Assert.True(after.NewUsersLast7Days > before.NewUsersLast7Days);
    }
}
