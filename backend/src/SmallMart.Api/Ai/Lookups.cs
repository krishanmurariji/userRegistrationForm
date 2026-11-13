using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;

namespace SmallMart.Api.Ai;

/// <summary>Looks a barcode up in Open Food Facts, a free public product database.</summary>
public class OpenFoodFactsLookup(HttpClient http, ILogger<OpenFoodFactsLookup> logger) : IBarcodeLookup
{
    public async Task<FoundProduct?> FindAsync(string barcode, CancellationToken ct)
    {
        try
        {
            using var response = await http.GetAsync($"api/v2/product/{barcode}.json?fields=product_name,brands,quantity", ct);
            if (!response.IsSuccessStatusCode)
                return null;
            var root = JsonNode.Parse(await response.Content.ReadAsStringAsync(ct));
            if (root?["status"]?.GetValue<int>() != 1 || root["product"] is not { } product)
                return null;

            static string? Clean(JsonNode? node) => node?.GetValue<string>() is { } s && !string.IsNullOrWhiteSpace(s) ? s.Trim() : null;
            var name = Clean(product["product_name"]);
            if (name is null)
                return null;
            // "brands" can list several, separated by commas; the first is the main one.
            var brand = Clean(product["brands"])?.Split(',')[0].Trim();
            return new FoundProduct(name, brand, Clean(product["quantity"]), null, null, null);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException or InvalidOperationException && !ct.IsCancellationRequested)
        {
            // A lookup that fails must never stop the scan: the photo's own reading is still there.
            logger.LogWarning(ex, "Barcode lookup failed for {Barcode}.", barcode);
            return null;
        }
    }
}

/// <summary>
/// Last resort for products the photo did not show clearly: asks an OpenAI model that can search the web.
/// Everything it returns is marked for review in the app.
/// </summary>
public class OpenAiWebProductSearch(HttpClient http, IOptions<AiOptions> options, ILogger<OpenAiWebProductSearch> logger) : IWebProductSearch
{
    public async Task<FoundProduct?> FindAsync(string description, CancellationToken ct)
    {
        var body = new JsonObject
        {
            ["model"] = options.Value.WebSearchModel,
            ["tools"] = new JsonArray(new JsonObject { ["type"] = "web_search" }),
            ["input"] =
                "Find this grocery product sold in India and report its details. What is known from a photo: " + description + "\n" +
                "Answer with only a JSON object with the keys name, brand, unit (pack size) and description (one short sentence). " +
                "Use null for anything you could not confirm from a search result. Do not include a price.",
        };
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, "v1/responses") { Content = JsonContent.Create(body) };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.Value.OpenAiApiKey);
            using var response = await http.SendAsync(request, ct);
            var text = await response.Content.ReadAsStringAsync(ct);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("Web search fallback answered {Status}: {Body}", (int)response.StatusCode, text.Length > 400 ? text[..400] : text);
                return null;
            }

            // The answer is the text of the last "message" item in the output list.
            var answer = JsonNode.Parse(text)?["output"]?.AsArray()
                .Where(item => item?["type"]?.GetValue<string>() == "message")
                .SelectMany(item => item!["content"]!.AsArray())
                .Select(part => part?["text"]?.GetValue<string>())
                .LastOrDefault(t => !string.IsNullOrWhiteSpace(t));
            if (answer is null)
                return null;
            var start = answer.IndexOf('{');
            var end = answer.LastIndexOf('}');
            if (start < 0 || end <= start)
                return null;
            var found = JsonNode.Parse(answer[start..(end + 1)]);

            string? Clean(string key) => found?[key] is JsonValue v && v.TryGetValue<string>(out var s) && !string.IsNullOrWhiteSpace(s) ? s.Trim() : null;
            var name = Clean("name");
            return name is null ? null : new FoundProduct(name, Clean("brand"), Clean("unit"), null, null, Clean("description"));
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException or InvalidOperationException && !ct.IsCancellationRequested)
        {
            logger.LogWarning(ex, "Web search fallback failed.");
            return null;
        }
    }
}
