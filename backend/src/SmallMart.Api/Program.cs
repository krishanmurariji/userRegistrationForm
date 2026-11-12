using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using SmallMart.Api.Auth;
using SmallMart.Api.Data;
using SmallMart.Api.Domain;
using SmallMart.Api.Email;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();
builder.Services.AddSingleton(TimeProvider.System);

builder.Services.AddDbContext<AppDbContext>(o => o.UseNpgsql(config.GetConnectionString("Default")));

// Keys that protect email-confirmation and password-reset links live in the database,
// so the links keep working after a restart and across several servers.
builder.Services.AddDataProtection().SetApplicationName("SmallMart").PersistKeysToDbContext<AppDbContext>();

builder.Services
    .AddIdentityCore<ApplicationUser>(o =>
    {
        o.User.RequireUniqueEmail = true;
        o.Password.RequiredLength = 8;
        o.Password.RequireDigit = true;
        o.Password.RequireLowercase = true;
        o.Password.RequireUppercase = false;
        o.Password.RequireNonAlphanumeric = false;
        o.Lockout.MaxFailedAccessAttempts = 5;
        o.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
        o.Lockout.AllowedForNewUsers = true;
    })
    .AddRoles<IdentityRole<Guid>>()
    .AddEntityFrameworkStores<AppDbContext>()
    .AddDefaultTokenProviders();

var jwt = config.GetSection(JwtOptions.Section).Get<JwtOptions>() ?? new JwtOptions();
if (Encoding.UTF8.GetByteCount(jwt.Key) < 32)
    throw new InvalidOperationException("Jwt:Key must be set to a secret of at least 32 characters.");
builder.Services.Configure<JwtOptions>(config.GetSection(JwtOptions.Section));

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.MapInboundClaims = false;
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidIssuer = jwt.Issuer,
            ValidAudience = jwt.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Key)),
            ValidateIssuerSigningKey = true,
            ClockSkew = TimeSpan.FromSeconds(30),
            NameClaimType = "name",
            RoleClaimType = "role",
        };
    });
builder.Services.AddAuthorization();
builder.Services.AddScoped<TokenService>();

builder.Services.Configure<ExternalAuthOptions>(config.GetSection(ExternalAuthOptions.Section));
builder.Services.AddSingleton<IExternalTokenValidator, GoogleTokenValidator>();
builder.Services.AddSingleton<IExternalTokenValidator, MicrosoftTokenValidator>();

builder.Services.Configure<SmtpOptions>(config.GetSection(SmtpOptions.Section));
if (string.IsNullOrWhiteSpace(config["Smtp:Host"]))
    builder.Services.AddSingleton<IEmailSender, LoggingEmailSender>();
else
    builder.Services.AddSingleton<IEmailSender, SmtpEmailSender>();

// Slows down password guessing and email flooding: a per-IP limit on the sign-in endpoints.
var authPermitsPerMinute = config.GetValue("RateLimiting:AuthPermitsPerMinute", 20);
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("auth", http => RateLimitPartition.GetFixedWindowLimiter(
        http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = authPermitsPerMinute, Window = TimeSpan.FromMinutes(1) }));
});

var allowedOrigins = config.GetSection("App:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

await DbSeeder.InitialiseAsync(app.Services, config);

if (app.Environment.IsDevelopment())
    app.MapOpenApi();
else
    app.UseHttpsRedirection();

app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.Run();

public partial class Program;
