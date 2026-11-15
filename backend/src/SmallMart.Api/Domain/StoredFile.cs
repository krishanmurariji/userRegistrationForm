namespace SmallMart.Api.Domain;

/// <summary>A picture kept in the database (used when <c>Storage:Provider</c> is "Database").</summary>
public class StoredFile
{
    /// <summary>Relative path, for example <c>shops/abc/items/def.jpg</c>.</summary>
    public string Path { get; set; } = "";
    public bool IsPrivate { get; set; }
    public string ContentType { get; set; } = "image/jpeg";
    public byte[] Content { get; set; } = [];
    public DateTimeOffset CreatedAt { get; set; }
}
