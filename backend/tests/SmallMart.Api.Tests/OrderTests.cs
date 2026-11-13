using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using SmallMart.Api.Admin;
using SmallMart.Api.Orders;
using SmallMart.Api.Shops;

namespace SmallMart.Api.Tests;

[Collection("api")]
public class OrderTests(TestApp app)
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

    private static string NewReference() => Random.Shared.NextInt64(100_000_000_000, 999_999_999_999).ToString();

    private static MultipartFormDataContent Proof(string reference, byte[]? image = null)
    {
        var content = new MultipartFormDataContent { { new StringContent(reference), "reference" } };
        if (image is not null)
        {
            var file = new ByteArrayContent(image);
            file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
            content.Add(file, "file", "payment.png");
        }
        return content;
    }

    private record Fixture(HttpClient Owner, ShopDto Shop, ItemDto Dal, ItemDto Butter, ItemDto Hidden);

    /// <summary>A shop (delivery ₹20, minimum ₹100, accepts UPI) with two visible items and one hidden item.</summary>
    private async Task<Fixture> ShopWithItemsAsync(string? upiId = "kirana@okaxis")
    {
        var (owner, _, _, _) = await app.SignedInOwnerAsync();
        var shop = await Read<ShopDto>(await owner.PostAsJsonAsync("/api/shops", new ShopRequest(
            $"Order Shop {Guid.NewGuid():N}"[..24], "Fresh daily", "9876543210", "12 Market Road", "Jaipur", "302001", upiId, 20, 100)));
        var grains = await Read<CategoryDto>(await owner.PostAsJsonAsync($"/api/shops/{shop.Id}/categories", new CategoryRequest("Grains")));
        var url = $"/api/shops/{shop.Id}/items";
        var dal = await Read<ItemDto>(await owner.PostAsJsonAsync(url, new ItemRequest("Toor Dal", null, grains.Id, 140, 160, "1 kg", null)));
        var butter = await Read<ItemDto>(await owner.PostAsJsonAsync(url, new ItemRequest("Butter", null, null, 56, null, "100 g", null)));
        var hidden = await Read<ItemDto>(await owner.PostAsJsonAsync(url, new ItemRequest("Old Stock", null, grains.Id, 10, null, "1 piece", null, IsActive: false)));
        return new Fixture(owner, shop, dal, butter, hidden);
    }

    private static PlaceOrderRequest Cart(Fixture f, string payment = "CashOnDelivery", decimal? expectedTotal = null, params (ItemDto Item, int Qty)[] lines) => new(
        f.Shop.Id,
        (lines.Length == 0 ? [(f.Dal, 1), (f.Butter, 2)] : lines).Select(l => new PlaceOrderLine(l.Item.Id, l.Qty)).ToList(),
        payment, "Meena Sharma", "9123456780", "4 Lake View", "Jaipur", "302002", "Ring the bell", expectedTotal);

    private async Task<(HttpClient Customer, OrderDto Order)> PlacedOrderAsync(Fixture f, string payment = "CashOnDelivery")
    {
        var (customer, _, _, _) = await app.SignedInUserAsync();
        var order = await Read<OrderDto>(await customer.PostAsJsonAsync("/api/orders", Cart(f, payment)));
        return (customer, order);
    }

    private static Task<HttpResponseMessage> Step(Fixture f, OrderDto order, string status) =>
        f.Owner.PostAsJsonAsync($"/api/shops/{f.Shop.Id}/orders/{order.Id}/status", new StatusRequest(status));

    // ---------- Browsing

    [Fact]
    public async Task Customers_browse_active_shops_and_only_visible_items()
    {
        var f = await ShopWithItemsAsync();
        var (customer, _, _, _) = await app.SignedInUserAsync();

        var shops = await customer.GetFromJsonAsync<List<StoreShopDto>>($"/api/store/shops?search={f.Shop.Name}");
        var listed = Assert.Single(shops!);
        Assert.True(listed.AcceptsUpi);
        Assert.Equal(20, listed.DeliveryFee);

        var detail = await customer.GetFromJsonAsync<StoreShopDetailDto>($"/api/store/shops/{f.Shop.Id}");
        Assert.Equal(["Grains"], detail!.Categories.Select(c => c.Name));

        var items = await customer.GetFromJsonAsync<List<StoreItemDto>>($"/api/store/shops/{f.Shop.Id}/items");
        Assert.Equal(["Butter", "Toor Dal"], items!.Select(i => i.Name));
        Assert.Equal(["Toor Dal"], (await customer.GetFromJsonAsync<List<StoreItemDto>>($"/api/store/shops/{f.Shop.Id}/items?search=dal"))!.Select(i => i.Name));
        Assert.Equal(HttpStatusCode.Unauthorized, (await app.CreateClient().GetAsync("/api/store/shops")).StatusCode);
    }

    [Fact]
    public async Task A_deactivated_shop_disappears_from_the_store_and_takes_no_orders()
    {
        var f = await ShopWithItemsAsync();
        var (customer, _, _, _) = await app.SignedInUserAsync();
        var admin = await app.AdminClientAsync();
        await admin.PostAsync($"/api/admin/shops/{f.Shop.Id}/deactivate", null);

        Assert.Empty((await customer.GetFromJsonAsync<List<StoreShopDto>>($"/api/store/shops?search={f.Shop.Name}"))!);
        Assert.Equal(HttpStatusCode.NotFound, (await customer.GetAsync($"/api/store/shops/{f.Shop.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await customer.GetAsync($"/api/store/shops/{f.Shop.Id}/items")).StatusCode);
        Assert.Equal("shop_unavailable", await ErrorCode(await customer.PostAsJsonAsync("/api/orders", Cart(f))));
    }

    // ---------- Placing

    [Fact]
    public async Task Placing_an_order_prices_it_from_the_shop_not_from_the_request()
    {
        var f = await ShopWithItemsAsync();
        var (customer, order) = await PlacedOrderAsync(f);

        Assert.StartsWith("SM-", order.Number);
        Assert.Equal("Placed", order.Status);
        Assert.Equal("CashOnDelivery", order.PaymentMethod);
        Assert.Equal("Pending", order.PaymentStatus);
        Assert.Equal(252, order.Subtotal);       // 140 + 2 x 56
        Assert.Equal(20, order.DeliveryFee);
        Assert.Equal(272, order.Total);
        Assert.Null(order.Upi);
        Assert.Equal(["Butter", "Toor Dal"], order.Items.Select(i => i.Name));
        Assert.Equal(112, order.Items[0].LineTotal);
        Assert.Equal(["Order placed"], order.Events.Select(e => e.Title));

        var mine = await customer.GetFromJsonAsync<List<OrderSummaryDto>>("/api/orders/mine");
        Assert.Equal(3, Assert.Single(mine!).ItemCount);
        var address = await customer.GetFromJsonAsync<DeliveryAddressDto>("/api/orders/last-address");
        Assert.Equal("4 Lake View", address!.AddressLine);
    }

    [Fact]
    public async Task An_order_keeps_its_prices_when_the_item_changes_later()
    {
        var f = await ShopWithItemsAsync();
        var (customer, order) = await PlacedOrderAsync(f);

        await f.Owner.PutAsJsonAsync($"/api/shops/{f.Shop.Id}/items/{f.Dal.Id}", new ItemRequest("Toor Dal Gold", null, null, 999, null, "1 kg", null));
        await f.Owner.DeleteAsync($"/api/shops/{f.Shop.Id}/items/{f.Butter.Id}");

        var later = await customer.GetFromJsonAsync<OrderDto>($"/api/orders/{order.Id}");
        Assert.Equal(272, later!.Total);
        Assert.Equal(["Butter", "Toor Dal"], later.Items.Select(i => i.Name));
    }

    [Fact]
    public async Task Orders_that_break_the_rules_are_refused()
    {
        var f = await ShopWithItemsAsync(upiId: null);
        var other = await ShopWithItemsAsync();
        var (customer, _, _, _) = await app.SignedInUserAsync();
        Task<HttpResponseMessage> Post(PlaceOrderRequest r) => customer.PostAsJsonAsync("/api/orders", r);

        Assert.Equal("below_minimum", await ErrorCode(await Post(Cart(f, lines: (f.Butter, 1)))));
        Assert.Equal("items_unavailable", await ErrorCode(await Post(Cart(f, lines: [(f.Dal, 1), (f.Hidden, 1)]))));
        Assert.Equal("items_unavailable", await ErrorCode(await Post(Cart(f, lines: [(f.Dal, 1), (other.Dal, 1)]))));  // item of another shop
        Assert.Equal("cart_changed", await ErrorCode(await Post(Cart(f, expectedTotal: 1))));
        Assert.Equal("upi_unavailable", await ErrorCode(await Post(Cart(f, "Upi"))));
        Assert.Equal("invalid_payment_method", await ErrorCode(await Post(Cart(f, "Bitcoin"))));
        Assert.Equal("invalid_payment_method", await ErrorCode(await Post(Cart(f, "7"))));
        Assert.Equal("invalid_quantity", await ErrorCode(await Post(Cart(f, lines: [(f.Dal, 60), (f.Dal, 60)]))));
        Assert.Equal(HttpStatusCode.BadRequest, (await Post(Cart(f, lines: (f.Dal, 0)))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Post(Cart(f) with { Pincode = "12" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Post(Cart(f) with { Items = [] })).StatusCode);

        var closed = new ShopRequest(f.Shop.Name, null, "9876543210", "12 Market Road", "Jaipur", "302001", null, 20, 100, IsOpen: false);
        await f.Owner.PutAsJsonAsync($"/api/shops/{f.Shop.Id}", closed);
        Assert.Equal("shop_closed", await ErrorCode(await Post(Cart(f))));

        Assert.Empty((await customer.GetFromJsonAsync<List<OrderSummaryDto>>("/api/orders/mine"))!);
        Assert.Equal(HttpStatusCode.NoContent, (await customer.GetAsync("/api/orders/last-address")).StatusCode);
    }

    [Fact]
    public async Task The_matching_expected_total_is_accepted()
    {
        var f = await ShopWithItemsAsync();
        var (customer, _, _, _) = await app.SignedInUserAsync();
        var order = await Read<OrderDto>(await customer.PostAsJsonAsync("/api/orders", Cart(f, expectedTotal: 272)));
        Assert.Equal(272, order.Total);
    }

    // ---------- Who can see what

    [Fact]
    public async Task Orders_are_private_to_their_customer_and_shop()
    {
        var f = await ShopWithItemsAsync();
        var otherShop = await ShopWithItemsAsync();
        var (_, order) = await PlacedOrderAsync(f);
        var (stranger, _, _, _) = await app.SignedInUserAsync();

        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/orders/{order.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PostAsync($"/api/orders/{order.Id}/cancel", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/shops/{f.Shop.Id}/orders")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/shops/{f.Shop.Id}/orders/{order.Id}")).StatusCode);

        // Another shop's owner cannot reach it, not even through their own shop's address.
        Assert.Equal(HttpStatusCode.NotFound, (await otherShop.Owner.GetAsync($"/api/shops/{f.Shop.Id}/orders/{order.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await otherShop.Owner.GetAsync($"/api/shops/{otherShop.Shop.Id}/orders/{order.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Step(otherShop with { Shop = otherShop.Shop }, order, "Accepted")).StatusCode);

        var seenByShop = await f.Owner.GetFromJsonAsync<OrderDto>($"/api/shops/{f.Shop.Id}/orders/{order.Id}");
        Assert.Equal("Meena Sharma", seenByShop!.CustomerName);
    }

    // ---------- Cash on delivery, start to finish

    [Fact]
    public async Task A_cash_order_moves_step_by_step_and_is_paid_on_delivery()
    {
        var f = await ShopWithItemsAsync();
        var (customer, order) = await PlacedOrderAsync(f);
        var orders = $"/api/shops/{f.Shop.Id}/orders";

        Assert.Equal(order.Id, Assert.Single((await f.Owner.GetFromJsonAsync<List<OrderSummaryDto>>($"{orders}?view=new"))!).Id);
        Assert.Equal(1, (await f.Owner.GetFromJsonAsync<JsonElement>($"{orders}/counts")).GetProperty("new").GetInt32());

        Assert.Equal("invalid_step", await ErrorCode(await Step(f, order, "Delivered")));   // no skipping
        Assert.Equal("invalid_step", await ErrorCode(await Step(f, order, "Nonsense")));

        foreach (var status in new[] { "Accepted", "Packed", "OutForDelivery" })
        {
            var moved = await Read<OrderDto>(await Step(f, order, status));
            Assert.Equal(status, moved.Status);
            Assert.Equal("Pending", moved.PaymentStatus);
        }
        Assert.Equal("cannot_cancel", await ErrorCode(await customer.PostAsync($"/api/orders/{order.Id}/cancel", null)));
        Assert.Single((await f.Owner.GetFromJsonAsync<List<OrderSummaryDto>>($"{orders}?view=active"))!);

        var delivered = await Read<OrderDto>(await Step(f, order, "Delivered"));
        Assert.Equal("Paid", delivered.PaymentStatus);
        Assert.Equal(["Order placed", "Order accepted", "Order packed", "Out for delivery", "Delivered"], delivered.Events.Select(e => e.Title));
        Assert.Contains("272", delivered.Events[^1].Note);

        Assert.Equal("invalid_step", await ErrorCode(await Step(f, order, "Delivered")));
        Assert.Equal("order_closed", await ErrorCode(await f.Owner.PostAsJsonAsync($"{orders}/{order.Id}/cancel", new ReasonRequest("Too late"))));
        Assert.Single((await f.Owner.GetFromJsonAsync<List<OrderSummaryDto>>($"{orders}?view=done"))!);
        Assert.Equal("Delivered", (await customer.GetFromJsonAsync<OrderDto>($"/api/orders/{order.Id}"))!.Status);
    }

    [Fact]
    public async Task Customer_can_cancel_before_acceptance_and_the_shop_can_cancel_with_a_reason()
    {
        var f = await ShopWithItemsAsync();
        var (customer, first) = await PlacedOrderAsync(f);

        var cancelled = await Read<OrderDto>(await customer.PostAsync($"/api/orders/{first.Id}/cancel", null));
        Assert.Equal("Cancelled", cancelled.Status);
        Assert.Equal("invalid_step", await ErrorCode(await Step(f, first, "Accepted")));
        Assert.Equal("cannot_cancel", await ErrorCode(await customer.PostAsync($"/api/orders/{first.Id}/cancel", null)));

        var second = await Read<OrderDto>(await customer.PostAsJsonAsync("/api/orders", Cart(f)));
        await Read<OrderDto>(await Step(f, second, "Accepted"));
        Assert.Equal(HttpStatusCode.BadRequest, (await f.Owner.PostAsJsonAsync($"/api/shops/{f.Shop.Id}/orders/{second.Id}/cancel", new ReasonRequest(""))).StatusCode);
        var byShop = await Read<OrderDto>(await f.Owner.PostAsJsonAsync($"/api/shops/{f.Shop.Id}/orders/{second.Id}/cancel", new ReasonRequest("Out of stock")));
        Assert.Equal("Cancelled", byShop.Status);
        Assert.Equal("Out of stock", (await customer.GetFromJsonAsync<OrderDto>($"/api/orders/{second.Id}"))!.CancelReason);
    }

    // ---------- UPI

    [Fact]
    public async Task A_UPI_order_is_paid_only_after_the_shop_confirms_the_customers_proof()
    {
        var f = await ShopWithItemsAsync();
        var (customer, order) = await PlacedOrderAsync(f, "Upi");
        var shopOrder = $"/api/shops/{f.Shop.Id}/orders/{order.Id}";

        Assert.Equal("kirana@okaxis", order.Upi!.UpiId);
        Assert.Equal(272, order.Upi.Amount);
        Assert.StartsWith("upi://pay?pa=kirana%40okaxis&", order.Upi.PayUri);
        Assert.Contains("am=272.00", order.Upi.PayUri);
        Assert.Contains(order.Number, Uri.UnescapeDataString(order.Upi.PayUri));

        // Nothing to accept or verify until the customer says they paid.
        Assert.Equal("payment_not_verified", await ErrorCode(await Step(f, order, "Accepted")));
        Assert.Equal("nothing_to_verify", await ErrorCode(await f.Owner.PostAsync($"{shopOrder}/payment/verify", null)));

        var reference = NewReference();
        Assert.Equal("invalid_reference", await ErrorCode(await customer.PostAsync($"/api/orders/{order.Id}/upi-proof", Proof("12", Png))));
        Assert.Equal("invalid_image", await ErrorCode(await customer.PostAsync($"/api/orders/{order.Id}/upi-proof", Proof(reference))));
        Assert.Equal("invalid_image", await ErrorCode(await customer.PostAsync($"/api/orders/{order.Id}/upi-proof", Proof(reference, "not a picture"u8.ToArray()))));

        var submitted = await Read<OrderDto>(await customer.PostAsync($"/api/orders/{order.Id}/upi-proof", Proof(reference, Png)));
        Assert.Equal("AwaitingVerification", submitted.PaymentStatus);
        Assert.Equal(reference, submitted.UpiReference);
        Assert.True(submitted.HasUpiProof);
        Assert.Equal("proof_not_needed", await ErrorCode(await customer.PostAsync($"/api/orders/{order.Id}/upi-proof", Proof(NewReference(), Png))));

        Assert.Equal(order.Id, Assert.Single((await f.Owner.GetFromJsonAsync<List<OrderSummaryDto>>($"/api/shops/{f.Shop.Id}/orders?view=payments"))!).Id);
        Assert.Equal("payment_not_verified", await ErrorCode(await Step(f, order, "Accepted")));

        var paid = await Read<OrderDto>(await f.Owner.PostAsync($"{shopOrder}/payment/verify", null));
        Assert.Equal("Paid", paid.PaymentStatus);
        Assert.NotNull(paid.PaymentVerifiedAt);
        Assert.Equal("nothing_to_verify", await ErrorCode(await f.Owner.PostAsync($"{shopOrder}/payment/verify", null)));
        Assert.Empty((await f.Owner.GetFromJsonAsync<List<OrderSummaryDto>>($"/api/shops/{f.Shop.Id}/orders?view=payments"))!);

        Assert.Equal("Accepted", (await Read<OrderDto>(await Step(f, order, "Accepted"))).Status);
        Assert.Equal("Paid", (await customer.GetFromJsonAsync<OrderDto>($"/api/orders/{order.Id}"))!.PaymentStatus);

        var admin = await app.AdminClientAsync();
        var log = await admin.GetFromJsonAsync<Page<AuditEntryDto>>($"/api/admin/audit-logs?action=order.&search={order.Number}");
        Assert.Equal("order.payment_verified", Assert.Single(log!.Items).Action);
    }

    [Fact]
    public async Task A_rejected_UPI_proof_can_be_sent_again()
    {
        var f = await ShopWithItemsAsync();
        var (customer, order) = await PlacedOrderAsync(f, "Upi");
        var shopOrder = $"/api/shops/{f.Shop.Id}/orders/{order.Id}";
        var reference = NewReference();
        await Read<OrderDto>(await customer.PostAsync($"/api/orders/{order.Id}/upi-proof", Proof(reference, Png)));

        Assert.Equal(HttpStatusCode.BadRequest, (await f.Owner.PostAsJsonAsync($"{shopOrder}/payment/reject", new ReasonRequest(""))).StatusCode);
        var rejected = await Read<OrderDto>(await f.Owner.PostAsJsonAsync($"{shopOrder}/payment/reject", new ReasonRequest("No such amount received")));
        Assert.Equal("Rejected", rejected.PaymentStatus);
        Assert.Equal("payment_not_verified", await ErrorCode(await Step(f, order, "Accepted")));

        var seen = await customer.GetFromJsonAsync<OrderDto>($"/api/orders/{order.Id}");
        Assert.Equal("No such amount received", seen!.PaymentRejectReason);

        // Sending again, even with the same reference, is allowed for the same order.
        var again = await Read<OrderDto>(await customer.PostAsync($"/api/orders/{order.Id}/upi-proof", Proof(reference, Png)));
        Assert.Equal("AwaitingVerification", again.PaymentStatus);
        Assert.Null(again.PaymentRejectReason);
        Assert.Equal("Paid", (await Read<OrderDto>(await f.Owner.PostAsync($"{shopOrder}/payment/verify", null))).PaymentStatus);
    }

    [Fact]
    public async Task One_UPI_reference_cannot_pay_for_two_orders()
    {
        var f = await ShopWithItemsAsync();
        var (customer, first) = await PlacedOrderAsync(f, "Upi");
        var second = await Read<OrderDto>(await customer.PostAsJsonAsync("/api/orders", Cart(f, "Upi")));
        var reference = NewReference();

        await Read<OrderDto>(await customer.PostAsync($"/api/orders/{first.Id}/upi-proof", Proof(reference, Png)));
        var reused = await customer.PostAsync($"/api/orders/{second.Id}/upi-proof", Proof(reference.ToLower(), Png));
        Assert.Equal("reference_used", await ErrorCode(reused));

        var cash = await Read<OrderDto>(await customer.PostAsJsonAsync("/api/orders", Cart(f)));
        Assert.Equal("not_upi", await ErrorCode(await customer.PostAsync($"/api/orders/{cash.Id}/upi-proof", Proof(NewReference(), Png))));
    }

    [Fact]
    public async Task The_payment_screenshot_is_visible_only_to_the_customer_and_the_shop()
    {
        var f = await ShopWithItemsAsync();
        var otherShop = await ShopWithItemsAsync();
        var (customer, order) = await PlacedOrderAsync(f, "Upi");
        var (stranger, _, _, _) = await app.SignedInUserAsync();
        Assert.Equal(HttpStatusCode.NotFound, (await customer.GetAsync($"/api/orders/{order.Id}/upi-proof")).StatusCode);
        await Read<OrderDto>(await customer.PostAsync($"/api/orders/{order.Id}/upi-proof", Proof(NewReference(), Png)));

        var mine = await customer.GetAsync($"/api/orders/{order.Id}/upi-proof");
        Assert.Equal("image/png", mine.Content.Headers.ContentType!.MediaType);
        Assert.Equal(Png, await mine.Content.ReadAsByteArrayAsync());
        Assert.Equal(Png, await f.Owner.GetByteArrayAsync($"/api/shops/{f.Shop.Id}/orders/{order.Id}/upi-proof"));

        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/orders/{order.Id}/upi-proof")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/shops/{f.Shop.Id}/orders/{order.Id}/upi-proof")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await otherShop.Owner.GetAsync($"/api/shops/{otherShop.Shop.Id}/orders/{order.Id}/upi-proof")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await app.CreateClient().GetAsync($"/api/orders/{order.Id}/upi-proof")).StatusCode);
    }

    [Fact]
    public async Task Cancelling_a_paid_UPI_order_tells_the_shop_to_refund()
    {
        var f = await ShopWithItemsAsync();
        var (customer, order) = await PlacedOrderAsync(f, "Upi");
        var shopOrder = $"/api/shops/{f.Shop.Id}/orders/{order.Id}";
        await customer.PostAsync($"/api/orders/{order.Id}/upi-proof", Proof(NewReference(), Png));
        await f.Owner.PostAsync($"{shopOrder}/payment/verify", null);

        var cancelled = await Read<OrderDto>(await f.Owner.PostAsJsonAsync($"{shopOrder}/cancel", new ReasonRequest("Cannot deliver today")));
        Assert.Contains("Refund ₹272", cancelled.Events[^1].Note);
        Assert.Equal("nothing_to_verify", await ErrorCode(await f.Owner.PostAsync($"{shopOrder}/payment/verify", null)));
    }

    [Fact]
    public async Task A_deactivated_shop_cannot_change_its_orders()
    {
        var f = await ShopWithItemsAsync();
        var (_, order) = await PlacedOrderAsync(f);
        var admin = await app.AdminClientAsync();
        await admin.PostAsync($"/api/admin/shops/{f.Shop.Id}/deactivate", null);

        Assert.Equal("shop_deactivated", await ErrorCode(await Step(f, order, "Accepted")));
        Assert.Equal("Placed", (await f.Owner.GetFromJsonAsync<OrderDto>($"/api/shops/{f.Shop.Id}/orders/{order.Id}"))!.Status);
    }

    [Fact]
    public async Task Two_people_accepting_the_same_order_at_once_do_not_both_succeed_silently()
    {
        var f = await ShopWithItemsAsync();
        var (_, order) = await PlacedOrderAsync(f);

        var responses = await Task.WhenAll(Enumerable.Range(0, 6).Select(_ => Step(f, order, "Accepted")));

        Assert.Contains(responses, r => r.StatusCode == HttpStatusCode.OK);
        Assert.All(responses, r => Assert.True(r.StatusCode is HttpStatusCode.OK or HttpStatusCode.Conflict));
        var final = await f.Owner.GetFromJsonAsync<OrderDto>($"/api/shops/{f.Shop.Id}/orders/{order.Id}");
        Assert.Equal(1, final!.Events.Count(e => e.Title == "Order accepted"));
    }
}
