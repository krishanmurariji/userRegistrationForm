using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using SmallMart.Api.Ai;
using SmallMart.Api.Audit;
using SmallMart.Api.Auth;
using SmallMart.Api.Data;
using SmallMart.Api.Domain;
using Microsoft.Extensions.FileProviders;
using SmallMart.Api.Email;
using SmallMart.Api.Inventory;
using SmallMart.Api.Notifications;
using SmallMart.Api.Shops;
using SmallMart.Api.Storage;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

// Personal settings for this machine only (for example your database password). The file is not committed.
config.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: false);
config.AddEnvironmentVariables();

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
builder.Services.AddScoped<ShopAccess>();
builder.Services.AddScoped<AuditLog>();
builder.Services.AddScoped<Notifier>();
builder.Services.AddScoped<StockService>();

// Reading items from photos. The key stays on the server; the app never sees it.
builder.Services.Configure<AiOptions>(config.GetSection(AiOptions.Section));
builder.Services.AddScoped<ProductScanner>();
builder.Services.AddHttpClient<IProductVision, OpenAiProductVision>(c =>
{
    c.BaseAddress = new Uri("https://api.openai.com/");
    c.Timeout = TimeSpan.FromSeconds(90);
});
builder.Services.AddHttpClient<IWebProductSearch, OpenAiWebProductSearch>(c =>
{
    c.BaseAddress = new Uri("https://api.openai.com/");
    c.Timeout = TimeSpan.FromSeconds(90);
});
builder.Services.AddHttpClient<IBarcodeLookup, OpenFoodFactsLookup>(c =>
{
    c.BaseAddress = new Uri("https://world.openfoodfacts.org/");
    c.Timeout = TimeSpan.FromSeconds(8);
    c.DefaultRequestHeaders.UserAgent.ParseAdd("SmallMart/1.0");
});
builder.Services.AddHttpContextAccessor();
builder.Services.AddSingleton<ImageStorage>();

builder.Services.Configure<ExternalAuthOptions>(config.GetSection(ExternalAuthOptions.Section));
builder.Services.AddSingleton<IExternalTokenValidator, GoogleTokenValidator>();
builder.Services.AddSingleton<IExternalTokenValidator, MicrosoftTokenValidator>();

builder.Services.Configure<SmtpOptions>(config.GetSection(SmtpOptions.Section));
if (string.IsNullOrWhiteSpace(config["Smtp:Host"]))
    builder.Services.AddSingleton<IEmailSender, LoggingEmailSender>();
else
    builder.Services.AddSingleton<IEmailSender, SmtpEmailSender>();

// Slows down password guessing and email flooding: a per-IP limit on the sign-in endpoints.
var authPermitsPerMinute = config.GetValue("RateLimiting:AuthPermitsPerMinute", 60);
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("auth", http => RateLimitPartition.GetFixedWindowLimiter(
        http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = authPermitsPerMinute, Window = TimeSpan.FromMinutes(1) }));
});

var allowedOrigins = config.GetSection("App:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod()
    // Lets the app read the file name of a download such as an export.
    .WithExposedHeaders("Content-Disposition")));

var app = builder.Build();

await DbSeeder.InitialiseAsync(app.Services, config);

if (app.Environment.IsDevelopment())
    app.MapOpenApi();
else
    app.UseHttpsRedirection();

app.UseCors();

// Uploaded pictures. "nosniff" stops browsers from treating a file as anything but the image type we stored.
var imageStorage = app.Services.GetRequiredService<ImageStorage>();
Directory.CreateDirectory(imageStorage.Root);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(imageStorage.Root),
    RequestPath = ImageStorage.RequestPath,
    OnPrepareResponse = ctx =>
    {
        ctx.Context.Response.Headers.XContentTypeOptions = "nosniff";
        ctx.Context.Response.Headers.CacheControl = "public,max-age=31536000,immutable";
    },
});

app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.Run();

public partial class Program;
