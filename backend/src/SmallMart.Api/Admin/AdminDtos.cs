using System.ComponentModel.DataAnnotations;

namespace SmallMart.Api.Admin;

public record Page<T>(IReadOnlyList<T> Items, int Total);

public record AdminUserDto(
    Guid Id, string Email, string FullName, IReadOnlyList<string> Roles, bool EmailConfirmed,
    bool Suspended, int ShopCount, DateTimeOffset CreatedAt);

/// <param name="Password">
/// Optional starting password. When left out, the new owner gets an email with a link to choose their own.
/// </param>
public record CreateShopOwnerRequest(
    [Required, EmailAddress, MaxLength(256)] string Email,
    [Required, MaxLength(200)] string FullName,
    [MaxLength(128)] string? Password);

public record AdminShopDto(
    Guid Id, string Name, string City, string Phone, bool IsActive, bool IsOpen,
    string? OwnerEmail, string? OwnerName, int ItemCount, DateTimeOffset CreatedAt);

public record AdminStatsDto(
    int TotalUsers, int Customers, int ShopOwners, int SuspendedUsers, int NewUsersLast7Days,
    int ActiveShops, int DeactivatedShops, int Items, int SignInsLast24Hours, int FailedSignInsLast24Hours);

public record AuditEntryDto(
    long Id, DateTimeOffset At, string? ActorEmail, string Action, string? TargetType, string? TargetId,
    string Summary, string? IpAddress);
