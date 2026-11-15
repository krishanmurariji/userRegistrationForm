using Microsoft.EntityFrameworkCore;
using SmallMart.Api.Data;
using SmallMart.Api.Domain;

namespace SmallMart.Api.Storage;

/// <summary>
/// Stores uploaded pictures on local disk and serves them under <c>/files</c>.
/// Set <c>Storage:Root</c> to a persistent folder in production; swap this class for blob storage later.
/// </summary>
public class ImageStorage(IConfiguration config, IWebHostEnvironment env, IServiceScopeFactory scopes)
{
    public const string RequestPath = "/files";
    public const long MaxBytes = 5 * 1024 * 1024;

    /// <summary>
    /// "Disk" (default) keeps pictures in folders; "Database" keeps them in the database, which is what you want on
    /// a host whose disk is wiped on every restart (most free hosts).
    /// </summary>
    public bool InDatabase { get; } = string.Equals(config["Storage:Provider"], "Database", StringComparison.OrdinalIgnoreCase);

    public string Root { get; } = Path.GetFullPath(
        config["Storage:Root"] is { Length: > 0 } root ? root : Path.Combine(env.ContentRootPath, "App_Data", "uploads"));

    /// <summary>
    /// Pictures that must not be public, such as payment screenshots. Never served as static files;
    /// an endpoint checks who is asking and then streams the file.
    /// </summary>
    public string PrivateRoot { get; } = Path.GetFullPath(
        config["Storage:PrivateRoot"] is { Length: > 0 } privateRoot
            ? privateRoot
            : config["Storage:Root"] is { Length: > 0 } publicRoot
                ? publicRoot.TrimEnd('/', '\\') + "-private"
                : Path.Combine(env.ContentRootPath, "App_Data", "private"));

    /// <summary>Public URL path for a stored picture, or null when there is none.</summary>
    public static string? Url(string? relativePath) => relativePath is null ? null : $"{RequestPath}/{relativePath}";

    /// <summary>
    /// Saves a JPEG, PNG or WebP picture under the given folder and returns its relative path.
    /// Returns null when the file is empty, too large or not one of those formats.
    /// The type is decided from the file's content, never from its name.
    /// </summary>
    public async Task<string?> SaveAsync(IFormFile file, string folder, CancellationToken ct, bool isPrivate = false)
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
        input.Position = 0;
        if (InDatabase)
        {
            using var memory = new MemoryStream((int)file.Length);
            await input.CopyToAsync(memory, ct);
            await StoreAsync(relative, isPrivate, memory.ToArray(), ct);
            return relative;
        }

        var fullPath = Path.Combine(isPrivate ? PrivateRoot : Root, relative);
        Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);
        await using var output = File.Create(fullPath);
        await input.CopyToAsync(output, ct);
        return relative;
    }

    /// <summary>Copies a public picture into a folder under a new name. Returns the new path, or null when there is nothing to copy.</summary>
    public async Task<string?> CopyAsync(string? relativePath, string folder, CancellationToken ct = default)
    {
        if (relativePath is null)
            return null;
        var relative = $"{folder}/{Guid.NewGuid():N}{Path.GetExtension(relativePath)}";
        if (InDatabase)
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var content = await db.StoredFiles.Where(f => f.Path == relativePath && !f.IsPrivate).Select(f => f.Content).SingleOrDefaultAsync(ct);
            if (content is null)
                return null;
            await StoreAsync(relative, false, content, ct);
            return relative;
        }

        if (ResolveExisting(relativePath, isPrivate: false) is not { } source)
            return null;
        var target = Path.Combine(Root, relative);
        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        File.Copy(source, target);
        return relative;
    }

    public async Task DeleteAsync(string? relativePath, bool isPrivate = false, CancellationToken ct = default)
    {
        if (relativePath is null)
            return;
        if (InDatabase)
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await db.StoredFiles.Where(f => f.Path == relativePath && f.IsPrivate == isPrivate).ExecuteDeleteAsync(ct);
        }
        else if (ResolveExisting(relativePath, isPrivate) is { } fullPath)
            File.Delete(fullPath);
    }

    /// <summary>Opens a private picture for an endpoint to stream, or returns null when it is missing.</summary>
    public async Task<(Stream Content, string ContentType)?> OpenPrivateAsync(string? relativePath, CancellationToken ct = default)
    {
        if (relativePath is null)
            return null;
        if (InDatabase)
            return await ReadAsync(relativePath, isPrivate: true, ct) is { } stored ? (new MemoryStream(stored.Content), stored.ContentType) : null;

        if (ResolveExisting(relativePath, isPrivate: true) is not { } fullPath)
            return null;
        var contentType = Path.GetExtension(fullPath) switch
        {
            ".png" => "image/png",
            ".webp" => "image/webp",
            _ => "image/jpeg",
        };
        return (File.OpenRead(fullPath), contentType);
    }

    /// <summary>A public picture kept in the database, for the <c>/files</c> endpoint.</summary>
    public async Task<(byte[] Content, string ContentType)?> ReadPublicAsync(string relativePath, CancellationToken ct) =>
        await ReadAsync(relativePath, isPrivate: false, ct);

    private async Task<(byte[] Content, string ContentType)?> ReadAsync(string relativePath, bool isPrivate, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var file = await db.StoredFiles.AsNoTracking().Where(f => f.Path == relativePath && f.IsPrivate == isPrivate)
            .Select(f => new { f.Content, f.ContentType }).SingleOrDefaultAsync(ct);
        return file is null ? null : (file.Content, file.ContentType);
    }

    private async Task StoreAsync(string relativePath, bool isPrivate, byte[] content, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.StoredFiles.Add(new StoredFile
        {
            Path = relativePath,
            IsPrivate = isPrivate,
            ContentType = ContentTypeOf(content) ?? "image/jpeg",
            Content = content,
            CreatedAt = DateTimeOffset.UtcNow,
        });
        await db.SaveChangesAsync(ct);
    }

    private string? ResolveExisting(string? relativePath, bool isPrivate)
    {
        if (relativePath is null)
            return null;
        var root = isPrivate ? PrivateRoot : Root;
        var fullPath = Path.GetFullPath(Path.Combine(root, relativePath));
        return fullPath.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.Ordinal) && File.Exists(fullPath)
            ? fullPath
            : null;
    }

    /// <summary>The picture's real type judged from its first bytes ("image/jpeg", "image/png", "image/webp"), or null when it is not one of those.</summary>
    public static string? ContentTypeOf(ReadOnlySpan<byte> content) => DetectExtension(content[..Math.Min(content.Length, 12)]) switch
    {
        ".jpg" => "image/jpeg",
        ".png" => "image/png",
        ".webp" => "image/webp",
        _ => null,
    };

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
