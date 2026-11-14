using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using SmallMart.Api.Data;
using SmallMart.Api.Domain;
using SmallMart.Api.Orders;
using SmallMart.Api.Shops;

namespace SmallMart.Api.Tests;

[Collection("api")]
public class ItemImageTests(TestApp app)
{
    private static async Task<T> Read<T>(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    private static async Task<string?> ErrorCode(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();

    /// <summary>A valid PNG that differs from every other one, so each picture is its own file.</summary>
    private static byte[] Png()
    {
        var bytes = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=");
        return [.. bytes, .. Guid.NewGuid().ToByteArray()];
    }

    private static MultipartFormDataContent Upload(byte[]? bytes = null)
    {
        var file = new ByteArrayContent(bytes ?? Png());
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        return new MultipartFormDataContent { { file, "file", "photo.png" } };
    }

    private async Task<(HttpClient Owner, ShopDto Shop, string Items)> ShopAsync()
    {
        var (owner, _, _, _) = await app.SignedInOwnerAsync();
        var shop = await Read<ShopDto>(await owner.PostAsJsonAsync("/api/shops", new ShopRequest(
            $"Photo Shop {Guid.NewGuid():N}"[..24], null, "9876543210", "12 Market Road", "Jaipur", "302001", null, 0, 0)));
        return (owner, shop, $"/api/shops/{shop.Id}/items");
    }

    private static async Task<ItemImageDto> Stage(HttpClient owner, string items) =>
        await Read<ItemImageDto>(await owner.PostAsync($"{items}/images", Upload()));

    private static ItemRequest Request(string name, params Guid[] imageIds) =>
        new(name, null, null, 50, null, "1 piece", null, ImageIds: imageIds.ToList());

    private static HttpRequestMessage NoAuto(HttpMethod method, string url, HttpContent content)
    {
        var request = new HttpRequestMessage(method, url) { Content = content };
        request.Headers.Add(TestApp.NoAutoImage, "1");
        return request;
    }

    [Fact]
    public async Task An_item_cannot_be_created_without_a_picture()
    {
        var (owner, _, items) = await ShopAsync();

        var none = await owner.SendAsync(NoAuto(HttpMethod.Post, items, JsonContent.Create(Request("No Picture"))));
        Assert.Equal(HttpStatusCode.BadRequest, none.StatusCode);
        Assert.Equal("images_required", await ErrorCode(none));
        var empty = await owner.SendAsync(NoAuto(HttpMethod.Post, items, JsonContent.Create(Request("Empty list") with { ImageIds = [] })));
        Assert.Equal("images_required", await ErrorCode(empty));
        Assert.Empty((await owner.GetFromJsonAsync<List<ItemDto>>(items))!);
    }

    [Fact]
    public async Task An_item_is_created_with_one_to_five_pictures_in_the_order_given()
    {
        var (owner, _, items) = await ShopAsync();
        var staged = new List<ItemImageDto>();
        for (var i = 0; i < 5; i++)
            staged.Add(await Stage(owner, items));
        Assert.EndsWith(".png", staged[0].Url);

        var one = await Read<ItemDto>(await owner.PostAsJsonAsync(items, Request("One", staged[0].Id)));
        Assert.Equal([staged[0].Id], one.Images.Select(i => i.Id));
        Assert.Equal(staged[0].Url, one.ImageUrl);

        // The same pictures cannot be used again; a new set of five can.
        Assert.Equal("unknown_image", await ErrorCode(await owner.SendAsync(NoAuto(HttpMethod.Post, items, JsonContent.Create(Request("Reuse", staged[0].Id))))));
        var more = new List<ItemImageDto>();
        for (var i = 0; i < 5; i++)
            more.Add(await Stage(owner, items));
        var order = new[] { more[3], more[0], more[4], more[1], more[2] };
        var five = await Read<ItemDto>(await owner.PostAsJsonAsync(items, Request("Five", order.Select(i => i.Id).ToArray())));
        Assert.Equal(order.Select(i => i.Id), five.Images.Select(i => i.Id));
        Assert.Equal(more[3].Url, five.ImageUrl);

        var get = await owner.GetFromJsonAsync<ItemDto>($"{items}/{five.Id}");
        Assert.Equal(5, get!.Images.Count);
        Assert.Equal(2, (await owner.GetFromJsonAsync<List<ItemDto>>(items))!.Count);

        // Each picture is served.
        foreach (var image in five.Images)
            Assert.Equal(HttpStatusCode.OK, (await app.CreateClient().GetAsync(image.Url)).StatusCode);
    }

    [Fact]
    public async Task More_than_five_pictures_or_pictures_of_another_shop_are_refused()
    {
        var (owner, _, items) = await ShopAsync();
        var (other, _, otherItems) = await ShopAsync();
        var six = new List<Guid>();
        for (var i = 0; i < 6; i++)
            six.Add((await Stage(owner, items)).Id);

        var tooMany = await owner.SendAsync(NoAuto(HttpMethod.Post, items, JsonContent.Create(Request("Six", [.. six]))));
        Assert.Equal(HttpStatusCode.Conflict, tooMany.StatusCode);
        Assert.Equal("too_many_images", await ErrorCode(tooMany));

        var foreign = await Stage(other, otherItems);
        Assert.Equal("unknown_image", await ErrorCode(await owner.SendAsync(NoAuto(HttpMethod.Post, items, JsonContent.Create(Request("Foreign", foreign.Id))))));
        Assert.Equal("unknown_image", await ErrorCode(await owner.SendAsync(NoAuto(HttpMethod.Post, items, JsonContent.Create(Request("Missing", Guid.NewGuid()))))));
        Assert.Equal("unknown_image", await ErrorCode(await owner.SendAsync(NoAuto(HttpMethod.Post, items, JsonContent.Create(Request("Twice", six[0], six[0]))))));

        // A refused item takes none of the pictures: they can still be used.
        Assert.NotEqual(Guid.Empty, (await Read<ItemDto>(await owner.PostAsJsonAsync(items, Request("Fine", six[0], six[1])))).Id);
    }

    [Fact]
    public async Task Only_real_pictures_from_shop_members_can_be_uploaded()
    {
        var (owner, _, items) = await ShopAsync();
        var (stranger, _, _, _) = await app.SignedInOwnerAsync();
        var (customer, _, _, _) = await app.SignedInUserAsync();

        Assert.Equal("invalid_image", await ErrorCode(await owner.PostAsync($"{items}/images", Upload("<script>alert(1)</script>"u8.ToArray()))));
        Assert.Equal("invalid_image", await ErrorCode(await owner.PostAsync($"{items}/images", Upload(new byte[5 * 1024 * 1024 + 1]))));
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PostAsync($"{items}/images", new MultipartFormDataContent())).StatusCode);   // no file at all
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PostAsync($"{items}/images", Upload())).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await customer.PostAsync($"{items}/images", Upload())).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await app.CreateClient().PostAsync($"{items}/images", Upload())).StatusCode);
    }

    [Fact]
    public async Task Unused_pictures_can_be_removed_and_only_a_few_can_wait_at_once()
    {
        var (owner, _, items) = await ShopAsync();
        var first = await Stage(owner, items);
        Assert.Equal(HttpStatusCode.OK, (await app.CreateClient().GetAsync(first.Url)).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await owner.DeleteAsync($"{items}/images/{first.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await app.CreateClient().GetAsync(first.Url)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.DeleteAsync($"{items}/images/{first.Id}")).StatusCode);

        for (var i = 0; i < 25; i++)
            await Stage(owner, items);
        var over = await owner.PostAsync($"{items}/images", Upload());
        Assert.Equal(HttpStatusCode.Conflict, over.StatusCode);
        Assert.Equal("too_many_pending_images", await ErrorCode(over));
    }

    [Fact]
    public async Task Pictures_of_an_existing_item_can_be_added_removed_and_reordered_but_never_below_one()
    {
        var (owner, _, items) = await ShopAsync();
        var item = await Read<ItemDto>(await owner.PostAsJsonAsync(items, Request("Gallery", (await Stage(owner, items)).Id)));
        var cover = item.Images.Single();
        Assert.Equal("invalid_image", await ErrorCode(await owner.PostAsync($"{items}/{item.Id}/images", Upload("nope"u8.ToArray()))));

        for (var i = 0; i < 4; i++)
            item = await Read<ItemDto>(await owner.PostAsync($"{items}/{item.Id}/images", Upload()));
        Assert.Equal(5, item.Images.Count);
        Assert.Equal(cover.Id, item.Images[0].Id);

        var sixth = await owner.PostAsync($"{items}/{item.Id}/images", Upload());
        Assert.Equal(HttpStatusCode.Conflict, sixth.StatusCode);
        Assert.Equal("too_many_images", await ErrorCode(sixth));

        var newCover = item.Images[3];
        item = await Read<ItemDto>(await owner.PostAsync($"{items}/{item.Id}/images/{newCover.Id}/cover", null));
        Assert.Equal(newCover.Id, item.Images[0].Id);
        Assert.Equal(newCover.Url, item.ImageUrl);
        Assert.Equal(5, item.Images.Count);
        Assert.Equal(newCover.Id, (await owner.GetFromJsonAsync<List<ItemDto>>(items))!.Single().Images[0].Id);

        // Removing the cover promotes the next picture.
        item = await Read<ItemDto>(await owner.DeleteAsync($"{items}/{item.Id}/images/{newCover.Id}"));
        Assert.Equal(4, item.Images.Count);
        Assert.DoesNotContain(newCover.Id, item.Images.Select(i => i.Id));
        Assert.Equal(HttpStatusCode.NotFound, (await app.CreateClient().GetAsync(newCover.Url)).StatusCode);

        while (item.Images.Count > 1)
            item = await Read<ItemDto>(await owner.DeleteAsync($"{items}/{item.Id}/images/{item.Images[^1].Id}"));
        var last = await owner.DeleteAsync($"{items}/{item.Id}/images/{item.Images[0].Id}");
        Assert.Equal(HttpStatusCode.Conflict, last.StatusCode);
        Assert.Equal("last_image", await ErrorCode(last));
        Assert.Single((await owner.GetFromJsonAsync<ItemDto>($"{items}/{item.Id}"))!.Images);

        Assert.Equal(HttpStatusCode.NotFound, (await owner.DeleteAsync($"{items}/{item.Id}/images/{Guid.NewGuid()}")).StatusCode);
        var (stranger, _, _, _) = await app.SignedInOwnerAsync();
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PostAsync($"{items}/{item.Id}/images", Upload())).StatusCode);
    }

    [Fact]
    public async Task Deleting_an_item_removes_all_its_picture_files()
    {
        var (owner, _, items) = await ShopAsync();
        var item = await Read<ItemDto>(await owner.PostAsJsonAsync(items, Request("Doomed", (await Stage(owner, items)).Id)));
        item = await Read<ItemDto>(await owner.PostAsync($"{items}/{item.Id}/images", Upload()));
        var urls = item.Images.Select(i => i.Url).ToList();

        Assert.Equal(HttpStatusCode.NoContent, (await owner.DeleteAsync($"{items}/{item.Id}")).StatusCode);

        foreach (var url in urls)
            Assert.Equal(HttpStatusCode.NotFound, (await app.CreateClient().GetAsync(url)).StatusCode);
    }

    [Fact]
    public async Task An_older_item_without_a_picture_cannot_be_saved_until_it_has_one()
    {
        var (owner, shop, items) = await ShopAsync();
        Guid itemId;
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var legacy = new Item { Id = Guid.NewGuid(), ShopId = shop.Id, Name = "Legacy", Price = 10, Unit = "1 piece", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow };
            db.Items.Add(legacy);
            await db.SaveChangesAsync();
            itemId = legacy.Id;
        }

        var refused = await owner.PutAsJsonAsync($"{items}/{itemId}", Request("Legacy renamed") with { Price = 12 });
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Equal("images_required", await ErrorCode(refused));

        await Read<ItemDto>(await owner.PostAsync($"{items}/{itemId}/images", Upload()));
        Assert.Equal("Legacy renamed", (await Read<ItemDto>(await owner.PutAsJsonAsync($"{items}/{itemId}", Request("Legacy renamed") with { Price = 12 }))).Name);
    }

    [Fact]
    public async Task Customers_see_every_picture_on_the_product_page_and_only_for_visible_items()
    {
        var (owner, shop, items) = await ShopAsync();
        var item = await Read<ItemDto>(await owner.PostAsJsonAsync(items, Request("Showcase", (await Stage(owner, items)).Id, (await Stage(owner, items)).Id, (await Stage(owner, items)).Id)));
        var hidden = await Read<ItemDto>(await owner.PostAsJsonAsync(items, Request("Hidden", (await Stage(owner, items)).Id) with { IsActive = false }));
        var (customer, _, _, _) = await app.SignedInUserAsync();

        var detail = await customer.GetFromJsonAsync<StoreItemDetailDto>($"/api/store/shops/{shop.Id}/items/{item.Id}");
        Assert.Equal("Showcase", detail!.Item.Name);
        Assert.Equal(item.Images.Select(i => i.Url), detail.ImageUrls);
        Assert.Equal(item.ImageUrl, detail.Item.ImageUrl);
        Assert.Equal(shop.Id, detail.Shop.Id);

        Assert.Equal(HttpStatusCode.NotFound, (await customer.GetAsync($"/api/store/shops/{shop.Id}/items/{hidden.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await customer.GetAsync($"/api/store/shops/{shop.Id}/items/{Guid.NewGuid()}")).StatusCode);
        await (await app.AdminClientAsync()).PostAsync($"/api/admin/shops/{shop.Id}/deactivate", null);
        Assert.Equal(HttpStatusCode.NotFound, (await customer.GetAsync($"/api/store/shops/{shop.Id}/items/{item.Id}")).StatusCode);
    }
}
