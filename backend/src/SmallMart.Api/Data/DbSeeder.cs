using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SmallMart.Api.Auth;
using SmallMart.Api.Domain;

namespace SmallMart.Api.Data;

public static class DbSeeder
{
    /// <summary>Applies migrations (when enabled), creates the roles and the first platform admin.</summary>
    public static async Task InitialiseAsync(IServiceProvider services, IConfiguration config)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        if (config.GetValue("Database:MigrateOnStartup", false))
            await db.Database.MigrateAsync();

        var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
        foreach (var role in Roles.All)
        {
            if (!await roles.RoleExistsAsync(role))
                await roles.CreateAsync(new IdentityRole<Guid>(role) { Id = Guid.NewGuid() });
        }

        var adminEmail = config["Seed:AdminEmail"];
        var adminPassword = config["Seed:AdminPassword"];
        if (string.IsNullOrWhiteSpace(adminEmail) || string.IsNullOrWhiteSpace(adminPassword))
            return;

        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        if (await users.FindByEmailAsync(adminEmail) is not null)
            return;

        var admin = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = adminEmail,
            Email = adminEmail,
            EmailConfirmed = true,
            FullName = "Platform Admin",
        };
        var result = await users.CreateAsync(admin, adminPassword);
        if (!result.Succeeded)
            throw new InvalidOperationException(
                "Could not create the seed admin: " + string.Join(" ", result.Errors.Select(e => e.Description)));
        await users.AddToRolesAsync(admin, [Roles.PlatformAdmin, Roles.User]);
    }
}
