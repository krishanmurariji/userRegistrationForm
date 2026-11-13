using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;

namespace SmallMart.Api.Ai;

/// <summary>Reads product details from a photo with an OpenAI vision model, as strict JSON.</summary>
public class OpenAiProductVision(HttpClient http, IOptions<AiOptions> options, ILogger<OpenAiProductVision> logger) : IProductVision
{
    private const string Instructions = """
        You read product photos for a small grocery shop in India. The photo may show one product or a shelf with several.
        Return every distinct product you can identify, at most 12.

        For each product:
        - name: the product name as a customer would search for it, including the brand and variant, without the pack size.
        - brand: the brand, or null.
        - unit: the pack size exactly as printed, for example "500 g", "1 kg", "1 litre", "6 pieces". Null if not visible.
        - mrp: the printed maximum retail price in rupees as a number. Only when you can read it on the pack. Never guess a price. Null otherwise.
        - barcode: the digits printed under the barcode. Only when every digit is clearly readable. Null otherwise.
        - category: the best fitting name from the shop's existing categories if one fits, otherwise a short general grocery category such as "Dairy" or "Snacks".
        - description: one short factual sentence from what is printed on the pack, or null.
        - uncertain: the names of the fields above that you are not sure about.

        Report only what is visible. If a field is unclear, give your best reading and list it in "uncertain", or use null.
        If the photo shows no products, return an empty list.
        """;

    public async Task<IReadOnlyList<SeenProduct>> ReadAsync(byte[] image, string contentType, IReadOnlyList<string> categories, CancellationToken ct)
    {
        var body = new JsonObject
        {
            ["model"] = options.Value.Model,
            ["messages"] = new JsonArray(
                new JsonObject { ["role"] = "system", ["content"] = Instructions },
                new JsonObject
                {
                    ["role"] = "user",
                    ["content"] = new JsonArray(
                        new JsonObject
                        {
                            ["type"] = "text",
                            ["text"] = "The shop's existing categories: " + (categories.Count > 0 ? string.Join(", ", categories) : "none yet") + ".",
                        },
                        new JsonObject
                        {
                            ["type"] = "image_url",
                            ["image_url"] = new JsonObject
                            {
                                ["url"] = $"data:{contentType};base64,{Convert.ToBase64String(image)}",
                                ["detail"] = "high",
                            },
                        }),
                }),
            ["response_format"] = new JsonObject
            {
                ["type"] = "json_schema",
                ["json_schema"] = new JsonObject { ["name"] = "products", ["strict"] = true, ["schema"] = Schema() },
            },
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, "v1/chat/completions") { Content = JsonContent.Create(body) };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.Value.OpenAiApiKey);

        HttpResponseMessage response;
        try
        {
            response = await http.SendAsync(request, ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException && !ct.IsCancellationRequested)
        {
            logger.LogError(ex, "Could not reach OpenAI.");
            throw new AiUnavailableException("ai_unavailable", "The AI service could not be reached. Please try again in a moment.");
        }

        using (response)
        {
            var text = await response.Content.ReadAsStringAsync(ct);
            if (!response.IsSuccessStatusCode)
            {
                // The body explains the problem (bad key, unknown model, quota); it never contains the key.
                logger.LogError("OpenAI answered {Status}: {Body}", (int)response.StatusCode, text.Length > 600 ? text[..600] : text);
                throw response.StatusCode switch
                {
                    HttpStatusCode.TooManyRequests => new AiUnavailableException("ai_busy", "The AI service is busy or out of quota. Please try again later."),
                    HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden => new AiUnavailableException("ai_not_configured", "The AI key is not valid. Ask the platform admin to check it."),
                    _ => new AiUnavailableException("ai_unavailable", "The AI service returned an error. Please try again."),
                };
            }

            try
            {
                var message = JsonNode.Parse(text)!["choices"]![0]!["message"]!;
                if (message["refusal"]?.GetValue<string>() is { Length: > 0 } refusal)
                {
                    logger.LogWarning("OpenAI declined to read a photo: {Refusal}", refusal);
                    return [];
                }
                var products = JsonNode.Parse(message["content"]!.GetValue<string>())!["products"]!.AsArray();
                return products.Select(p => new SeenProduct(
                    Text(p, "name"), Text(p, "brand"), Text(p, "unit"),
                    p!["mrp"] is JsonValue mrp && mrp.TryGetValue<decimal>(out var value) && value > 0 ? value : null,
                    Text(p, "barcode"), Text(p, "category"), Text(p, "description"),
                    p["uncertain"]?.AsArray().Select(u => u!.GetValue<string>()).ToList() ?? [])).ToList();
            }
            catch (Exception ex) when (ex is JsonException or InvalidOperationException or NullReferenceException or ArgumentOutOfRangeException)
            {
                logger.LogError(ex, "Could not understand OpenAI's answer.");
                throw new AiUnavailableException("ai_unavailable", "The AI service gave an answer that could not be read. Please try again.");
            }
        }
    }

    private static string? Text(JsonNode? product, string field) =>
        product?[field]?.GetValue<string>() is { } value && !string.IsNullOrWhiteSpace(value) ? value.Trim() : null;

    private static JsonObject Schema()
    {
        static JsonObject Nullable(string type) => new() { ["type"] = new JsonArray(type, "null") };
        string[] fields = ["name", "brand", "unit", "mrp", "barcode", "category", "description"];
        return new JsonObject
        {
            ["type"] = "object",
            ["additionalProperties"] = false,
            ["required"] = new JsonArray("products"),
            ["properties"] = new JsonObject
            {
                ["products"] = new JsonObject
                {
                    ["type"] = "array",
                    ["items"] = new JsonObject
                    {
                        ["type"] = "object",
                        ["additionalProperties"] = false,
                        ["required"] = new JsonArray([.. fields.Select(f => (JsonNode)f), "uncertain"]),
                        ["properties"] = new JsonObject
                        {
                            ["name"] = Nullable("string"),
                            ["brand"] = Nullable("string"),
                            ["unit"] = Nullable("string"),
                            ["mrp"] = Nullable("number"),
                            ["barcode"] = Nullable("string"),
                            ["category"] = Nullable("string"),
                            ["description"] = Nullable("string"),
                            ["uncertain"] = new JsonObject
                            {
                                ["type"] = "array",
                                ["items"] = new JsonObject { ["type"] = "string", ["enum"] = new JsonArray([.. fields.Select(f => (JsonNode)f)]) },
                            },
                        },
                    },
                },
            },
        };
    }
}
