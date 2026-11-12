namespace SmallMart.Api.Storage;

/// <summary>
/// Stores uploaded pictures on local disk and serves them under <c>/files</c>.
/// Set <c>Storage:Root</c> to a persistent folder in production; swap this class for blob storage later.
/// </summary>
public class ImageStorage(IConfiguration config, IWebHostEnvironment env)
{
    public const string RequestPath = "/files";
    public const long MaxBytes = 5 * 1024 * 1024;

    public string Root { get; } = Path.GetFullPath(
        config["Storage:Root"] is { Length: > 0 } root ? root : Path.Combine(env.ContentRootPath, "App_Data", "uploads"));

    /// <summary>Public URL path for a stored picture, or null when there is none.</summary>
    public static string? Url(string? relativePath) => relativePath is null ? null : $"{RequestPath}/{relativePath}";

    /// <summary>
    /// Saves a JPEG, PNG or WebP picture under the given folder and returns its relative path.
    /// Returns null when the file is empty, too large or not one of those formats.
    /// The type is decided from the file's content, never from its name.
    /// </summary>
    public async Task<string?> SaveAsync(IFormFile file, string folder, CancellationToken ct)
    {
        if (file.Length is 0 or > MaxBytes)
            return null;

        await using var input = file.OpenReadStream();
        var header = new byte[12];
        var read = await input.ReadAtLeastAsync(header, header.Length, throwOnEndOfStream: false, ct);
        var extension = DetectExtension(header.AsSpan(0, read));
        if (extension is null)
            return null;

        var relative = $"{folder}/{Guid.NewGuid():N}{extension}";
        var fullPath = Path.Combine(Root, relative);
        Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);
        input.Position = 0;
        await using var output = File.Create(fullPath);
        await input.CopyToAsync(output, ct);
        return relative;
    }

    public void Delete(string? relativePath)
    {
        if (relativePath is null)
            return;
        var fullPath = Path.GetFullPath(Path.Combine(Root, relativePath));
        if (fullPath.StartsWith(Root + Path.DirectorySeparatorChar, StringComparison.Ordinal) && File.Exists(fullPath))
            File.Delete(fullPath);
    }

    private static string? DetectExtension(ReadOnlySpan<byte> h)
    {
        if (h.Length >= 3 && h[0] == 0xFF && h[1] == 0xD8 && h[2] == 0xFF)
            return ".jpg";
        if (h.Length >= 8 && h[..8].SequenceEqual<byte>([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))
            return ".png";
        if (h.Length >= 12 && h[..4].SequenceEqual("RIFF"u8) && h[8..12].SequenceEqual("WEBP"u8))
            return ".webp";
        return null;
    }
}
