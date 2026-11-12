using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using SmallMart.Api.Domain;

namespace SmallMart.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options)
    : IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>(options), IDataProtectionKeyContext
{
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<DataProtectionKey> DataProtectionKeys => Set<DataProtectionKey>();
    public DbSet<Shop> Shops => Set<Shop>();
    public DbSet<ShopMember> ShopMembers => Set<ShopMember>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Item> Items => Set<Item>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<ApplicationUser>(b =>
        {
            b.Property(u => u.FullName).HasMaxLength(200);
        });

        builder.Entity<RefreshToken>(b =>
        {
            b.Property(t => t.TokenHash).HasMaxLength(64);
            b.HasIndex(t => t.TokenHash).IsUnique();
            b.HasIndex(t => t.FamilyId);
            b.HasOne(t => t.User).WithMany().HasForeignKey(t => t.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<Shop>(b =>
        {
            b.Property(s => s.Name).HasMaxLength(120);
            b.Property(s => s.Description).HasMaxLength(1000);
            b.Property(s => s.Phone).HasMaxLength(20);
            b.Property(s => s.AddressLine).HasMaxLength(300);
            b.Property(s => s.City).HasMaxLength(100);
            b.Property(s => s.Pincode).HasMaxLength(6);
            b.Property(s => s.UpiId).HasMaxLength(320);
            b.Property(s => s.DeliveryFee).HasPrecision(10, 2);
            b.Property(s => s.MinimumOrder).HasPrecision(10, 2);
            b.Property(s => s.LogoPath).HasMaxLength(300);
        });

        builder.Entity<ShopMember>(b =>
        {
            b.HasKey(m => new { m.ShopId, m.UserId });
            b.HasIndex(m => m.UserId);
            b.HasOne(m => m.Shop).WithMany(s => s.Members).HasForeignKey(m => m.ShopId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne(m => m.User).WithMany().HasForeignKey(m => m.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<Category>(b =>
        {
            b.Property(c => c.Name).HasMaxLength(80);
            b.HasIndex(c => new { c.ShopId, c.SortOrder });
            b.HasOne(c => c.Shop).WithMany().HasForeignKey(c => c.ShopId).OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<Item>(b =>
        {
            b.Property(i => i.Name).HasMaxLength(150);
            b.Property(i => i.Description).HasMaxLength(2000);
            b.Property(i => i.Price).HasPrecision(10, 2);
            b.Property(i => i.Mrp).HasPrecision(10, 2);
            b.Property(i => i.Unit).HasMaxLength(30);
            b.Property(i => i.Barcode).HasMaxLength(64);
            b.Property(i => i.ImagePath).HasMaxLength(300);
            b.HasIndex(i => new { i.ShopId, i.Name });
            b.HasOne(i => i.Shop).WithMany().HasForeignKey(i => i.ShopId).OnDelete(DeleteBehavior.Cascade);
            // Deleting a category keeps its items; they become uncategorised.
            b.HasOne(i => i.Category).WithMany().HasForeignKey(i => i.CategoryId).OnDelete(DeleteBehavior.SetNull);
        });
    }
}
