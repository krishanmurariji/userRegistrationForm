using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using SmallMart.Api.Orders;
using SmallMart.Api.Push;
using SmallMart.Api.Shops;

namespace SmallMart.Api.Tests;

/// <summary>Phone notifications for new orders, and their Accept and Decline buttons.</summary>
[Collection("api")]
public class PushTests(TestApp app)
{
    private static readonly byte[] Png = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=");

    private static async Task<T> Read<T>(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    private static async Task<string?> ErrorCode(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();

    private async Task<(HttpClient Owner, ShopDto Shop, ItemDto Item, string Device)> ShopWithPhoneAsync()
    {
        var (owner, _, _, _) = await app.SignedInOwnerAsync();
        var shop = await Read<ShopDto>(await owner.PostAsJsonAsync("/api/shops", new ShopRequest(
            $"Push Shop {Guid.NewGuid():N}"[..24], null, "9876543210", "1 Road", "Jaipur", "302001", "kirana@okaxis", 0, 0)));
        var item = await Read<ItemDto>(await owner.PostAsJsonAsync($"/api/shops/{shop.Id}/items",
            new ItemRequest("Rice", null, null, 60, null, "1 kg", null)));
        var device = $"device-{Guid.NewGuid():N}";
        Assert.Equal(HttpStatusCode.NoContent, (await owner.PostAsJsonAsync("/api/push/devices", new DeviceRequest(device, "android"))).StatusCode);
        return (owner, shop, item, device);
    }

    private static PlaceOrderRequest Cart(ShopDto shop, ItemDto item, string payment = "CashOnDelivery") => new(
        shop.Id, [new PlaceOrderLine(item.Id, 2)], payment, "Meena Sharma", "9123456780", "4 Lake View", "Jaipur", "302002", null, null);

    private Task<HttpResponseMessage> Act(string token, string action, string? reason = null) =>
        app.CreateClient().PostAsJsonAsync("/api/push/order-action", new OrderActionRequest(token, action, reason));

    [Fact]
    public async Task A_new_cash_order_rings_the_owners_phone_and_its_Accept_button_works_without_signing_in()
    {
        var (owner, shop, item, device) = await ShopWithPhoneAsync();
        var (customer, _, _, _) = await app.SignedInUserAsync();
        var order = await Read<OrderDto>(await customer.PostAsJsonAsync("/api/orders", Cart(shop, item)));

        var push = await app.Push.WaitForAsync(device, order.Id);
        Assert.NotNull(push);
        Assert.Equal("new_order", push!["type"]);
        Assert.Contains(order.Number, push["title"]);
        Assert.Equal("2× Rice", push["lines"]);

        Assert.Equal("expired", await ErrorCode(await Act("not-a-real-token", "accept")));
        var result = await Read<OrderActionResult>(await Act(push["actionToken"], "accept"));
        Assert.Equal("Accepted", result.Status);
        Assert.Equal("already_handled", await ErrorCode(await Act(push["actionToken"], "decline")));

        var seen = await Read<OrderDto>(await owner.GetAsync($"/api/shops/{shop.Id}/orders/{order.Id}"));
        Assert.Equal("Accepted", seen.Status);
    }

    [Fact]
    public async Task Decline_from_the_notification_cancels_the_order()
    {
        var (_, shop, item, device) = await ShopWithPhoneAsync();
        var (customer, _, _, _) = await app.SignedInUserAsync();
        var order = await Read<OrderDto>(await customer.PostAsJsonAsync("/api/orders", Cart(shop, item)));
        var push = await app.Push.WaitForAsync(device, order.Id);

        var result = await Read<OrderActionResult>(await Act(push!["actionToken"], "decline"));
        Assert.Equal("Cancelled", result.Status);
        var mine = await Read<OrderDto>(await customer.GetAsync($"/api/orders/{order.Id}"));
        Assert.Equal("The shop cannot take this order right now", mine.CancelReason);
    }

    [Fact]
    public async Task A_UPI_order_rings_only_once_the_payment_proof_arrives()
    {
        var (_, shop, item, device) = await ShopWithPhoneAsync();
        var (customer, _, _, _) = await app.SignedInUserAsync();
        var order = await Read<OrderDto>(await customer.PostAsJsonAsync("/api/orders", Cart(shop, item, "Upi")));
        Assert.Null(await app.Push.WaitForAsync(device, order.Id, ms: 600));

        var proof = new MultipartFormDataContent { { new StringContent(Random.Shared.NextInt64(100_000_000_000, 999_999_999_999).ToString()), "reference" } };
        var file = new ByteArrayContent(Png);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        proof.Add(file, "file", "payment.png");
        await Read<OrderDto>(await customer.PostAsync($"/api/orders/{order.Id}/upi-proof", proof));

        var push = await app.Push.WaitForAsync(device, order.Id);
        Assert.Equal("Paid · Accept", push!["acceptLabel"]);
        var result = await Read<OrderActionResult>(await Act(push["actionToken"], "accept"));
        Assert.Equal("Accepted", result.Status);
    }

    [Fact]
    public async Task Signing_out_on_the_phone_stops_its_notifications()
    {
        var (owner, shop, item, device) = await ShopWithPhoneAsync();
        Assert.Equal(HttpStatusCode.NoContent, (await owner.PostAsJsonAsync("/api/push/devices/remove", new DeviceRequest(device, null))).StatusCode);
        var (customer, _, _, _) = await app.SignedInUserAsync();
        var order = await Read<OrderDto>(await customer.PostAsJsonAsync("/api/orders", Cart(shop, item)));
        Assert.Null(await app.Push.WaitForAsync(device, order.Id, ms: 800));
    }
}
