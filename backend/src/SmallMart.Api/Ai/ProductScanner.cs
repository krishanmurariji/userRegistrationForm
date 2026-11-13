using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SmallMart.Api.Data;

namespace SmallMart.Api.Ai;

/// <summary>
/// Turns a product photo into draft items. Sources are trusted in this order:
/// the shared catalog and the barcode database (exact matches), then the photo, then a web search (a guess).
/// Every field says where it came from, and nothing here ever sets a selling price.
/// </summary>
public class ProductScanner(
    AppDbContext db, IProductVision vision, IBarcodeLookup barcodes, IWebProductSearch web,
    IOptions<AiOptions> options, TimeProvider clock)
{
    private const string Photo = "photo", Barcode = "barcode", Catalog = "catalog", Web = "web";

    public async Task<IReadOnlyList<ScanProductDto>> ScanAsync(Guid shopId, byte[] image, string contentType, CancellationToken ct)
    {
        var categories = await db.Categories.Where(c => c.ShopId == shopId).OrderBy(c => c.SortOrder).Select(c => c.Name).ToListAsync(ct);
        var seen = await vision.ReadAsync(image, contentType, categories, ct);

        var drafts = new List<ScanProductDto>();
        foreach (var product in seen.Where(p => p.Name is not null || p.Barcode is not null).Take(12))
            drafts.Add(await BuildAsync(product, categories, ct));
        return drafts;
    }

    private async Task<ScanProductDto> BuildAsync(SeenProduct seen, IReadOnlyList<string> shopCategories, CancellationToken ct)
    {
        bool Unsure(string field) => seen.Uncertain.Contains(field, StringComparer.OrdinalIgnoreCase);
        static ScanField<string> FromPhoto(string? value, bool unsure) => new(value, value is null ? null : Photo, value is null || unsure);

        var name = FromPhoto(seen.Name, Unsure("name"));
        var brand = FromPhoto(seen.Brand, Unsure("brand")) with { NeedsReview = seen.Brand is not null && Unsure("brand") };
        var unit = FromPhoto(seen.Unit, Unsure("unit"));
        var mrp = new ScanField<decimal?>(seen.Mrp, seen.Mrp is null ? null : Photo, seen.Mrp is not null && Unsure("mrp"));
        var category = FromPhoto(MatchCategory(seen.Category, shopCategories), Unsure("category"));
        var description = FromPhoto(seen.Description, false) with { NeedsReview = false };

        // A barcode that fails its checksum was misread: keep it out rather than attach the wrong product.
        var code = Barcodes.Normalize(seen.Barcode);
        var barcode = new ScanField<string>(code, code is null ? null : Photo, seen.Barcode is not null && (code is null || Unsure("barcode")));

        var matched = false;
        if (code is not null && options.Value.BarcodeLookup)
        {
            var saved = await db.CatalogProducts.AsNoTracking().SingleOrDefaultAsync(c => c.Barcode == code, ct);
            var (found, source) = saved is not null
                ? (new FoundProduct(saved.Name, saved.Brand, saved.Unit, saved.Mrp, saved.CategoryName, saved.Description), Catalog)
                : (await barcodes.FindAsync(code, ct), Barcode);

            if (found is not null)
            {
                matched = true;
                barcode = barcode with { NeedsReview = false };
                if (found.Name is not null) name = new(found.Name, source, false);
                if (found.Brand is not null) brand = new(found.Brand, source, false);
                if (found.Unit is not null) unit = new(found.Unit, source, false);
                if (found.Description is not null && description.Value is null) description = new(found.Description, source, false);
                if (found.Category is not null) category = new(MatchCategory(found.Category, shopCategories), source, false);
                // A price printed on the pack in the photo is newer than one saved earlier.
                if (found.Mrp is not null && (mrp.Value is null || mrp.NeedsReview)) mrp = new(found.Mrp, source, true);

                if (saved is null)
                    await RememberAsync(code, found, "openfoodfacts", ct);
            }
        }

        // Last resort, and only a guess: everything from the web is marked for review.
        if (!matched && options.Value.WebSearchFallback && (name.NeedsReview || unit.Value is null))
        {
            var known = string.Join(", ", new[] { seen.Name, seen.Brand, seen.Unit, seen.Description }.Where(v => v is not null));
            if (known.Length > 0 && await web.FindAsync(known, ct) is { } found)
            {
                if (found.Name is not null && name.NeedsReview) name = new(found.Name, Web, true);
                if (found.Brand is not null && brand.Value is null) brand = new(found.Brand, Web, true);
                if (found.Unit is not null && unit.Value is null) unit = new(found.Unit, Web, true);
                if (found.Description is not null && description.Value is null) description = new(found.Description, Web, true);
            }
        }

        return new ScanProductDto(name, brand, unit, mrp, barcode, category, description);
    }

    /// <summary>Saves or refreshes a product in the shared catalog. Failures are ignored: the catalog is a convenience.</summary>
    public async Task RememberAsync(string barcode, FoundProduct product, string source, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(product.Name))
            return;
        try
        {
            var entry = await db.CatalogProducts.SingleOrDefaultAsync(c => c.Barcode == barcode, ct);
            if (entry is null)
            {
                entry = new CatalogProduct { Barcode = barcode };
                db.CatalogProducts.Add(entry);
            }
            else if (entry.Source == "shop" && source != "shop")
            {
                return; // what a shop owner checked by hand beats a public database
            }
            entry.Name = Limit(product.Name, 150)!;
            entry.Brand = Limit(product.Brand, 100) ?? entry.Brand;
            entry.Unit = Limit(product.Unit, 30) ?? entry.Unit;
            entry.Mrp = product.Mrp ?? entry.Mrp;
            entry.CategoryName = Limit(product.Category, 80) ?? entry.CategoryName;
            entry.Description = Limit(product.Description, 2000) ?? entry.Description;
            entry.Source = source;
            entry.UpdatedAt = clock.GetUtcNow();
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            db.ChangeTracker.Clear(); // two shops saved the same barcode at once; one of them won
        }
    }

    /// <summary>Uses the shop's own spelling of a category when it has one with the same name.</summary>
    private static string? MatchCategory(string? suggested, IReadOnlyList<string> shopCategories)
    {
        if (string.IsNullOrWhiteSpace(suggested))
            return null;
        var match = shopCategories.FirstOrDefault(c => string.Equals(c, suggested.Trim(), StringComparison.OrdinalIgnoreCase));
        return Limit(match ?? suggested.Trim(), 80);
    }

    private static string? Limit(string? value, int max) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim().Length <= max ? value.Trim() : value.Trim()[..max];
}
