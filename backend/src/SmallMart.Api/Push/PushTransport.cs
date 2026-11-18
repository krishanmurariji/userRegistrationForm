using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Google.Apis.Auth.OAuth2;

namespace SmallMart.Api.Push;

public enum PushResult { Sent, Unregistered, Failed }

/// <summary>Delivers one data message to one device.</summary>
public interface IPushTransport
{
    /// <summary>False when no Firebase service account is configured; nothing is sent then.</summary>
    bool IsConfigured { get; }
    Task<PushResult> SendAsync(string deviceToken, IReadOnlyDictionary<string, string> data, CancellationToken ct);
}

/// <summary>
/// Firebase Cloud Messaging (HTTP v1). Configure <c>Push:FirebaseServiceAccountJson</c> with the service account key from
/// Firebase console → Project settings → Service accounts. Messages are data-only and high priority, so the Android app
/// builds the notification itself, with Accept and Decline buttons.
/// </summary>
public class FcmTransport(HttpClient http, IConfiguration config, ILogger<FcmTransport> logger) : IPushTransport
{
    private readonly Lazy<(GoogleCredential? Credential, string? ProjectId)> _account = new(() =>
    {
        var json = config["Push:FirebaseServiceAccountJson"];
        if (string.IsNullOrWhiteSpace(json))
            return (null, null);
        try
        {
            var projectId = JsonDocument.Parse(json).RootElement.GetProperty("project_id").GetString();
#pragma warning disable CS0618 // FromJson is fine here: the JSON comes from our own configuration, not from users.
            var credential = GoogleCredential.FromJson(json).CreateScoped("https://www.googleapis.com/auth/firebase.messaging");
#pragma warning restore CS0618
            return (credential, projectId);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Push:FirebaseServiceAccountJson is not a valid service account key; push notifications are off.");
            return (null, null);
        }
    });

    public bool IsConfigured => _account.Value.Credential is not null;

    public async Task<PushResult> SendAsync(string deviceToken, IReadOnlyDictionary<string, string> data, CancellationToken ct)
    {
        var (credential, projectId) = _account.Value;
        if (credential is null)
            return PushResult.Failed;

        var token = await ((ITokenAccess)credential).GetAccessTokenForRequestAsync(cancellationToken: ct);
        using var request = new HttpRequestMessage(HttpMethod.Post, $"https://fcm.googleapis.com/v1/projects/{projectId}/messages:send")
        {
            Content = JsonContent.Create(new
            {
                message = new
                {
                    token = deviceToken,
                    data,
                    android = new { priority = "high", ttl = "3600s" },
                },
            }),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var response = await http.SendAsync(request, ct);
        if (response.IsSuccessStatusCode)
            return PushResult.Sent;

        var body = await response.Content.ReadAsStringAsync(ct);
        if (response.StatusCode == HttpStatusCode.NotFound || body.Contains("UNREGISTERED") || body.Contains("registration-token-not-registered"))
            return PushResult.Unregistered;
        logger.LogWarning("FCM send failed with {Status}: {Body}", (int)response.StatusCode, body.Length > 400 ? body[..400] : body);
        return PushResult.Failed;
    }
}
