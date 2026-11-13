using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using SmallMart.Api.Notifications;
using SmallMart.Api.Orders;
using SmallMart.Api.Shops;

namespace SmallMart.Api.Tests;

[Collection("api")]
public class InventoryTests(TestApp app)
{
    private static async Task<T> Read<T>(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    private static async Task<string?> ErrorCode(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();

    private record Fixture(HttpClient Owner, ShopDto Shop)
    {
        public string Items => $"/api/shops/{Shop.Id}/items";
    }

    private async Task<Fixture> ShopAsync()
    {
        var (owner, _, _, _) = await app.SignedInOwnerAsync();
        var shop = await Read<ShopDto>(await owner.PostAsJsonAsync("/api/shops", new ShopRequest(
            $"Stock Shop {Guid.NewGuid():N}"[..24], null, "9876543210", "12 Market Road", "Jaipur", "302001", null, 0, 0)));
        return new Fixture(owner, shop);
    }

    private static ItemRequest Item(string name, int? stock = null, int warnAt = 5, decimal price = 50) =>
        new(name, null, null, price, null, "1 piece", null, TrackStock: stock is not null, LowStockThreshold: warnAt, OpeningStock: stock);

    private static PlaceOrderRequest Order(Fixture f, params (ItemDto Item, int Qty)[] lines) => new(
        f.Shop.Id, lines.Select(l => new PlaceOrderLine(l.Item.Id, l.Qty)).ToList(),
        "CashOnDelivery", "Meena Sharma", "9123456780", "4 Lake View", "Jaipur", "302002", null, null);

    private static async Task<List<NotificationDto>> Notifications(HttpClient client) =>
        (await client.GetFromJsonAsync<NotificationListDto>("/api/notifications"))!.Items.ToList();

    // ---------- Stock kept by the shop

    [Fact]
    public async Task Items_are_uncounted_by_default_and_counted_when_the_shop_asks()
    {
        var f = await ShopAsync();
        var plain = await Read<ItemDto>(await f.Owner.PostAsJsonAsync(f.Items, Item("Plain")));
        Assert.False(plain.TrackStock);

        var counted = await Read<ItemDto>(await f.Owner.PostAsJsonAsync(f.Items, Item("Counted", stock: 12, warnAt: 3)));
        Assert.True(counted.TrackStock);
        Assert.Equal(12, counted.StockQuantity);
        Assert.Equal(3, counted.LowStockThreshold);

        var history = await f.Owner.GetFromJsonAsync<List<StockMovementDto>>($"{f.Items}/{counted.Id}/stock");
        var opening = Assert.Single(history!);
        Assert.Equal(("Opening", 12, 12), (opening.Reason, opening.Change, opening.QuantityAfter));

        // Switching counting on later starts from the number given; editing other details never changes stock.
        var switched = await Read<ItemDto>(await f.Owner.PutAsJsonAsync($"{f.Items}/{plain.Id}", Item("Plain", stock: 7)));
        Assert.Equal(7, switched.StockQuantity);
        var edited = await Read<ItemDto>(await f.Owner.PutAsJsonAsync($"{f.Items}/{plain.Id}", Item("Plain Renamed", stock: 999)));
        Assert.Equal(7, edited.StockQuantity);
        Assert.Equal("Plain Renamed", edited.Name);
    }

    [Fact]
    public async Task Stock_is_adjusted_with_a_reason_and_every_change_is_in_the_history()
    {
        var f = await ShopAsync();
        var item = await Read<ItemDto>(await f.Owner.PostAsJsonAsync(f.Items, Item("Rice", stock: 10)));
        var url = $"{f.Items}/{item.Id}/stock";

        Assert.Equal(30, (await Read<ItemDto>(await f.Owner.PostAsJsonAsync(url, new StockAdjustRequest(20, null, "Restock", "From wholesaler")))).StockQuantity);
        Assert.Equal(27, (await Read<ItemDto>(await f.Owner.PostAsJsonAsync(url, new StockAdjustRequest(-3, null, "Damage", "Torn bags")))).StockQuantity);
        Assert.Equal(25, (await Read<ItemDto>(await f.Owner.PostAsJsonAsync(url, new StockAdjustRequest(null, 25, "Correction", "Shelf count")))).StockQuantity);

        Assert.Equal("insufficient_stock", await ErrorCode(await f.Owner.PostAsJsonAsync(url, new StockAdjustRequest(-26, null, "Damage", null))));
        Assert.Equal("invalid_adjustment", await ErrorCode(await f.Owner.PostAsJsonAsync(url, new StockAdjustRequest(-5, null, "Restock", null))));
        Assert.Equal("invalid_adjustment", await ErrorCode(await f.Owner.PostAsJsonAsync(url, new StockAdjustRequest(5, null, "Damage", null))));
        Assert.Equal("invalid_adjustment", await ErrorCode(await f.Owner.PostAsJsonAsync(url, new StockAdjustRequest(5, 5, "Correction", null))));
        Assert.Equal("invalid_adjustment", await ErrorCode(await f.Owner.PostAsJsonAsync(url, new StockAdjustRequest(null, null, "Correction", null))));
        Assert.Equal("invalid_reason", await ErrorCode(await f.Owner.PostAsJsonAsync(url, new StockAdjustRequest(5, null, "Sale", null))));
        Assert.Equal(HttpStatusCode.BadRequest, (await f.Owner.PostAsJsonAsync(url, new StockAdjustRequest(null, -1, "Correction", null))).StatusCode);

        var history = await f.Owner.GetFromJsonAsync<List<StockMovementDto>>(url);
        Assert.Equal([("Correction", -2, 25), ("Damage", -3, 27), ("Restock", 20, 30), ("Opening", 10, 10)],
            history!.Select(m => (m.Reason, m.Change, m.QuantityAfter)));
        Assert.Equal("From wholesaler", history[2].Note);

        var uncounted = await Read<ItemDto>(await f.Owner.PostAsJsonAsync(f.Items, Item("Loose")));
        Assert.Equal("stock_not_tracked", await ErrorCode(await f.Owner.PostAsJsonAsync($"{f.Items}/{uncounted.Id}/stock", new StockAdjustRequest(5, null, "Restock", null))));
    }

    [Fact]
    public async Task Low_and_out_of_stock_items_can_be_listed_and_counted()
    {
        var f = await ShopAsync();
        await f.Owner.PostAsJsonAsync(f.Items, Item("Plenty", stock: 50));
        await f.Owner.PostAsJsonAsync(f.Items, Item("Running Low", stock: 5));
        await f.Owner.PostAsJsonAsync(f.Items, Item("Gone", stock: 0));
        await f.Owner.PostAsJsonAsync(f.Items, Item("Uncounted"));

        Assert.Equal(new StockSummaryDto(2, 1), await f.Owner.GetFromJsonAsync<StockSummaryDto>($"{f.Items}/stock-summary"));
        Assert.Equal(["Gone", "Running Low"], (await f.Owner.GetFromJsonAsync<List<ItemDto>>($"{f.Items}?stock=low"))!.Select(i => i.Name));
        Assert.Equal(["Gone"], (await f.Owner.GetFromJsonAsync<List<ItemDto>>($"{f.Items}?stock=out"))!.Select(i => i.Name));
    }

    [Fact]
    public async Task Stock_endpoints_are_closed_to_people_outside_the_shop()
    {
        var f = await ShopAsync();
        var item = await Read<ItemDto>(await f.Owner.PostAsJsonAsync(f.Items, Item("Private", stock: 5)));
        var (stranger, _, _, _) = await app.SignedInOwnerAsync();

        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"{f.Items}/{item.Id}/stock")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"{f.Items}/stock-summary")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PostAsJsonAsync($"{f.Items}/{item.Id}/stock", new StockAdjustRequest(100, null, "Restock", null))).StatusCode);
    }

    // ---------- Stock and orders

    [Fact]
    public async Task Customers_see_what_is_available_and_cannot_order_more()
    {
        var f = await ShopAsync();
        var counted = await Read<ItemDto>(await f.Owner.PostAsJsonAsync(f.Items, Item("Counted", stock: 3)));
        var gone = await Read<ItemDto>(await f.Owner.PostAsJsonAsync(f.Items, Item("Gone", stock: 0)));
        var loose = await Read<ItemDto>(await f.Owner.PostAsJsonAsync(f.Items, Item("Loose")));
        var (customer, _, _, _) = await app.SignedInUserAsync();

        var seen = await customer.GetFromJsonAsync<List<StoreItemDto>>($"/api/store/shops/{f.Shop.Id}/items");
        Assert.Equal([("Counted", 3), ("Gone", 0), ("Loose", null)], seen!.Select(i => (i.Name, i.Available)));

        var tooMany = await customer.PostAsJsonAsync("/api/orders", Order(f, (counted, 4)));
        Assert.Equal("insufficient_stock", await ErrorCode(tooMany));
        Assert.Contains("only 3 left of Counted", await tooMany.Content.ReadAsStringAsync());
        Assert.Equal("insufficient_stock", await ErrorCode(await customer.PostAsJsonAsync("/api/orders", Order(f, (gone, 1)))));

        // A refused order takes nothing, not even from the items that had enough.
        Assert.Equal("insufficient_stock", await ErrorCode(await customer.PostAsJsonAsync("/api/orders", Order(f, (counted, 2), (gone, 1)))));
        Assert.Equal(3, (await f.Owner.GetFromJsonAsync<ItemDto>($"{f.Items}/{counted.Id}"))!.StockQuantity);

        await Read<OrderDto>(await customer.PostAsJsonAsync("/api/orders", Order(f, (counted, 3), (loose, 50))));
        Assert.Equal(0, (await f.Owner.GetFromJsonAsync<ItemDto>($"{f.Items}/{counted.Id}"))!.StockQuantity);
        Assert.Empty((await f.Owner.GetFromJsonAsync<List<StockMovementDto>>($"{f.Items}/{loose.Id}/stock"))!);
    }

    [Fact]
    public async Task An_order_takes_stock_and_a_cancellation_puts_it_back()
    {
        var f = await ShopAsync();
        var item = await Read<ItemDto>(await f.Owner.PostAsJsonAsync(f.Items, Item("Soap", stock: 10)));
        var (customer, _, _, _) = await app.SignedInUserAsync();
        Task<ItemDto?> Now() => f.Owner.GetFromJsonAsync<ItemDto>($"{f.Items}/{item.Id}");

        var first = await Read<OrderDto>(await customer.PostAsJsonAsync("/api/orders", Order(f, (item, 4))));
        Assert.Equal(6, (await Now())!.StockQuantity);
        await Read<OrderDto>(await customer.PostAsync($"/api/orders/{first.Id}/cancel", null));
        Assert.Equal(10, (await Now())!.StockQuantity);

        var second = await Read<OrderDto>(await customer.PostAsJsonAsync("/api/orders", Order(f, (item, 2))));
        await Read<OrderDto>(await f.Owner.PostAsJsonAsync($"/api/shops/{f.Shop.Id}/orders/{second.Id}/status", new StatusRequest("Accepted")));
        await Read<OrderDto>(await f.Owner.PostAsJsonAsync($"/api/shops/{f.Shop.Id}/orders/{second.Id}/cancel", new ReasonRequest("Cannot deliver")));
        Assert.Equal(10, (await Now())!.StockQuantity);

        var third = await Read<OrderDto>(await customer.PostAsJsonAsync("/api/orders", Order(f, (item, 1))));
        foreach (var step in new[] { "Accepted", "Packed", "OutForDelivery", "Delivered" })
            await Read<OrderDto>(await f.Owner.PostAsJsonAsync($"/api/shops/{f.Shop.Id}/orders/{third.Id}/status", new StatusRequest(step)));
        Assert.Equal(9, (await Now())!.StockQuantity);

        var history = await f.Owner.GetFromJsonAsync<List<StockMovementDto>>($"{f.Items}/{item.Id}/stock");
        Assert.Equal(
            [("Sale", -1, 9, third.Number), ("OrderCancelled", 2, 10, second.Number), ("Sale", -2, 8, second.Number),
             ("OrderCancelled", 4, 10, first.Number), ("Sale", -4, 6, first.Number), ("Opening", 10, 10, null)],
            history!.Select(m => (m.Reason, m.Change, m.QuantityAfter, m.OrderNumber)));
    }

    [Fact]
    public async Task The_last_units_cannot_be_sold_twice_when_customers_order_at_the_same_moment()
    {
        var f = await ShopAsync();
        var item = await Read<ItemDto>(await f.Owner.PostAsJsonAsync(f.Items, Item("Last Three", stock: 3)));
        var customers = new List<HttpClient>();
        for (var i = 0; i < 8; i++)
            customers.Add((await app.SignedInUserAsync()).Client);

        var responses = await Task.WhenAll(customers.Select(c => c.PostAsJsonAsync("/api/orders", Order(f, (item, 1)))));

        Assert.Equal(3, responses.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.Equal(5, responses.Count(r => r.StatusCode == HttpStatusCode.Conflict));
        Assert.Equal(0, (await f.Owner.GetFromJsonAsync<ItemDto>($"{f.Items}/{item.Id}"))!.StockQuantity);
        Assert.Equal(3, (await f.Owner.GetFromJsonAsync<List<OrderSummaryDto>>($"/api/shops/{f.Shop.Id}/orders"))!.Count);
        Assert.Equal(3, (await f.Owner.GetFromJsonAsync<List<StockMovementDto>>($"{f.Items}/{item.Id}/stock"))!.Count(m => m.Reason == "Sale"));
    }

    // ---------- Notifications

    [Fact]
    public async Task The_shop_is_warned_once_when_stock_runs_low_and_again_when_it_runs_out()
    {
        var f = await ShopAsync();
        var item = await Read<ItemDto>(await f.Owner.PostAsJsonAsync(f.Items, Item("Sugar", stock: 7, warnAt: 5)));
        var (customer, _, _, _) = await app.SignedInUserAsync();
        async Task<List<string>> StockTitles() => (await Notifications(f.Owner)).Select(n => n.Title).Where(t => t.Contains("stock")).ToList();

        await customer.PostAsJsonAsync("/api/orders", Order(f, (item, 1)));   // 6 left: fine
        Assert.Empty(await StockTitles());
        await customer.PostAsJsonAsync("/api/orders", Order(f, (item, 2)));   // 4 left: crossed the line
        Assert.Equal(["Low stock: Sugar"], await StockTitles());
        await customer.PostAsJsonAsync("/api/orders", Order(f, (item, 1)));   // 3 left: already warned
        Assert.Equal(["Low stock: Sugar"], await StockTitles());
        await customer.PostAsJsonAsync("/api/orders", Order(f, (item, 3)));   // none left
        Assert.Equal(["Out of stock: Sugar", "Low stock: Sugar"], await StockTitles());

        var warning = (await Notifications(f.Owner)).First(n => n.Title == "Low stock: Sugar");
        Assert.Equal("Only 4 left.", warning.Body);
        Assert.Equal($"/shops/{f.Shop.Id}/items/{item.Id}/stock", warning.Link);
    }

    [Fact]
    public async Task Shop_and_customer_are_told_about_each_step_of_an_order()
    {
        var (owner, _, _, _) = await app.SignedInOwnerAsync();
        var shop = await Read<ShopDto>(await owner.PostAsJsonAsync("/api/shops", new ShopRequest(
            "Notify Store", null, "9876543210", "12 Market Road", "Jaipur", "302001", "notify@upi", 0, 0)));
        var f = new Fixture(owner, shop);
        var item = await Read<ItemDto>(await owner.PostAsJsonAsync(f.Items, Item("Tea")));
        var (customer, _, _, _) = await app.SignedInUserAsync();
        var png = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=");

        var order = await Read<OrderDto>(await customer.PostAsJsonAsync("/api/orders", Order(f, (item, 2)) with { PaymentMethod = "Upi" }));
        var proof = new MultipartFormDataContent { { new StringContent(Random.Shared.NextInt64(100_000_000_000, 999_999_999_999).ToString()), "reference" } };
        var file = new ByteArrayContent(png);
        file.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/png");
        proof.Add(file, "file", "p.png");
        await Read<OrderDto>(await customer.PostAsync($"/api/orders/{order.Id}/upi-proof", proof));

        var shopOrder = $"/api/shops/{shop.Id}/orders/{order.Id}";
        await Read<OrderDto>(await owner.PostAsync($"{shopOrder}/payment/verify", null));
        foreach (var step in new[] { "Accepted", "Packed", "OutForDelivery", "Delivered" })
            await Read<OrderDto>(await owner.PostAsJsonAsync($"{shopOrder}/status", new StatusRequest(step)));

        var forShop = await Notifications(owner);
        Assert.Equal([$"Check UPI payment for {order.Number}", $"New order {order.Number}"], forShop.Select(n => n.Title));
        Assert.All(forShop, n => Assert.Equal($"/shops/{shop.Id}/orders/{order.Id}", n.Link));
        Assert.Contains("Meena Sharma ordered 2 item(s) for ₹100, paying by UPI.", forShop[1].Body);

        var forCustomer = await Notifications(customer);
        Assert.All(forCustomer, n => Assert.Equal(($"Order {order.Number} from Notify Store", $"/orders/{order.Id}"), (n.Title, n.Link)));
        Assert.Equal(5, forCustomer.Count);
        Assert.Contains("delivered", forCustomer[0].Body);
        Assert.Contains("confirmed your UPI payment", forCustomer[4].Body);

        // Cancelling tells the other side, with the reason.
        var second = await Read<OrderDto>(await customer.PostAsJsonAsync("/api/orders", Order(f, (item, 1))));
        await owner.PostAsJsonAsync($"/api/shops/{shop.Id}/orders/{second.Id}/cancel", new ReasonRequest("Closed for the day"));
        Assert.Contains("Closed for the day", (await Notifications(customer))[0].Body);
        var third = await Read<OrderDto>(await customer.PostAsJsonAsync("/api/orders", Order(f, (item, 1))));
        await customer.PostAsync($"/api/orders/{third.Id}/cancel", null);
        Assert.Equal($"Order {third.Number} cancelled", (await Notifications(owner))[0].Title);
    }

    [Fact]
    public async Task Notifications_are_private_and_can_be_marked_read()
    {
        var f = await ShopAsync();
        var item = await Read<ItemDto>(await f.Owner.PostAsJsonAsync(f.Items, Item("Salt")));
        var (customer, _, _, _) = await app.SignedInUserAsync();
        await customer.PostAsJsonAsync("/api/orders", Order(f, (item, 1)));
        await customer.PostAsJsonAsync("/api/orders", Order(f, (item, 1)));

        var list = await f.Owner.GetFromJsonAsync<NotificationListDto>("/api/notifications");
        Assert.Equal(2, list!.Unread);
        Assert.All(list.Items, n => Assert.False(n.Read));
        Assert.Equal(2, (await f.Owner.GetFromJsonAsync<JsonElement>("/api/notifications/unread-count")).GetProperty("unread").GetInt32());

        // Someone else cannot read or mark them.
        Assert.Empty((await customer.GetFromJsonAsync<NotificationListDto>("/api/notifications"))!.Items);
        Assert.Equal(HttpStatusCode.NotFound, (await customer.PostAsync($"/api/notifications/{list.Items[0].Id}/read", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await app.CreateClient().GetAsync("/api/notifications")).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await f.Owner.PostAsync($"/api/notifications/{list.Items[0].Id}/read", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await f.Owner.PostAsync($"/api/notifications/{list.Items[0].Id}/read", null)).StatusCode);
        var after = await f.Owner.GetFromJsonAsync<NotificationListDto>("/api/notifications");
        Assert.Equal(1, after!.Unread);
        Assert.Equal([true, false], after.Items.Select(n => n.Read));

        await f.Owner.PostAsync("/api/notifications/read-all", null);
        Assert.Equal(0, (await f.Owner.GetFromJsonAsync<NotificationListDto>("/api/notifications"))!.Unread);
    }

    [Fact]
    public async Task Owners_are_told_when_the_admin_changes_their_role_or_shop()
    {
        var (customer, auth, _, _) = await app.SignedInUserAsync();
        var admin = await app.AdminClientAsync();
        await admin.PostAsync($"/api/admin/users/{auth.User.Id}/shop-owner", null);
        Assert.Equal("You can now open a shop", (await Notifications(customer))[0].Title);

        var f = await ShopAsync();
        await admin.PostAsync($"/api/admin/shops/{f.Shop.Id}/deactivate", null);
        await admin.PostAsync($"/api/admin/shops/{f.Shop.Id}/activate", null);
        Assert.Equal([$"{f.Shop.Name} is active again", $"{f.Shop.Name} was deactivated"], (await Notifications(f.Owner)).Select(n => n.Title));
    }
}
