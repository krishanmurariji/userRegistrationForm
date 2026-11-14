using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SmallMart.Api.Admin;
using SmallMart.Api.Auth;
using SmallMart.Api.Data;
using SmallMart.Api.Domain;
using SmallMart.Api.Orders;
using SmallMart.Api.Shops;

namespace SmallMart.Api.Tests;

/// <summary>An account is exactly one of customer, shop owner or platform admin.</summary>
[Collection("api")]
public class AccountTypeTests(TestApp app)
{
    private static async Task<T> Read<T>(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    private static async Task<string?> ErrorCode(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();

    private static readonly ShopRequest NewShop = new("Account Shop", null, "9876543210", "1 Road", "Pune", "411001", null, 0, 0);

    [Fact]
    public async Task Each_kind_of_account_has_exactly_one_role()
    {
        var (_, customer, _, _) = await app.SignedInUserAsync();
        var (_, owner, _, _) = await app.SignedInOwnerAsync();
        var admin = await TestApp.LoginAsync(app.CreateClient(), TestApp.AdminEmail, TestApp.AdminPassword);

        Assert.Equal([Roles.Customer], customer.User.Roles);
        Assert.Equal([Roles.ShopOwner], owner.User.Roles);
        Assert.Equal([Roles.PlatformAdmin], admin.User.Roles);

        var created = await Read<AdminUserDto>(await (await app.AdminClientAsync()).PostAsJsonAsync("/api/admin/users/shop-owners",
            new CreateShopOwnerRequest(TestApp.NewEmail(), "New Owner", "Owner12345")));
        Assert.Equal([Roles.ShopOwner], created.Roles);

        var google = await Read<AuthResponse>(await app.CreateClient().PostAsJsonAsync("/api/auth/external/google",
            new ExternalLoginRequest($"{Guid.NewGuid():N}|{TestApp.NewEmail()}|true|Social")));
        Assert.Equal([Roles.Customer], google.User.Roles);
    }

    [Theory]
    [InlineData("owner")]
    [InlineData("admin")]
    public async Task Shop_owners_and_the_admin_cannot_use_the_customer_screens_api(string who)
    {
        var client = who == "owner" ? (await app.SignedInOwnerAsync()).Client : await app.AdminClientAsync();

        foreach (var url in new[] { "/api/store/shops", "/api/store/categories", "/api/store/search?search=a", "/api/orders/mine", "/api/orders/last-address" })
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(url)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/orders", new { })).StatusCode);

        // Notifications belong to every kind of account.
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/notifications")).StatusCode);
    }

    [Fact]
    public async Task Customers_cannot_use_the_shop_owner_or_admin_apis()
    {
        var (customer, _, _, _) = await app.SignedInUserAsync();
        Assert.Equal(HttpStatusCode.Forbidden, (await customer.PostAsJsonAsync("/api/shops", NewShop)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await customer.GetAsync("/api/admin/users")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await customer.GetAsync("/api/store/shops")).StatusCode);
    }

    [Fact]
    public async Task Changing_a_customer_into_a_shop_owner_replaces_the_role_and_signs_them_out()
    {
        var (client, auth, email, password) = await app.SignedInUserAsync();
        var admin = await app.AdminClientAsync();

        var changed = await Read<AdminUserDto>(await admin.PostAsync($"/api/admin/users/{auth.User.Id}/shop-owner", null));
        Assert.Equal([Roles.ShopOwner], changed.Roles);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/auth/refresh", new RefreshRequest(auth.RefreshToken))).StatusCode);

        var next = await TestApp.LoginAsync(client, email, password);
        Assert.Equal([Roles.ShopOwner], next.User.Roles);
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/shops", NewShop)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/store/shops")).StatusCode);
        Assert.Contains("no longer a customer", (await client.GetFromJsonAsync<JsonElement>("/api/notifications")).GetProperty("items")[0].GetProperty("body").GetString());
    }

    [Fact]
    public async Task A_customer_with_an_order_in_progress_cannot_be_changed_yet()
    {
        var (owner, _, _, _) = await app.SignedInOwnerAsync();
        var shop = await Read<ShopDto>(await owner.PostAsJsonAsync("/api/shops", NewShop));
        var item = await Read<ItemDto>(await owner.PostAsJsonAsync($"/api/shops/{shop.Id}/items",
            new ItemRequest("Tea", null, null, 20, null, "1 pack", null)));
        var (customer, auth, _, _) = await app.SignedInUserAsync();
        var order = await Read<OrderDto>(await customer.PostAsJsonAsync("/api/orders", new PlaceOrderRequest(
            shop.Id, [new PlaceOrderLine(item.Id, 1)], "CashOnDelivery", "Meena", "9123456780", "4 Lake View", "Pune", "411002", null, null)));
        var admin = await app.AdminClientAsync();

        var refused = await admin.PostAsync($"/api/admin/users/{auth.User.Id}/shop-owner", null);
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal("has_open_orders", await ErrorCode(refused));

        await customer.PostAsync($"/api/orders/{order.Id}/cancel", null);
        Assert.Equal([Roles.ShopOwner], (await Read<AdminUserDto>(await admin.PostAsync($"/api/admin/users/{auth.User.Id}/shop-owner", null))).Roles);
    }

    [Fact]
    public async Task Changing_a_shop_owner_back_to_a_customer_replaces_the_role_and_needs_no_shops()
    {
        var (owner, auth, email, password) = await app.SignedInOwnerAsync();
        var (idle, idleAuth, _, _) = await app.SignedInOwnerAsync();
        var admin = await app.AdminClientAsync();
        await owner.PostAsJsonAsync("/api/shops", NewShop);

        Assert.Equal("owns_shops", await ErrorCode(await admin.DeleteAsync($"/api/admin/users/{auth.User.Id}/shop-owner")));

        var back = await Read<AdminUserDto>(await admin.DeleteAsync($"/api/admin/users/{idleAuth.User.Id}/shop-owner"));
        Assert.Equal([Roles.Customer], back.Roles);
        Assert.Equal(HttpStatusCode.Unauthorized, (await idle.PostAsJsonAsync("/api/auth/refresh", new RefreshRequest(idleAuth.RefreshToken))).StatusCode);
        Assert.NotEmpty(email + password);
    }

    [Fact]
    public async Task The_admin_can_never_be_turned_into_anything_else()
    {
        var admin = await app.AdminClientAsync();
        var me = (await admin.GetFromJsonAsync<Page<AdminUserDto>>($"/api/admin/users?search={TestApp.AdminEmail}"))!.Items.Single();
        Assert.Equal("is_admin", await ErrorCode(await admin.PostAsync($"/api/admin/users/{me.Id}/shop-owner", null)));
        Assert.Equal([Roles.PlatformAdmin], me.Roles);
    }

    [Fact]
    public async Task Starting_the_app_removes_the_customer_role_from_accounts_that_also_have_another_one()
    {
        var (_, auth, _, _) = await app.SignedInOwnerAsync();
        var (_, plain, _, _) = await app.SignedInUserAsync();
        using (var scope = app.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            // How earlier versions left shop owners and the admin.
            await users.AddToRoleAsync((await users.FindByIdAsync(auth.User.Id.ToString()))!, Roles.Customer);
            await users.AddToRoleAsync((await users.FindByEmailAsync(TestApp.AdminEmail))!, Roles.Customer);
            await DbSeeder.InitialiseAsync(scope.ServiceProvider, scope.ServiceProvider.GetRequiredService<IConfiguration>());
        }

        var admin = await app.AdminClientAsync();
        var rows = (await admin.GetFromJsonAsync<Page<AdminUserDto>>("/api/admin/users?take=200"))!.Items;
        Assert.Equal([Roles.ShopOwner], rows.Single(u => u.Id == auth.User.Id).Roles);
        Assert.Equal([Roles.PlatformAdmin], rows.Single(u => u.Email == TestApp.AdminEmail).Roles);
        Assert.Equal([Roles.Customer], rows.Single(u => u.Id == plain.User.Id).Roles);   // ordinary customers are untouched
    }
}
