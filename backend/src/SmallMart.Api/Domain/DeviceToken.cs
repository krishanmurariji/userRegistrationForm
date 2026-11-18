namespace SmallMart.Api.Domain;

/// <summary>A phone that receives push notifications for a signed-in user (a Firebase Cloud Messaging token).</summary>
public class DeviceToken
{
    public long Id { get; set; }
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;
    public string Token { get; set; } = string.Empty;
    /// <summary>"android" for now.</summary>
    public string Platform { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset LastSeenAt { get; set; }
}
