using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmallMart.Api.Auth;
using SmallMart.Api.Data;
using SmallMart.Api.Orders;
using SmallMart.Api.Shops;

namespace SmallMart.Api.Tests;

/// <summary>People can delete their own account (an app store requirement).</summary>
[Collection("api")]
public class AccountDeletionTests(TestApp app)
{
    private static async Task<T> Read<T>(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    private static async Task<string?> ErrorCode(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();

    private static Task<HttpResponseMessage> Delete(HttpClient client, string? password, string? confirm = "DELETE") =>
        client.PostAsJsonAsync("/api/auth/delete-account", new DeleteAccountRequest(password, confirm));

    private async Task<(HttpClient Owner, ShopDto Shop, ItemDto Item)> ShopAsync()
    {
        var (owner, _, _, _) = await app.SignedInOwnerAsync();
        var shop = await Read<ShopDto>(await owner.PostAsJsonAsync("/api/shops", new ShopRequest(
            $"Delete Shop {Guid.NewGuid():N}"[..24], null, "9876543210", "1 Road", "Jaipur", "302001", null, 0, 0)));
        var item = await Read<ItemDto>(await owner.PostAsJsonAsync($"/api/shops/{shop.Id}/items",
            new ItemRequest("Rice", null, null, 60, null, "1 kg", null)));
        return (owner, shop, item);
    }

    private static PlaceOrderRequest Cart(ShopDto shop, ItemDto item) => new(
        shop.Id, [new PlaceOrderLine(item.Id, 2)], "CashOnDelivery", "Meena Sharma", "9123456780", "4 Lake View", "Jaipur", "302002", "Ring twice", null);

    [Fact]
    public async Task Needs_the_password_and_the_word_DELETE()
    {
        var (client, _, email, password) = await app.SignedInUserAsync();

        Assert.Equal("confirm_required", await ErrorCode(await Delete(client, password, "delete")));
        Assert.Equal("wrong_password", await ErrorCode(await Delete(client, "Wrong12345")));
        Assert.Equal(HttpStatusCode.Unauthorized, (await Delete(app.CreateClient(), password)).StatusCode);

        // Nothing changed: the account still signs in.
        await TestApp.LoginAsync(app.CreateClient(), email, password);
    }

    [Fact]
    public async Task Deleting_erases_the_person_but_keeps_the_shops_order_records()
    {
        var (owner, shop, item) = await ShopAsync();
        var (customer, auth, email, password) = await app.SignedInUserAsync();
        var order = await Read<OrderDto>(await customer.PostAsJsonAsync("/api/orders", Cart(shop, item)));

        // An order on its way blocks deletion until it is finished.
        Assert.Equal("open_orders", await ErrorCode(await Delete(customer, password)));
        foreach (var status in new[] { "Accepted", "Packed", "OutForDelivery", "Delivered" })
            await Read<OrderDto>(await owner.PostAsJsonAsync($"/api/shops/{shop.Id}/orders/{order.Id}/status", new StatusRequest(status)));

        Assert.Equal(HttpStatusCode.NoContent, (await Delete(customer, password)).StatusCode);

        // Cannot sign in, and the old refresh token is dead.
        var login = await app.CreateClient().PostAsJsonAsync("/api/auth/login", new LoginRequest(email, password));
        Assert.Equal(HttpStatusCode.Unauthorized, login.StatusCode);
        var refresh = await app.CreateClient().PostAsJsonAsync("/api/auth/refresh", new RefreshRequest(auth.RefreshToken));
        Assert.False(refresh.IsSuccessStatusCode);

        // The shop still has the order, without the customer's details.
        var kept = await Read<OrderDto>(await owner.GetAsync($"/api/shops/{shop.Id}/orders/{order.Id}"));
        Assert.Equal(AccountDeletionController.DeletedName, kept.CustomerName);
        Assert.Equal("", kept.Phone);
        Assert.Equal("", kept.AddressLine);
        Assert.Null(kept.Note);
        Assert.Equal(order.Total, kept.Total);

        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.False(await db.Users.AnyAsync(u => u.Email == email));

        // The same email can sign up again as a brand new account.
        var again = await app.CreateClient().PostAsJsonAsync("/api/auth/register", new RegisterRequest(email, password, "Back Again"));
        Assert.True(again.IsSuccessStatusCode, await again.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_shop_owner_who_deletes_their_account_takes_their_shop_offline()
    {
        var (owner, shop, item) = await ShopAsync();
        var (customer, _, _, _) = await app.SignedInUserAsync();
        var order = await Read<OrderDto>(await customer.PostAsJsonAsync("/api/orders", Cart(shop, item)));
        var ownerPassword = "Passw0rd123";

        Assert.Equal("open_shop_orders", await ErrorCode(await Delete(owner, ownerPassword)));
        await Read<OrderDto>(await customer.PostAsync($"/api/orders/{order.Id}/cancel", null));

        Assert.Equal(HttpStatusCode.NoContent, (await Delete(owner, ownerPassword)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await customer.GetAsync($"/api/store/shops/{shop.Id}")).StatusCode);
    }

    [Fact]
    public async Task The_platform_admin_cannot_delete_itself()
    {
        var admin = await app.AdminClientAsync();
        Assert.Equal("admin_account", await ErrorCode(await Delete(admin, TestApp.AdminPassword)));
    }
}
