using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmallMart.Api.Data;
using SmallMart.Api.Shops;

namespace SmallMart.Api.Tests;

/// <summary>Free hosts lose their disk on every restart, so pictures can be kept in the database instead.</summary>
[Collection("api")]
public class DatabaseStorageTests(TestApp app)
{
    private static byte[] Png() =>
        [.. Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="), .. Guid.NewGuid().ToByteArray()];

    [Fact]
    public async Task Pictures_are_saved_in_the_database_and_served_from_there()
    {
        using var factory = app.WithWebHostBuilder(b => b.UseSetting("Storage:Provider", "Database"));
        var (owner, _, _, _) = await app.SignedInOwnerAsync();
        // The owner above belongs to the disk-based app, so sign in again through the database-based one.
        var client = factory.CreateDefaultClient();
        client.DefaultRequestHeaders.Authorization = owner.DefaultRequestHeaders.Authorization;

        var shop = (await (await client.PostAsJsonAsync("/api/shops", new ShopRequest(
            $"Db Shop {Guid.NewGuid():N}"[..20], null, "9876543210", "12 Market Road", "Jaipur", "302001", null, 0, 0)))
            .Content.ReadFromJsonAsync<ShopDto>())!;

        var file = new ByteArrayContent(Png());
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        var upload = await client.PostAsync($"/api/shops/{shop.Id}/logo", new MultipartFormDataContent { { file, "file", "logo.png" } });
        Assert.True(upload.IsSuccessStatusCode, await upload.Content.ReadAsStringAsync());
        var logoUrl = (await upload.Content.ReadFromJsonAsync<ShopDto>())!.LogoUrl!;

        var served = await client.GetAsync(logoUrl);
        Assert.Equal(HttpStatusCode.OK, served.StatusCode);
        Assert.Equal("image/png", served.Content.Headers.ContentType!.MediaType);
        Assert.Equal("nosniff", served.Headers.GetValues("X-Content-Type-Options").Single());

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Assert.Equal(1, await db.StoredFiles.CountAsync(f => !f.IsPrivate && logoUrl.EndsWith(f.Path)));
        }

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/files/shops/missing.png")).StatusCode);
    }
}
