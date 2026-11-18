using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using SmallMart.Api.Orders;
using SmallMart.Api.Shops;

namespace SmallMart.Api.Tests;

/// <summary>The full-screen "new order" alert: what it lists and its accept and decline buttons.</summary>
[Collection("api")]
public class IncomingOrderTests(TestApp app)
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

    private record Fixture(HttpClient Owner, ShopDto Shop, ItemDto Rice, ItemDto Salt);

    private async Task<Fixture> ShopAsync()
    {
        var (owner, _, _, _) = await app.SignedInOwnerAsync();
        var shop = await Read<ShopDto>(await owner.PostAsJsonAsync("/api/shops", new ShopRequest(
            $"Alert Shop {Guid.NewGuid():N}"[..24], null, "9876543210", "1 Road", "Jaipur", "302001", "kirana@okaxis", 0, 0)));
        var url = $"/api/shops/{shop.Id}/items";
        var rice = await Read<ItemDto>(await owner.PostAsJsonAsync(url, new ItemRequest("Rice", null, null, 60, null, "1 kg", null,
            TrackStock: true, LowStockThreshold: 5, OpeningStock: 8)));
        var salt = await Read<ItemDto>(await owner.PostAsJsonAsync(url, new ItemRequest("Salt", null, null, 20, null, "1 kg", null)));
        return new Fixture(owner, shop, rice, salt);
    }

    private static PlaceOrderRequest Cart(Fixture f, string payment = "CashOnDelivery") => new(
        f.Shop.Id, [new PlaceOrderLine(f.Rice.Id, 3), new PlaceOrderLine(f.Salt.Id, 1)], payment,
        "Meena Sharma", "9123456780", "4 Lake View", "Jaipur", "302002", "Ring twice", null);

    private static Task<List<IncomingOrderDto>> Incoming(HttpClient owner) =>
        owner.GetFromJsonAsync<List<IncomingOrderDto>>("/api/owner/incoming-orders")!;

    [Fact]
    public async Task Lists_new_orders_with_the_stock_left_and_accepts_them()
    {
        var f = await ShopAsync();
        var (customer, _, _, _) = await app.SignedInUserAsync();
        var order = await Read<OrderDto>(await customer.PostAsJsonAsync("/api/orders", Cart(f)));

        var incoming = Assert.Single(await Incoming(f.Owner));
        Assert.Equal(order.Id, incoming.Id);
        Assert.True(incoming.CanAccept);
        Assert.Equal("Ring twice", incoming.Note);
        var rice = incoming.Items.Single(i => i.Name == "Rice");
        Assert.Equal(3, rice.Quantity);
        Assert.Equal(5, rice.StockLeft);              // 8 on the shelf, 3 set aside for this order
        Assert.Null(incoming.Items.Single(i => i.Name == "Salt").StockLeft);

        // Other people never see it.
        var (stranger, _, _, _) = await app.SignedInOwnerAsync();
        Assert.Empty(await Incoming(stranger));
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PostAsync($"/api/owner/incoming-orders/{order.Id}/accept", null)).StatusCode);

        var accepted = await Read<OrderDto>(await f.Owner.PostAsync($"/api/owner/incoming-orders/{order.Id}/accept", null));
        Assert.Equal("Accepted", accepted.Status);
        Assert.Empty(await Incoming(f.Owner));
        Assert.Equal("already_handled", await ErrorCode(await f.Owner.PostAsync($"/api/owner/incoming-orders/{order.Id}/accept", null)));
    }

    [Fact]
    public async Task Declining_cancels_with_the_reason_and_puts_the_stock_back()
    {
        var f = await ShopAsync();
        var (customer, _, _, _) = await app.SignedInUserAsync();
        var order = await Read<OrderDto>(await customer.PostAsJsonAsync("/api/orders", Cart(f)));

        var declined = await Read<OrderDto>(await f.Owner.PostAsJsonAsync($"/api/owner/incoming-orders/{order.Id}/decline",
            new DeclineRequest("Out of rice today")));
        Assert.Equal("Cancelled", declined.Status);
        Assert.Equal("Out of rice today", declined.CancelReason);
        var rice = await f.Owner.GetFromJsonAsync<ItemDto>($"/api/shops/{f.Shop.Id}/items/{f.Rice.Id}");
        Assert.Equal(8, rice!.StockQuantity);
    }

    [Fact]
    public async Task A_UPI_order_appears_once_paid_and_accepting_it_confirms_the_payment()
    {
        var f = await ShopAsync();
        var (customer, _, _, _) = await app.SignedInUserAsync();
        var order = await Read<OrderDto>(await customer.PostAsJsonAsync("/api/orders", Cart(f, "Upi")));
        Assert.Empty(await Incoming(f.Owner));
        Assert.Equal("payment_not_received", await ErrorCode(await f.Owner.PostAsync($"/api/owner/incoming-orders/{order.Id}/accept", null)));

        var proof = new MultipartFormDataContent { { new StringContent(Random.Shared.NextInt64(100_000_000_000, 999_999_999_999).ToString()), "reference" } };
        var file = new ByteArrayContent(Png);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        proof.Add(file, "file", "payment.png");
        await Read<OrderDto>(await customer.PostAsync($"/api/orders/{order.Id}/upi-proof", proof));

        var incoming = Assert.Single(await Incoming(f.Owner));
        Assert.Equal("AwaitingVerification", incoming.PaymentStatus);
        Assert.True(incoming.HasUpiProof);

        var accepted = await Read<OrderDto>(await f.Owner.PostAsync($"/api/owner/incoming-orders/{order.Id}/accept", null));
        Assert.Equal("Accepted", accepted.Status);
        Assert.Equal("Paid", accepted.PaymentStatus);
    }
}
