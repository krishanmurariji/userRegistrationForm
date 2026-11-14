using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using SmallMart.Api.Ai;
using SmallMart.Api.Shops;

namespace SmallMart.Api.Tests;

[Collection("api")]
public class AiScanTests(TestApp app)
{
    private static async Task<T> Read<T>(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    private static async Task<string?> ErrorCode(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();

    private static MultipartFormDataContent Upload(byte[] bytes)
    {
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        return new MultipartFormDataContent { { file, "file", "photo.png" } };
    }

    /// <summary>A valid EAN-13 that no other test uses.</summary>
    private static string NewBarcode()
    {
        var digits = "890" + Random.Shared.NextInt64(100_000_000, 999_999_999);
        var sum = digits.Select((c, i) => (c - '0') * (i % 2 == 0 ? 1 : 3)).Sum();
        return digits + (10 - sum % 10) % 10;
    }

    private static SeenProduct Seen(
        string? name, string? unit = "100 g", decimal? mrp = null, string? barcode = null, string? category = "Dairy",
        string? brand = null, string? description = null, params string[] uncertain) =>
        new(name, brand, unit, mrp, barcode, category, description, uncertain);

    private async Task<(HttpClient Owner, ShopDto Shop, string Scan)> ShopAsync()
    {
        var (owner, _, _, _) = await app.SignedInOwnerAsync();
        var shop = await Read<ShopDto>(await owner.PostAsJsonAsync("/api/shops", new ShopRequest(
            $"Scan Shop {Guid.NewGuid():N}"[..24], null, "9876543210", "12 Market Road", "Jaipur", "302001", null, 0, 0)));
        return (owner, shop, $"/api/shops/{shop.Id}/items/scan");
    }

    // ---------- The scan endpoint

    [Fact]
    public async Task A_clear_photo_becomes_a_draft_with_every_field_marked_as_from_the_photo()
    {
        var (owner, shop, scan) = await ShopAsync();
        await owner.PostAsJsonAsync($"/api/shops/{shop.Id}/categories", new CategoryRequest("Milk & Dairy"));
        var photo = app.Ai.Photo(categories => [Seen("Amul Butter", "100 g", 58, null, categories.Contains("Milk & Dairy") ? "milk & dairy" : "wrong", "Amul", "Pasteurised butter")]);

        var result = await Read<ScanResultDto>(await owner.PostAsync(scan, Upload(photo)));

        var draft = Assert.Single(result.Products);
        Assert.Equal(new ScanField<string>("Amul Butter", "photo", false), draft.Name);
        Assert.Equal(new ScanField<string>("Amul", "photo", false), draft.Brand);
        Assert.Equal(new ScanField<string>("100 g", "photo", false), draft.Unit);
        Assert.Equal(new ScanField<decimal?>(58, "photo", false), draft.Mrp);
        // The shop's own spelling of the category is used, so no near-duplicate category is created.
        Assert.Equal("Milk & Dairy", draft.Category.Value);
        Assert.Equal(new ScanField<string>(null, null, false), draft.Barcode);
        Assert.Equal(3, result.RemainingToday);

        // A draft is not an item: nothing was added to the shop.
        Assert.Empty((await owner.GetFromJsonAsync<List<ItemDto>>($"/api/shops/{shop.Id}/items"))!);
        Assert.DoesNotContain("price", (await (await owner.PostAsync(scan, Upload(photo))).Content.ReadAsStringAsync()).ToLower().Replace("mrp", ""));
    }

    [Fact]
    public async Task Unclear_and_missing_fields_are_marked_for_review()
    {
        var (owner, _, scan) = await ShopAsync();
        var photo = app.Ai.Photo(Seen("Tata Sa1t", null, 28, null, "Staples", null, null, "name", "mrp"));

        var draft = Assert.Single((await Read<ScanResultDto>(await owner.PostAsync(scan, Upload(photo)))).Products);

        Assert.True(draft.Name.NeedsReview);
        Assert.True(draft.Mrp.NeedsReview);
        Assert.Equal(new ScanField<string>(null, null, true), draft.Unit);   // the shop must fill this in
        Assert.False(draft.Category.NeedsReview);
    }

    [Fact]
    public async Task A_thin_public_database_entry_does_not_replace_a_clear_reading_from_the_photo()
    {
        var (owner, _, scan) = await ShopAsync();
        var barcode = NewBarcode();
        // What the real database returned for a real biscuit pack: the brand as the "name", and no pack size.
        app.Ai.BarcodeDatabase[barcode] = new FoundProduct("britannia", "Britannia", null, null, null, null);
        var photo = app.Ai.Photo(Seen("Marie Gold", "250 g", 35, barcode, "Snacks", "Britannia"));

        var draft = Assert.Single((await Read<ScanResultDto>(await owner.PostAsync(scan, Upload(photo)))).Products);

        Assert.Equal(new ScanField<string>("Marie Gold", "photo", false), draft.Name);
        Assert.Equal(new ScanField<string>("Britannia", "photo", false), draft.Brand);
        Assert.Equal(new ScanField<string>("250 g", "photo", false), draft.Unit);

        // And a public entry is not copied into the shared catalog: only what shop owners save goes there.
        var (other, _, otherScan) = await ShopAsync();
        app.Ai.BarcodeDatabase.TryRemove(barcode, out _);
        var again = Assert.Single((await Read<ScanResultDto>(await other.PostAsync(otherScan, Upload(app.Ai.Photo(Seen("unclear", null, null, barcode, null, null, null, "name")))))).Products);
        Assert.Equal("photo", again.Name.Source);
    }

    [Fact]
    public async Task A_barcode_match_settles_what_the_photo_was_unsure_about()
    {
        var (owner, _, scan) = await ShopAsync();
        var barcode = NewBarcode();
        app.Ai.BarcodeDatabase[barcode] = new FoundProduct("Parle-G Gold Biscuits", "Parle", "1 kg", null, null, null);
        var photo = app.Ai.Photo(Seen("Par1e G Go1d", "1 k9", 120, barcode, "Snacks", null, null, "name", "unit"));

        var draft = Assert.Single((await Read<ScanResultDto>(await owner.PostAsync(scan, Upload(photo)))).Products);

        Assert.Equal(new ScanField<string>("Parle-G Gold Biscuits", "barcode", false), draft.Name);
        Assert.Equal(new ScanField<string>("Parle", "barcode", false), draft.Brand);
        Assert.Equal(new ScanField<string>("1 kg", "barcode", false), draft.Unit);
        Assert.Equal(new ScanField<string>(barcode, "photo", false), draft.Barcode);
        Assert.Equal(new ScanField<decimal?>(120, "photo", false), draft.Mrp);   // the database has no price; the pack does
        Assert.DoesNotContain(app.Ai.WebQueries, q => q.Contains("Par1e"));       // no guessing when there is an exact match
    }

    [Fact]
    public async Task A_misread_barcode_is_dropped_instead_of_matching_the_wrong_product()
    {
        var (owner, _, scan) = await ShopAsync();
        var real = NewBarcode();
        var misread = real[..^1] + (real[^1] == '0' ? '1' : '0');   // last digit wrong: checksum fails
        app.Ai.BarcodeDatabase[misread] = new FoundProduct("Completely Different Product", null, null, null, null, null);
        var photo = app.Ai.Photo(Seen("Real Product", barcode: misread));

        var draft = Assert.Single((await Read<ScanResultDto>(await owner.PostAsync(scan, Upload(photo)))).Products);

        Assert.Equal("Real Product", draft.Name.Value);
        Assert.Equal(new ScanField<string>(null, null, true), draft.Barcode);
    }

    [Fact]
    public async Task What_one_shop_saves_is_offered_to_the_next_shop_from_the_shared_catalog()
    {
        var (first, firstShop, _) = await ShopAsync();
        var (second, _, secondScan) = await ShopAsync();
        var barcode = NewBarcode();
        await Read<ItemDto>(await first.PostAsJsonAsync($"/api/shops/{firstShop.Id}/items",
            new ItemRequest("Fortune Sunflower Oil", "Refined oil", null, 148, 165, "1 litre", barcode, NewCategoryName: "Cooking Oil")));
        var photo = app.Ai.Photo(Seen("some oil?", null, null, barcode, null, null, null, "name"));

        var draft = Assert.Single((await Read<ScanResultDto>(await second.PostAsync(secondScan, Upload(photo)))).Products);

        Assert.Equal(new ScanField<string>("Fortune Sunflower Oil", "catalog", false), draft.Name);
        Assert.Equal(new ScanField<string>("1 litre", "catalog", false), draft.Unit);
        Assert.Equal(new ScanField<string>("Cooking Oil", "catalog", false), draft.Category);
        Assert.Equal(new ScanField<string>("Refined oil", "catalog", false), draft.Description);
        // The printed MRP is shared, but as something to check; the first shop's selling price (148) is never shared.
        Assert.Equal(new ScanField<decimal?>(165, "catalog", true), draft.Mrp);
        Assert.DoesNotContain("148", JsonSerializer.Serialize(draft));
    }

    [Fact]
    public async Task Web_search_is_only_a_last_resort_and_always_needs_review()
    {
        var (owner, _, scan) = await ShopAsync();
        var marker = $"blurry{Guid.NewGuid():N}";
        app.Ai.Web[marker] = new FoundProduct("Everest Garam Masala", "Everest", "100 g", null, null, "Spice blend");
        var photo = app.Ai.Photo(
            Seen($"{marker} masala", null, null, null, "Spices", null, null, "name"),   // unclear, no barcode: web search
            Seen("Clear Product", "1 kg"));                                              // clear: no web search

        var drafts = (await Read<ScanResultDto>(await owner.PostAsync(scan, Upload(photo)))).Products;

        Assert.Equal(new ScanField<string>("Everest Garam Masala", "web", true), drafts[0].Name);
        Assert.Equal(new ScanField<string>("100 g", "web", true), drafts[0].Unit);
        Assert.Equal(new ScanField<string>("Everest", "web", true), drafts[0].Brand);
        Assert.Null(drafts[0].Mrp.Value);
        Assert.Equal(new ScanField<string>("Clear Product", "photo", false), drafts[1].Name);
        Assert.DoesNotContain(app.Ai.WebQueries, q => q.Contains("Clear Product"));
    }

    [Fact]
    public async Task A_shelf_photo_gives_several_drafts_and_an_empty_photo_gives_none()
    {
        var (owner, _, scan) = await ShopAsync();
        var shelf = app.Ai.Photo(Seen("Soap"), Seen("Shampoo"), Seen("Toothpaste"), Seen(null, barcode: null));   // the last one is unusable

        Assert.Equal(["Soap", "Shampoo", "Toothpaste"],
            (await Read<ScanResultDto>(await owner.PostAsync(scan, Upload(shelf)))).Products.Select(p => p.Name.Value));
        Assert.Empty((await Read<ScanResultDto>(await owner.PostAsync(scan, Upload(app.Ai.Photo())))).Products);
    }

    [Fact]
    public async Task Scans_are_limited_per_shop_per_day_and_a_failed_scan_is_not_counted()
    {
        var (owner, shop, scan) = await ShopAsync();
        var photo = app.Ai.Photo(Seen("Tea"));
        Assert.Equal(new ScanStatusDto(true, 4, 4), await owner.GetFromJsonAsync<ScanStatusDto>($"{scan}/status"));

        var failed = await owner.PostAsync(scan, Upload(app.Ai.BrokenPhoto()));
        Assert.Equal(HttpStatusCode.ServiceUnavailable, failed.StatusCode);
        Assert.Equal("ai_busy", await ErrorCode(failed));
        Assert.Equal(4, (await owner.GetFromJsonAsync<ScanStatusDto>($"{scan}/status"))!.RemainingToday);

        for (var remaining = 3; remaining >= 0; remaining--)
            Assert.Equal(remaining, (await Read<ScanResultDto>(await owner.PostAsync(scan, Upload(photo)))).RemainingToday);

        var over = await owner.PostAsync(scan, Upload(photo));
        Assert.Equal(HttpStatusCode.TooManyRequests, over.StatusCode);
        Assert.Equal("scan_limit", await ErrorCode(over));

        // Another shop has its own allowance.
        var (_, _, otherScan) = await ShopAsync();
        Assert.NotEqual(scan, otherScan);
        Assert.NotEqual(Guid.Empty, shop.Id);
    }

    [Fact]
    public async Task Many_scans_at_once_cannot_slip_past_the_limit()
    {
        var (owner, _, scan) = await ShopAsync();
        var photo = app.Ai.Photo(Seen("Tea"));

        var responses = await Task.WhenAll(Enumerable.Range(0, 12).Select(_ => owner.PostAsync(scan, Upload(photo))));

        // The limit is 4. A few extra can start in the same instant, but never anything like all twelve.
        Assert.InRange(responses.Count(r => r.StatusCode == HttpStatusCode.OK), 1, 8);
        Assert.Contains(responses, r => r.StatusCode == HttpStatusCode.TooManyRequests);
    }

    [Fact]
    public async Task Only_real_pictures_from_members_of_an_active_shop_are_scanned()
    {
        var (owner, shop, scan) = await ShopAsync();
        var (stranger, _, _, _) = await app.SignedInOwnerAsync();
        var (customer, _, _, _) = await app.SignedInUserAsync();
        var photo = app.Ai.Photo(Seen("Tea"));

        Assert.Equal("invalid_image", await ErrorCode(await owner.PostAsync(scan, Upload("not a picture"u8.ToArray()))));
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PostAsync(scan, new MultipartFormDataContent())).StatusCode);   // no file at all
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PostAsync(scan, Upload(photo))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await customer.GetAsync($"{scan}/status")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await app.CreateClient().PostAsync(scan, Upload(photo))).StatusCode);
        Assert.Equal(4, (await owner.GetFromJsonAsync<ScanStatusDto>($"{scan}/status"))!.RemainingToday);   // none of that used a scan

        await (await app.AdminClientAsync()).PostAsync($"/api/admin/shops/{shop.Id}/deactivate", null);
        Assert.Equal("shop_deactivated", await ErrorCode(await owner.PostAsync(scan, Upload(photo))));
    }

    [Fact]
    public async Task Without_a_key_scanning_is_off_and_says_so()
    {
        var (owner, shop, scan) = await ShopAsync();
        var token = owner.DefaultRequestHeaders.Authorization;
        var noKey = app.WithWebHostBuilder(b => b.UseSetting("Ai:OpenAiApiKey", "")).CreateClient();
        noKey.DefaultRequestHeaders.Authorization = token;

        Assert.False((await noKey.GetFromJsonAsync<ScanStatusDto>($"{scan}/status"))!.Enabled);
        var response = await noKey.PostAsync(scan, Upload(app.Ai.Photo(Seen("Tea"))));
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal("ai_not_configured", await ErrorCode(response));
        Assert.NotEqual(Guid.Empty, shop.Id);
    }

    // ---------- The pieces that talk to outside services, with the network replaced

    private class StubHandler(Func<HttpRequestMessage, string, HttpResponseMessage> respond) : HttpMessageHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
            respond(request, request.Content is null ? "" : await request.Content.ReadAsStringAsync(ct));
    }

    private static HttpResponseMessage Json(HttpStatusCode status, string body) =>
        new(status) { Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json") };

    private static OpenAiProductVision Vision(Func<HttpRequestMessage, string, HttpResponseMessage> respond) => new(
        new HttpClient(new StubHandler(respond)) { BaseAddress = new Uri("https://api.openai.com/") },
        Options.Create(new AiOptions { OpenAiApiKey = "sk-test", Model = "test-model" }),
        NullLogger<OpenAiProductVision>.Instance);

    [Fact]
    public async Task The_vision_request_sends_the_photo_and_a_strict_schema_and_reads_the_answer()
    {
        HttpRequestMessage? sent = null;
        JsonNode? body = null;
        var answer = new JsonObject
        {
            ["products"] = new JsonArray(new JsonObject
            {
                ["name"] = "Amul Butter", ["brand"] = "Amul", ["unit"] = "100 g", ["mrp"] = 58, ["barcode"] = " 8901262010016 ",
                ["category"] = "Dairy", ["description"] = null, ["uncertain"] = new JsonArray("mrp"),
            }),
        };
        var vision = Vision((request, text) =>
        {
            sent = request;
            body = JsonNode.Parse(text);
            return Json(HttpStatusCode.OK, new JsonObject
            {
                ["choices"] = new JsonArray(new JsonObject { ["message"] = new JsonObject { ["content"] = answer.ToJsonString() } }),
            }.ToJsonString());
        });

        var products = await vision.ReadAsync([1, 2, 3], "image/jpeg", ["Dairy", "Snacks"], CancellationToken.None);

        Assert.Equal("https://api.openai.com/v1/chat/completions", sent!.RequestUri!.ToString());
        Assert.Equal("Bearer sk-test", sent.Headers.Authorization!.ToString());
        Assert.Equal("test-model", body!["model"]!.GetValue<string>());
        var user = body["messages"]![1]!["content"]!.AsArray();
        Assert.Contains("Dairy, Snacks", user[0]!["text"]!.GetValue<string>());
        Assert.Equal("data:image/jpeg;base64,AQID", user[1]!["image_url"]!["url"]!.GetValue<string>());
        var schema = body["response_format"]!["json_schema"]!;
        Assert.True(schema["strict"]!.GetValue<bool>());
        var item = schema["schema"]!["properties"]!["products"]!["items"]!;
        Assert.DoesNotContain("price", item["properties"]!.AsObject().Select(p => p.Key));   // the model is never asked for a selling price
        Assert.Equal(8, item["required"]!.AsArray().Count);

        var product = Assert.Single(products);
        Assert.Equal(("Amul Butter", "Amul", "100 g", 58m, "8901262010016", "Dairy", null),
            (product.Name, product.Brand, product.Unit, product.Mrp, product.Barcode, product.Category, product.Description));
        Assert.Equal(["mrp"], product.Uncertain);
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized, "ai_not_configured")]
    [InlineData(HttpStatusCode.TooManyRequests, "ai_busy")]
    [InlineData(HttpStatusCode.InternalServerError, "ai_unavailable")]
    public async Task Vision_errors_become_messages_the_shop_can_understand(HttpStatusCode status, string code)
    {
        var vision = Vision((_, _) => Json(status, """{"error":{"message":"nope"}}"""));
        var error = await Assert.ThrowsAsync<AiUnavailableException>(() => vision.ReadAsync([1], "image/png", [], CancellationToken.None));
        Assert.Equal(code, error.Code);
    }

    [Fact]
    public async Task A_garbled_or_refused_vision_answer_does_not_crash()
    {
        var garbled = Vision((_, _) => Json(HttpStatusCode.OK, """{"choices":[{"message":{"content":"this is not json"}}]}"""));
        Assert.Equal("ai_unavailable", (await Assert.ThrowsAsync<AiUnavailableException>(() => garbled.ReadAsync([1], "image/png", [], CancellationToken.None))).Code);

        var refused = Vision((_, _) => Json(HttpStatusCode.OK, """{"choices":[{"message":{"content":null,"refusal":"I cannot help with that."}}]}"""));
        Assert.Empty(await refused.ReadAsync([1], "image/png", [], CancellationToken.None));

        var offline = Vision((_, _) => throw new HttpRequestException("no network"));
        Assert.Equal("ai_unavailable", (await Assert.ThrowsAsync<AiUnavailableException>(() => offline.ReadAsync([1], "image/png", [], CancellationToken.None))).Code);
    }

    [Fact]
    public async Task Barcode_database_answers_are_read_and_failures_are_ignored()
    {
        OpenFoodFactsLookup Lookup(Func<HttpRequestMessage, string, HttpResponseMessage> respond) => new(
            new HttpClient(new StubHandler(respond)) { BaseAddress = new Uri("https://world.openfoodfacts.org/") },
            NullLogger<OpenFoodFactsLookup>.Instance);

        string? url = null;
        var found = await Lookup((request, _) =>
        {
            url = request.RequestUri!.ToString();
            return Json(HttpStatusCode.OK, """{"status":1,"product":{"product_name":" Marie Gold ","brands":"Britannia, Other","quantity":"250 g"}}""");
        }).FindAsync("8901063092730", CancellationToken.None);
        Assert.Equal("https://world.openfoodfacts.org/api/v2/product/8901063092730.json?fields=product_name,brands,quantity", url);
        Assert.Equal(new FoundProduct("Marie Gold", "Britannia", "250 g", null, null, null), found);

        Assert.Null(await Lookup((_, _) => Json(HttpStatusCode.OK, """{"status":0,"status_verbose":"product not found"}""")).FindAsync("1", CancellationToken.None));
        Assert.Null(await Lookup((_, _) => Json(HttpStatusCode.OK, """{"status":1,"product":{"product_name":""}}""")).FindAsync("1", CancellationToken.None));
        Assert.Null(await Lookup((_, _) => Json(HttpStatusCode.InternalServerError, "oops")).FindAsync("1", CancellationToken.None));
        Assert.Null(await Lookup((_, _) => Json(HttpStatusCode.OK, "<html>not json</html>")).FindAsync("1", CancellationToken.None));
        Assert.Null(await Lookup((_, _) => throw new HttpRequestException("offline")).FindAsync("1", CancellationToken.None));
    }

    [Theory]
    [InlineData("8901262010016", "8901262010016")]     // EAN-13
    [InlineData("8901 2620 10016", "8901262010016")]   // spaces as printed
    [InlineData("036000291452", "036000291452")]       // UPC-A
    [InlineData("96385074", "96385074")]               // EAN-8
    [InlineData("8901262010017", null)]                // wrong check digit
    [InlineData("89012620100", null)]                  // wrong length
    [InlineData("890126201001X", null)]                // not digits
    [InlineData("", null)]
    [InlineData(null, null)]
    public void Barcodes_are_accepted_only_when_their_check_digit_is_right(string? text, string? expected) =>
        Assert.Equal(expected, Barcodes.Normalize(text));
}
