using SmallMart.Api.Domain;

namespace SmallMart.Api.Ai;

public class AiOptions
{
    public const string Section = "Ai";

    /// <summary>OpenAI API key. Keep it in appsettings.Local.json or an environment variable, never in a committed file.</summary>
    public string OpenAiApiKey { get; set; } = string.Empty;
    /// <summary>A model that accepts images and structured output.</summary>
    public string Model { get; set; } = "gpt-4o-mini";
    /// <summary>How many photos one shop may scan in 24 hours.</summary>
    public int DailyScansPerShop { get; set; } = 30;
    /// <summary>Look products up by barcode in the shared catalog and Open Food Facts before trusting the photo.</summary>
    public bool BarcodeLookup { get; set; } = true;
    /// <summary>Last resort: ask a model with web search when the photo is unclear and no barcode matched.</summary>
    public bool WebSearchFallback { get; set; }
    public string WebSearchModel { get; set; } = "gpt-4o-mini";

    public bool Enabled => !string.IsNullOrWhiteSpace(OpenAiApiKey);
}

/// <summary>A product every shop can reuse, keyed by its barcode. Filled from items shops save and from barcode lookups.</summary>
public class CatalogProduct
{
    public string Barcode { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Brand { get; set; }
    public string? Unit { get; set; }
    public decimal? Mrp { get; set; }
    public string? CategoryName { get; set; }
    public string? Description { get; set; }
    /// <summary>"shop" when a shop owner saved it, "openfoodfacts" when it came from the public database.</summary>
    public string Source { get; set; } = "shop";
    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>One photo sent to the AI, kept to enforce the daily limit and to see usage.</summary>
public class AiScan
{
    public long Id { get; set; }
    public Guid ShopId { get; set; }
    public Guid UserId { get; set; }
    public DateTimeOffset At { get; set; }
    public int ProductCount { get; set; }
    public bool Succeeded { get; set; }
}

/// <summary>What the vision model read from a photo, before anything is checked against other sources.</summary>
/// <param name="Uncertain">Names of the fields the model was not sure about.</param>
public record SeenProduct(
    string? Name, string? Brand, string? Unit, decimal? Mrp, string? Barcode, string? Category, string? Description,
    IReadOnlyList<string> Uncertain);

/// <summary>Details found for a product from somewhere other than the photo.</summary>
public record FoundProduct(string? Name, string? Brand, string? Unit, decimal? Mrp, string? Category, string? Description);

public interface IProductVision
{
    /// <summary>Reads every distinct product visible in the photo. <paramref name="categories"/> are the shop's own category names.</summary>
    Task<IReadOnlyList<SeenProduct>> ReadAsync(byte[] image, string contentType, IReadOnlyList<string> categories, CancellationToken ct);
}

public interface IBarcodeLookup
{
    Task<FoundProduct?> FindAsync(string barcode, CancellationToken ct);
}

public interface IWebProductSearch
{
    /// <summary>Searches the web for a product the photo did not show clearly. Null when nothing reliable was found.</summary>
    Task<FoundProduct?> FindAsync(string description, CancellationToken ct);
}

/// <summary>Raised when the AI service cannot be used right now; <see cref="Code"/> is sent to the app.</summary>
public class AiUnavailableException(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}

// ----- What the app receives -----

/// <summary>One pre-filled value and where it came from, so the shop owner knows what to double-check.</summary>
/// <param name="Source">"photo", "barcode" (public product database), "catalog" (saved by a shop before), "web", or null when empty.</param>
/// <param name="NeedsReview">True when the value is a guess or could not be confirmed.</param>
public record ScanField<T>(T? Value, string? Source, bool NeedsReview);

/// <summary>A draft item. There is deliberately no selling price: only the shop owner sets that.</summary>
public record ScanProductDto(
    ScanField<string> Name, ScanField<string> Brand, ScanField<string> Unit, ScanField<decimal?> Mrp,
    ScanField<string> Barcode, ScanField<string> Category, ScanField<string> Description);

public record ScanResultDto(IReadOnlyList<ScanProductDto> Products, int RemainingToday);

public record ScanStatusDto(bool Enabled, int RemainingToday, int DailyLimit);
