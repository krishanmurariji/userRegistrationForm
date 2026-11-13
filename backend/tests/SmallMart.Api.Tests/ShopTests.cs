using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using SmallMart.Api.Shops;

namespace SmallMart.Api.Tests;

[Collection("api")]
public class ShopTests(TestApp app)
{
    // Smallest valid PNG: a single transparent pixel.
    private static readonly byte[] Png = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=");

    private static ShopRequest NewShop(string name = "Verma Kirana") => new(
        name, "Daily needs and groceries", "+91 98765 43210", "12 Market Road", "Jaipur", "302001",
        "verma@okaxis", 20, 100);

    private static ItemRequest NewItem(string name = "Toor Dal", Guid? categoryId = null) =>
        new(name, "Unpolished", categoryId, 140, 160, "1 kg", "8901234567890");

    private static async Task<T> Read<T>(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    private static async Task<string?> ErrorCode(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();

    private async Task<(HttpClient Client, ShopDto Shop)> OwnerWithShopAsync()
    {
        var (client, _, _, _) = await app.SignedInOwnerAsync();
        var shop = await Read<ShopDto>(await client.PostAsJsonAsync("/api/shops", NewShop()));
        return (client, shop);
    }

    private static MultipartFormDataContent Upload(byte[] bytes, string fileName, string contentType)
    {
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        return new MultipartFormDataContent { { file, "file", fileName } };
    }

    [Fact]
    public async Task Creating_a_shop_makes_the_user_its_owner_and_lists_it()
    {
        var (client, shop) = await OwnerWithShopAsync();

        Assert.Equal("Verma Kirana", shop.Name);
        Assert.Equal("Owner", shop.MyRole);
        Assert.True(shop.IsOpen);
        Assert.Equal(20, shop.DeliveryFee);

        var mine = await client.GetFromJsonAsync<List<ShopDto>>("/api/shops/mine");
        Assert.Equal([shop.Id], mine!.Select(s => s.Id));
    }

    [Fact]
    public async Task A_customer_cannot_open_a_shop()
    {
        var (customer, _, _, _) = await app.SignedInUserAsync();
        var response = await customer.PostAsJsonAsync("/api/shops", NewShop());
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Empty((await customer.GetFromJsonAsync<List<ShopDto>>("/api/shops/mine"))!);
    }

    [Fact]
    public async Task Shop_endpoints_need_a_signed_in_user()
    {
        var client = app.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/shops/mine")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/shops", NewShop())).StatusCode);
    }

    [Theory]
    [InlineData("12345", "verma@okaxis", "+91 98765 43210")]   // pincode too short
    [InlineData("302001", "not-a-upi-id", "+91 98765 43210")]  // UPI ID without @bank
    [InlineData("302001", "verma@okaxis", "call me")]          // phone
    public async Task Shop_details_are_validated(string pincode, string upiId, string phone)
    {
        var (client, _, _, _) = await app.SignedInOwnerAsync();
        var response = await client.PostAsJsonAsync("/api/shops", NewShop() with { Pincode = pincode, UpiId = upiId, Phone = phone });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Owner_can_update_the_shop_and_close_it()
    {
        var (client, shop) = await OwnerWithShopAsync();

        var updated = await Read<ShopDto>(await client.PutAsJsonAsync($"/api/shops/{shop.Id}",
            NewShop("Verma Super Store") with { IsOpen = false, UpiId = null, MinimumOrder = 250 }));

        Assert.Equal("Verma Super Store", updated.Name);
        Assert.False(updated.IsOpen);
        Assert.Null(updated.UpiId);
        Assert.Equal(250, (await client.GetFromJsonAsync<ShopDto>($"/api/shops/{shop.Id}"))!.MinimumOrder);
    }

    [Fact]
    public async Task Another_user_cannot_see_or_change_someone_elses_shop()
    {
        var (_, shop) = await OwnerWithShopAsync();
        var (stranger, _, _, _) = await app.SignedInUserAsync();

        Assert.Empty((await stranger.GetFromJsonAsync<List<ShopDto>>("/api/shops/mine"))!);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/shops/{shop.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PutAsJsonAsync($"/api/shops/{shop.Id}", NewShop("Hacked"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/shops/{shop.Id}/items")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PostAsJsonAsync($"/api/shops/{shop.Id}/items", NewItem())).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PostAsJsonAsync($"/api/shops/{shop.Id}/categories", new CategoryRequest("X"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PostAsync($"/api/shops/{shop.Id}/logo", Upload(Png, "a.png", "image/png"))).StatusCode);
    }

    [Fact]
    public async Task Categories_can_be_added_renamed_and_listed_in_order()
    {
        var (client, shop) = await OwnerWithShopAsync();
        var url = $"/api/shops/{shop.Id}/categories";

        var dairy = await Read<CategoryDto>(await client.PostAsJsonAsync(url, new CategoryRequest("Dairy", 2)));
        await Read<CategoryDto>(await client.PostAsJsonAsync(url, new CategoryRequest("Grains", 1)));

        var duplicate = await client.PostAsJsonAsync(url, new CategoryRequest(" dairy "));
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
        Assert.Equal("duplicate_category", await ErrorCode(duplicate));

        await Read<CategoryDto>(await client.PutAsJsonAsync($"{url}/{dairy.Id}", new CategoryRequest("Milk & Dairy", 2)));

        var list = await client.GetFromJsonAsync<List<CategoryDto>>(url);
        Assert.Equal(["Grains", "Milk & Dairy"], list!.Select(c => c.Name));
    }

    [Fact]
    public async Task Items_can_be_created_searched_updated_and_deleted()
    {
        var (client, shop) = await OwnerWithShopAsync();
        var category = await Read<CategoryDto>(await client.PostAsJsonAsync(
            $"/api/shops/{shop.Id}/categories", new CategoryRequest("Grains")));
        var url = $"/api/shops/{shop.Id}/items";

        var dal = await Read<ItemDto>(await client.PostAsJsonAsync(url, NewItem("Toor Dal", category.Id)));
        await Read<ItemDto>(await client.PostAsJsonAsync(url, NewItem("Amul Butter") with { Barcode = "111" }));
        Assert.Equal(140, dal.Price);
        Assert.True(dal.IsActive);

        Assert.Equal(["Amul Butter", "Toor Dal"], (await client.GetFromJsonAsync<List<ItemDto>>(url))!.Select(i => i.Name));
        Assert.Equal(["Toor Dal"], (await client.GetFromJsonAsync<List<ItemDto>>($"{url}?search=DAL"))!.Select(i => i.Name));
        Assert.Equal(["Amul Butter"], (await client.GetFromJsonAsync<List<ItemDto>>($"{url}?search=111"))!.Select(i => i.Name));
        Assert.Equal(["Toor Dal"], (await client.GetFromJsonAsync<List<ItemDto>>($"{url}?categoryId={category.Id}"))!.Select(i => i.Name));
        Assert.Equal(1, (await client.GetFromJsonAsync<List<CategoryDto>>($"/api/shops/{shop.Id}/categories"))!.Single().ItemCount);

        var updated = await Read<ItemDto>(await client.PutAsJsonAsync($"{url}/{dal.Id}",
            NewItem("Toor Dal Premium", category.Id) with { Price = 150, IsActive = false }));
        Assert.Equal(150, updated.Price);
        Assert.False(updated.IsActive);

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"{url}/{dal.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"{url}/{dal.Id}")).StatusCode);
    }

    [Fact]
    public async Task Item_rules_are_enforced()
    {
        var (client, shop) = await OwnerWithShopAsync();
        var (_, otherShop) = await OwnerWithShopAsync();
        var (otherOwner, _) = (await OwnerWithShopAsync());
        var url = $"/api/shops/{shop.Id}/items";

        var aboveMrp = await client.PostAsJsonAsync(url, NewItem() with { Price = 200, Mrp = 150 });
        Assert.Equal("price_above_mrp", await ErrorCode(aboveMrp));

        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(url, NewItem() with { Price = 0 })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(url, NewItem() with { Name = "" })).StatusCode);

        // A category from a different shop cannot be used.
        var foreignCategory = await Read<CategoryDto>(await otherOwner.PostAsJsonAsync(
            $"/api/shops/{(await otherOwner.GetFromJsonAsync<List<ShopDto>>("/api/shops/mine"))!.Single().Id}/categories",
            new CategoryRequest("Foreign")));
        var crossShop = await client.PostAsJsonAsync(url, NewItem(categoryId: foreignCategory.Id));
        Assert.Equal("unknown_category", await ErrorCode(crossShop));

        // An item cannot be reached through another shop's URL.
        var item = await Read<ItemDto>(await client.PostAsJsonAsync(url, NewItem()));
        Assert.NotEqual(shop.Id, otherShop.Id);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/shops/{otherShop.Id}/items/{item.Id}")).StatusCode);
    }

    [Fact]
    public async Task An_item_can_name_a_new_category_which_is_created_once()
    {
        var (client, shop) = await OwnerWithShopAsync();
        var url = $"/api/shops/{shop.Id}/items";

        var first = await Read<ItemDto>(await client.PostAsJsonAsync(url, NewItem("Milk") with { NewCategoryName = "  Dairy " }));
        var second = await Read<ItemDto>(await client.PostAsJsonAsync(url, NewItem("Curd") with { NewCategoryName = "dairy" }));
        var third = await Read<ItemDto>(await client.PostAsJsonAsync(url, NewItem("Chips") with { NewCategoryName = "Snacks" }));

        var categories = await client.GetFromJsonAsync<List<CategoryDto>>($"/api/shops/{shop.Id}/categories");
        Assert.Equal([("Dairy", 2), ("Snacks", 1)], categories!.Select(c => (c.Name, c.ItemCount)));
        Assert.Equal(first.CategoryId, second.CategoryId);
        Assert.NotEqual(first.CategoryId, third.CategoryId);

        // Editing can move an item into a brand-new category too.
        var moved = await Read<ItemDto>(await client.PutAsJsonAsync($"{url}/{first.Id}", NewItem("Milk") with { NewCategoryName = "Beverages" }));
        Assert.Equal(3, (await client.GetFromJsonAsync<List<CategoryDto>>($"/api/shops/{shop.Id}/categories"))!.Count);
        Assert.NotEqual(first.CategoryId, moved.CategoryId);
    }

    [Fact]
    public async Task Duplicating_an_item_makes_a_hidden_copy_with_its_own_photo()
    {
        var (client, shop) = await OwnerWithShopAsync();
        var url = $"/api/shops/{shop.Id}/items";
        var original = await Read<ItemDto>(await client.PostAsJsonAsync(url,
            NewItem("Toor Dal") with { NewCategoryName = "Grains", TrackStock = true, OpeningStock = 9 }));
        original = await Read<ItemDto>(await client.PostAsync($"{url}/{original.Id}/image", Upload(Png, "dal.png", "image/png")));

        var copy = await Read<ItemDto>(await client.PostAsync($"{url}/{original.Id}/duplicate", null));

        Assert.NotEqual(original.Id, copy.Id);
        Assert.Equal("Toor Dal (copy)", copy.Name);
        Assert.Equal((original.CategoryId, original.Price, original.Mrp, original.Unit), (copy.CategoryId, copy.Price, copy.Mrp, copy.Unit));
        Assert.False(copy.IsActive);
        Assert.Null(copy.Barcode);
        Assert.True(copy.TrackStock);
        Assert.Equal(0, copy.StockQuantity);
        Assert.NotNull(copy.ImageUrl);
        Assert.NotEqual(original.ImageUrl, copy.ImageUrl);

        // The copy's photo is its own file: deleting the original leaves it in place.
        await client.DeleteAsync($"{url}/{original.Id}");
        Assert.Equal(HttpStatusCode.OK, (await app.CreateClient().GetAsync(copy.ImageUrl)).StatusCode);

        var (stranger, _, _, _) = await app.SignedInOwnerAsync();
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PostAsync($"{url}/{copy.Id}/duplicate", null)).StatusCode);
    }

    [Fact]
    public async Task Deleting_a_category_keeps_its_items()
    {
        var (client, shop) = await OwnerWithShopAsync();
        var category = await Read<CategoryDto>(await client.PostAsJsonAsync(
            $"/api/shops/{shop.Id}/categories", new CategoryRequest("Snacks")));
        var item = await Read<ItemDto>(await client.PostAsJsonAsync($"/api/shops/{shop.Id}/items", NewItem("Chips", category.Id)));

        Assert.Equal(HttpStatusCode.NoContent,
            (await client.DeleteAsync($"/api/shops/{shop.Id}/categories/{category.Id}")).StatusCode);

        var kept = await client.GetFromJsonAsync<ItemDto>($"/api/shops/{shop.Id}/items/{item.Id}");
        Assert.Null(kept!.CategoryId);
    }

    [Fact]
    public async Task Item_photo_can_be_uploaded_replaced_and_downloaded()
    {
        var (client, shop) = await OwnerWithShopAsync();
        var item = await Read<ItemDto>(await client.PostAsJsonAsync($"/api/shops/{shop.Id}/items", NewItem()));
        var url = $"/api/shops/{shop.Id}/items/{item.Id}/image";

        // The file name lies about the type; the content decides.
        var first = await Read<ItemDto>(await client.PostAsync(url, Upload(Png, "photo.exe", "application/octet-stream")));
        Assert.EndsWith(".png", first.ImageUrl);

        var download = await app.CreateClient().GetAsync(first.ImageUrl);
        Assert.Equal(HttpStatusCode.OK, download.StatusCode);
        Assert.Equal("image/png", download.Content.Headers.ContentType!.MediaType);
        Assert.Equal(Png, await download.Content.ReadAsByteArrayAsync());

        var second = await Read<ItemDto>(await client.PostAsync(url, Upload(Png, "photo.png", "image/png")));
        Assert.NotEqual(first.ImageUrl, second.ImageUrl);
        Assert.Equal(HttpStatusCode.NotFound, (await app.CreateClient().GetAsync(first.ImageUrl)).StatusCode);
    }

    [Fact]
    public async Task Files_that_are_not_pictures_are_rejected()
    {
        var (client, shop) = await OwnerWithShopAsync();

        var script = "<script>alert(1)</script>"u8.ToArray();
        var response = await client.PostAsync($"/api/shops/{shop.Id}/logo", Upload(script, "logo.png", "image/png"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_image", await ErrorCode(response));

        var tooBig = new byte[5 * 1024 * 1024 + 1];
        Png.CopyTo(tooBig, 0);
        var big = await client.PostAsync($"/api/shops/{shop.Id}/logo", Upload(tooBig, "logo.png", "image/png"));
        Assert.Equal(HttpStatusCode.BadRequest, big.StatusCode);

        var logo = await Read<ShopDto>(await client.PostAsync($"/api/shops/{shop.Id}/logo", Upload(Png, "logo.png", "image/png")));
        Assert.StartsWith("/files/shops/", logo.LogoUrl);
    }
}
