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

        // Earlier versions called the customer role "User".
        if (await roles.FindByNameAsync("User") is { } legacy && !await roles.RoleExistsAsync(Roles.Customer))
        {
            await roles.SetRoleNameAsync(legacy, Roles.Customer);
            await roles.UpdateAsync(legacy);
        }

        foreach (var role in Roles.All)
        {
            if (!await roles.RoleExistsAsync(role))
                await roles.CreateAsync(new IdentityRole<Guid>(role) { Id = Guid.NewGuid() });
        }

        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        // Shops opened before shop owners became an admin-granted role keep working for their owners.
        var ownersWithoutRole = await db.ShopMembers
            .Where(m => m.Role == ShopRole.Owner)
            .Select(m => m.User)
            .Distinct()
            .ToListAsync();
        foreach (var owner in ownersWithoutRole)
        {
            if (!await users.IsInRoleAsync(owner, Roles.ShopOwner))
                await users.AddToRoleAsync(owner, Roles.ShopOwner);
        }

        var adminEmail = config["Seed:AdminEmail"];
        var adminPassword = config["Seed:AdminPassword"];
        if (string.IsNullOrWhiteSpace(adminEmail) || string.IsNullOrWhiteSpace(adminPassword))
            return;

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
        await users.AddToRoleAsync(admin, Roles.PlatformAdmin);
    }
}
