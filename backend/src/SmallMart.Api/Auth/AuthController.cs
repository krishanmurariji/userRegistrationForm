using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.WebUtilities;
using SmallMart.Api.Domain;
using SmallMart.Api.Email;

namespace SmallMart.Api.Auth;

[ApiController]
[Route("api/auth")]
[EnableRateLimiting("auth")]
public class AuthController(
    UserManager<ApplicationUser> users,
    TokenService tokens,
    IEmailSender email,
    IEnumerable<IExternalTokenValidator> externalValidators,
    IConfiguration config,
    ILogger<AuthController> logger) : ControllerBase
{
    private const string CheckEmailMessage =
        "If the email address can be used, we have sent a message to it. Please check your inbox.";

    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterRequest request, CancellationToken ct)
    {
        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = request.Email,
            Email = request.Email,
            FullName = request.FullName.Trim(),
        };

        foreach (var validator in users.PasswordValidators)
        {
            var check = await validator.ValidateAsync(users, user, request.Password);
            if (!check.Succeeded)
                return IdentityError("weak_password", check);
        }

        // Same answer whether or not the email is taken, so the endpoint can't be used to discover accounts.
        if (await users.FindByEmailAsync(request.Email) is not null)
        {
            logger.LogInformation("Registration attempted for an existing email.");
            return Ok(new MessageResponse(CheckEmailMessage));
        }

        var result = await users.CreateAsync(user, request.Password);
        if (!result.Succeeded)
            return IdentityError("registration_failed", result);

        await users.AddToRoleAsync(user, Roles.User);
        await SendConfirmationEmailAsync(user, ct);
        return Ok(new MessageResponse(CheckEmailMessage));
    }

    [HttpPost("confirm-email")]
    public async Task<IActionResult> ConfirmEmail(ConfirmEmailRequest request)
    {
        var user = await users.FindByIdAsync(request.UserId.ToString());
        var token = DecodeToken(request.Token);
        if (user is null || token is null || !(await users.ConfirmEmailAsync(user, token)).Succeeded)
            return Error(StatusCodes.Status400BadRequest, "invalid_token", "This confirmation link is invalid or has expired.");

        return Ok(new MessageResponse("Email confirmed. You can now sign in."));
    }

    [HttpPost("resend-confirmation")]
    public async Task<IActionResult> ResendConfirmation(EmailRequest request, CancellationToken ct)
    {
        var user = await users.FindByEmailAsync(request.Email);
        if (user is not null && !user.EmailConfirmed)
            await SendConfirmationEmailAsync(user, ct);
        return Ok(new MessageResponse(CheckEmailMessage));
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest request, CancellationToken ct)
    {
        var user = await users.FindByEmailAsync(request.Email);
        if (user is null)
            return InvalidCredentials();

        if (await users.IsLockedOutAsync(user))
            return LockedOut();

        if (!await users.CheckPasswordAsync(user, request.Password))
        {
            await users.AccessFailedAsync(user);
            return await users.IsLockedOutAsync(user) ? LockedOut() : InvalidCredentials();
        }

        await users.ResetAccessFailedCountAsync(user);

        // Checked only after the password is proven, so it does not reveal which emails are registered.
        if (!user.EmailConfirmed)
            return Error(StatusCodes.Status403Forbidden, "email_not_confirmed",
                "Please confirm your email address before signing in.");

        return Ok(await tokens.IssueAsync(user, ct: ct));
    }

    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh(RefreshRequest request, CancellationToken ct)
    {
        var response = await tokens.RotateAsync(request.RefreshToken, ct);
        return response is null
            ? Error(StatusCodes.Status401Unauthorized, "invalid_refresh_token", "Your session has expired. Please sign in again.")
            : Ok(response);
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout(RefreshRequest request, CancellationToken ct)
    {
        await tokens.RevokeAsync(request.RefreshToken, ct);
        return NoContent();
    }

    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword(EmailRequest request, CancellationToken ct)
    {
        var user = await users.FindByEmailAsync(request.Email);
        if (user is not null)
        {
            var token = EncodeToken(await users.GeneratePasswordResetTokenAsync(user));
            var link = ClientLink("reset-password", user.Id, token);
            await email.SendAsync(user.Email!, "Reset your Small Mart password",
                $"<p>Hello {WebUtility.HtmlEncode(user.FullName)},</p>" +
                $"<p><a href=\"{link}\">Choose a new password</a>. This link expires in 24 hours.</p>" +
                "<p>If you did not ask for this, you can ignore this email.</p>", ct);
        }
        return Ok(new MessageResponse(CheckEmailMessage));
    }

    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword(ResetPasswordRequest request, CancellationToken ct)
    {
        var user = await users.FindByIdAsync(request.UserId.ToString());
        var token = DecodeToken(request.Token);
        if (user is null || token is null)
            return Error(StatusCodes.Status400BadRequest, "invalid_token", "This reset link is invalid or has expired.");

        var result = await users.ResetPasswordAsync(user, token, request.NewPassword);
        if (!result.Succeeded)
        {
            return result.Errors.Any(e => e.Code == "InvalidToken")
                ? Error(StatusCodes.Status400BadRequest, "invalid_token", "This reset link is invalid or has expired.")
                : IdentityError("weak_password", result);
        }

        // The reset link was delivered to the mailbox, which also proves ownership of the email.
        if (!user.EmailConfirmed)
        {
            user.EmailConfirmed = true;
            await users.UpdateAsync(user);
        }
        await users.SetLockoutEndDateAsync(user, null);
        await users.ResetAccessFailedCountAsync(user);
        await tokens.RevokeAllForUserAsync(user.Id, ct);
        return Ok(new MessageResponse("Password changed. Please sign in with your new password."));
    }

    /// <summary>Sign in with a Google or Microsoft ID token obtained by the app.</summary>
    [HttpPost("external/{provider}")]
    public async Task<IActionResult> ExternalLogin(string provider, ExternalLoginRequest request, CancellationToken ct)
    {
        var validator = externalValidators.FirstOrDefault(v =>
            string.Equals(v.Provider, provider, StringComparison.OrdinalIgnoreCase));
        if (validator is null)
            return Error(StatusCodes.Status404NotFound, "unknown_provider", "This sign-in provider is not supported.");

        var identity = await validator.ValidateAsync(request.IdToken, ct);
        if (identity is null)
            return Error(StatusCodes.Status401Unauthorized, "invalid_external_token", "We could not verify your sign-in. Please try again.");

        // Returning user: matched by the provider's account id, never by email alone.
        var user = await users.FindByLoginAsync(validator.Provider, identity.Subject);
        if (user is null)
        {
            if (string.IsNullOrWhiteSpace(identity.Email))
                return Error(StatusCodes.Status400BadRequest, "email_required",
                    "Your account did not share an email address, which is needed to sign up.");

            var existing = await users.FindByEmailAsync(identity.Email);
            if (existing is not null)
            {
                // Attach to an existing account only when both sides have proven ownership of the email.
                // Otherwise someone could take over an account by presenting an unverified email claim.
                if (!identity.EmailVerified || !existing.EmailConfirmed)
                    return Error(StatusCodes.Status409Conflict, "account_exists",
                        "An account with this email already exists. Please sign in with your password.");
                user = existing;
            }
            else
            {
                user = new ApplicationUser
                {
                    Id = Guid.NewGuid(),
                    UserName = identity.Email,
                    Email = identity.Email,
                    EmailConfirmed = identity.EmailVerified,
                    FullName = string.IsNullOrWhiteSpace(identity.Name) ? identity.Email : identity.Name.Trim(),
                };
                var created = await users.CreateAsync(user);
                if (!created.Succeeded)
                    return IdentityError("registration_failed", created);
                await users.AddToRoleAsync(user, Roles.User);
                if (!user.EmailConfirmed)
                    await SendConfirmationEmailAsync(user, ct);
            }

            var linked = await users.AddLoginAsync(user, new UserLoginInfo(validator.Provider, identity.Subject, validator.Provider));
            if (!linked.Succeeded)
                return IdentityError("registration_failed", linked);
        }

        if (await users.IsLockedOutAsync(user))
            return LockedOut();

        return Ok(await tokens.IssueAsync(user, ct: ct));
    }

    [Authorize]
    [HttpGet("me")]
    [DisableRateLimiting]
    public async Task<IActionResult> Me()
    {
        var user = await users.FindByIdAsync(User.FindFirst(JwtRegisteredClaimNames.Sub)!.Value);
        if (user is null)
            return Unauthorized();
        var roles = (await users.GetRolesAsync(user)).ToList();
        return Ok(new UserDto(user.Id, user.Email ?? string.Empty, user.FullName, user.EmailConfirmed, roles));
    }

    private async Task SendConfirmationEmailAsync(ApplicationUser user, CancellationToken ct)
    {
        var token = EncodeToken(await users.GenerateEmailConfirmationTokenAsync(user));
        var link = ClientLink("confirm-email", user.Id, token);
        await email.SendAsync(user.Email!, "Confirm your Small Mart account",
            $"<p>Hello {WebUtility.HtmlEncode(user.FullName)},</p>" +
            $"<p><a href=\"{link}\">Confirm your email address</a> to finish creating your account.</p>", ct);
    }

    private string ClientLink(string path, Guid userId, string token) =>
        $"{config["App:ClientUrl"]?.TrimEnd('/')}/{path}?userId={userId}&token={token}";

    private static string EncodeToken(string token) => WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(token));

    private static string? DecodeToken(string token)
    {
        try { return Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(token)); }
        catch (FormatException) { return null; }
    }

    private ObjectResult InvalidCredentials() =>
        Error(StatusCodes.Status401Unauthorized, "invalid_credentials", "The email or password is incorrect.");

    private ObjectResult LockedOut() =>
        Error(StatusCodes.Status423Locked, "locked_out", "Too many failed attempts. Please try again later or reset your password.");

    private ObjectResult IdentityError(string code, IdentityResult result) =>
        Error(StatusCodes.Status400BadRequest, code, string.Join(" ", result.Errors.Select(e => e.Description)));

    private ObjectResult Error(int status, string code, string detail)
    {
        var problem = new ProblemDetails { Status = status, Title = detail, Detail = detail };
        problem.Extensions["code"] = code;
        return StatusCode(status, problem);
    }
}
