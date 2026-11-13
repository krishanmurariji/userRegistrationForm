using System.Collections.Concurrent;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SmallMart.Api.Ai;
using SmallMart.Api.Auth;
using SmallMart.Api.Data;
using SmallMart.Api.Domain;
using SmallMart.Api.Email;

namespace SmallMart.Api.Tests;

/// <summary>
/// Runs the real API against a throwaway PostgreSQL database. Email and Google/Microsoft token checks are faked.
/// Set SMALLMART_TEST_DB to point at a different PostgreSQL server (without a Database= part).
/// </summary>
public class TestApp : WebApplicationFactory<Program>
{
    public const string AdminEmail = "admin@test.local";
    public const string AdminPassword = "Admin12345";

    private readonly string _connectionString =
        (Environment.GetEnvironmentVariable("SMALLMART_TEST_DB") ?? "Host=localhost;Username=postgres;Password=postgres")
        + $";Database=smallmart_test_{Guid.NewGuid():N}";

    private readonly string _uploads = Path.Combine(Path.GetTempPath(), $"smallmart-test-{Guid.NewGuid():N}");

    public FakeEmailSender Emails { get; } = new();
    public FakeAi Ai { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:Default", _connectionString);
        builder.UseSetting("Database:MigrateOnStartup", "true");
        builder.UseSetting("Jwt:Key", "test-signing-key-0123456789-0123456789");
        builder.UseSetting("RateLimiting:AuthPermitsPerMinute", "100000");
        builder.UseSetting("Seed:AdminEmail", AdminEmail);
        builder.UseSetting("Seed:AdminPassword", AdminPassword);
        builder.UseSetting("App:ClientUrl", "https://app.test");
        builder.UseSetting("Storage:Root", _uploads);
        builder.UseSetting("Ai:OpenAiApiKey", "test-key");
        builder.UseSetting("Ai:DailyScansPerShop", "4");
        builder.UseSetting("Ai:WebSearchFallback", "true");

        builder.ConfigureServices(services =>
        {
            services.RemoveAll<IEmailSender>();
            services.AddSingleton<IEmailSender>(Emails);
            services.RemoveAll<IProductVision>();
            services.RemoveAll<IBarcodeLookup>();
            services.RemoveAll<IWebProductSearch>();
            services.AddSingleton<IProductVision>(Ai);
            services.AddSingleton<IBarcodeLookup>(Ai);
            services.AddSingleton<IWebProductSearch>(Ai);
            services.RemoveAll<IExternalTokenValidator>();
            services.AddSingleton<IExternalTokenValidator>(new FakeExternalValidator("google"));
            services.AddSingleton<IExternalTokenValidator>(new FakeExternalValidator("microsoft"));
        });
    }

    public override async ValueTask DisposeAsync()
    {
        using (var scope = Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.EnsureDeletedAsync();
        await base.DisposeAsync();
        if (Directory.Exists(_uploads))
            Directory.Delete(_uploads, recursive: true);
        GC.SuppressFinalize(this);
    }

    public static string NewEmail() => $"user-{Guid.NewGuid():N}@test.local";

    /// <summary>Registers an account, confirms its email and signs in.</summary>
    public async Task<(HttpClient Client, AuthResponse Auth, string Email, string Password)> SignedInUserAsync()
    {
        var client = CreateClient();
        var email = NewEmail();
        const string password = "Passw0rd123";
        (await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(email, password, "Test User")))
            .EnsureSuccessStatusCode();
        (await client.PostAsJsonAsync("/api/auth/confirm-email", Emails.LinkFor(email))).EnsureSuccessStatusCode();
        var auth = await LoginAsync(client, email, password);
        return (client, auth, email, password);
    }

    /// <summary>A signed-in user the platform admin has made a shop owner.</summary>
    public async Task<(HttpClient Client, AuthResponse Auth, string Email, string Password)> SignedInOwnerAsync()
    {
        var (client, _, email, password) = await SignedInUserAsync();
        using (var scope = Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            await users.AddToRoleAsync((await users.FindByEmailAsync(email))!, Roles.ShopOwner);
        }
        var auth = await LoginAsync(client, email, password); // new token that carries the role
        return (client, auth, email, password);
    }

    public async Task<HttpClient> AdminClientAsync()
    {
        var client = CreateClient();
        await LoginAsync(client, AdminEmail, AdminPassword);
        return client;
    }

    public static async Task<AuthResponse> LoginAsync(HttpClient client, string email, string password)
    {
        var response = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, password));
        response.EnsureSuccessStatusCode();
        var auth = (await response.Content.ReadFromJsonAsync<AuthResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return auth;
    }
}

public partial class FakeEmailSender : IEmailSender
{
    private readonly ConcurrentQueue<(string To, string Subject, string Body)> _sent = new();

    public Task SendAsync(string toEmail, string subject, string htmlBody, CancellationToken ct = default)
    {
        _sent.Enqueue((toEmail, subject, htmlBody));
        return Task.CompletedTask;
    }

    public int CountFor(string email) => _sent.Count(m => m.To == email);

    /// <summary>Reads the user id and token out of the most recent link emailed to this address.</summary>
    public ConfirmEmailRequest LinkFor(string email)
    {
        var body = System.Net.WebUtility.HtmlDecode(_sent.Last(m => m.To == email).Body);
        var match = LinkPattern().Match(body);
        Assert.True(match.Success, "No link found in the email.");
        return new ConfirmEmailRequest(Guid.Parse(match.Groups[1].Value), match.Groups[2].Value);
    }

    [GeneratedRegex(@"userId=([0-9a-f-]+)&token=([A-Za-z0-9_-]+)")]
    private static partial Regex LinkPattern();
}

/// <summary>
/// Stands in for the vision model, the barcode database and the web search. A test says what a photo "shows"
/// by keying on the photo's bytes, so tests running side by side do not disturb each other.
/// </summary>
public class FakeAi : IProductVision, IBarcodeLookup, IWebProductSearch
{
    private readonly ConcurrentDictionary<string, Func<IReadOnlyList<string>, IReadOnlyList<SeenProduct>>> _photos = new();
    public ConcurrentDictionary<string, FoundProduct> BarcodeDatabase { get; } = new();
    public ConcurrentDictionary<string, FoundProduct> Web { get; } = new();
    public ConcurrentQueue<string> WebQueries { get; } = new();

    private static string Key(byte[] image) => Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(image));

    /// <summary>Makes a unique "photo" that the fake model will read as the given products.</summary>
    public byte[] Photo(params SeenProduct[] products) => Photo(_ => products);

    public byte[] Photo(Func<IReadOnlyList<string>, IReadOnlyList<SeenProduct>> read)
    {
        // A real PNG header followed by unique bytes.
        byte[] image = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, .. Guid.NewGuid().ToByteArray()];
        _photos[Key(image)] = read;
        return image;
    }

    public byte[] BrokenPhoto()
    {
        byte[] image = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, .. Guid.NewGuid().ToByteArray()];
        _photos[Key(image)] = _ => throw new AiUnavailableException("ai_busy", "The AI service is busy or out of quota. Please try again later.");
        return image;
    }

    Task<IReadOnlyList<SeenProduct>> IProductVision.ReadAsync(byte[] image, string contentType, IReadOnlyList<string> categories, CancellationToken ct) =>
        Task.FromResult(_photos.TryGetValue(Key(image), out var read) ? read(categories) : []);

    Task<FoundProduct?> IBarcodeLookup.FindAsync(string barcode, CancellationToken ct) =>
        Task.FromResult(BarcodeDatabase.GetValueOrDefault(barcode));

    Task<FoundProduct?> IWebProductSearch.FindAsync(string description, CancellationToken ct)
    {
        WebQueries.Enqueue(description);
        return Task.FromResult(Web.FirstOrDefault(pair => description.Contains(pair.Key)).Value);
    }
}

/// <summary>Accepts tokens shaped like "subject|email|verified|name"; anything else is rejected.</summary>
public class FakeExternalValidator(string provider) : IExternalTokenValidator
{
    public string Provider => provider;

    public Task<ExternalIdentity?> ValidateAsync(string idToken, CancellationToken ct = default)
    {
        var parts = idToken.Split('|');
        return Task.FromResult(parts.Length == 4
            ? new ExternalIdentity(parts[0], parts[1].Length == 0 ? null : parts[1], bool.Parse(parts[2]), parts[3])
            : null);
    }
}

[CollectionDefinition("api")]
public class ApiCollection : ICollectionFixture<TestApp>;
