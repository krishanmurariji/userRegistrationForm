using System.ComponentModel.DataAnnotations;

namespace SmallMart.Api.Auth;

public record RegisterRequest(
    [Required, EmailAddress, MaxLength(256)] string Email,
    [Required, MaxLength(128)] string Password,
    [Required, MaxLength(200)] string FullName);

public record LoginRequest(
    [Required, EmailAddress] string Email,
    [Required] string Password);

public record RefreshRequest([Required] string RefreshToken);

public record ConfirmEmailRequest([Required] Guid UserId, [Required] string Token);

public record EmailRequest([Required, EmailAddress] string Email);

public record ResetPasswordRequest(
    [Required] Guid UserId,
    [Required] string Token,
    [Required, MaxLength(128)] string NewPassword);

public record ExternalLoginRequest([Required] string IdToken);

public record UserDto(Guid Id, string Email, string FullName, bool EmailConfirmed, IReadOnlyList<string> Roles);

public record AuthResponse(
    string AccessToken,
    DateTimeOffset AccessTokenExpiresAt,
    string RefreshToken,
    DateTimeOffset RefreshTokenExpiresAt,
    UserDto User);

public record MessageResponse(string Message);
