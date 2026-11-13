using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using SmallMart.Api.Audit;
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
    public DbSet<AuditEntry> AuditEntries => Set<AuditEntry>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<OrderEvent> OrderEvents => Set<OrderEvent>();

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
            b.Property(s => s.IsActive).HasDefaultValue(true);
        });

        builder.Entity<AuditEntry>(b =>
        {
            b.Property(a => a.ActorEmail).HasMaxLength(256);
            b.Property(a => a.Action).HasMaxLength(60);
            b.Property(a => a.TargetType).HasMaxLength(30);
            b.Property(a => a.TargetId).HasMaxLength(64);
            b.Property(a => a.Summary).HasMaxLength(500);
            b.Property(a => a.IpAddress).HasMaxLength(45);
            b.HasIndex(a => a.At);
            b.HasIndex(a => a.Action);
        });

        builder.Entity<Order>(b =>
        {
            b.Property(o => o.Number).UseIdentityByDefaultColumn();
            b.HasIndex(o => o.Number).IsUnique();
            b.Property(o => o.Subtotal).HasPrecision(12, 2);
            b.Property(o => o.DeliveryFee).HasPrecision(10, 2);
            b.Property(o => o.Total).HasPrecision(12, 2);
            b.Property(o => o.CustomerName).HasMaxLength(200);
            b.Property(o => o.Phone).HasMaxLength(20);
            b.Property(o => o.AddressLine).HasMaxLength(300);
            b.Property(o => o.City).HasMaxLength(100);
            b.Property(o => o.Pincode).HasMaxLength(6);
            b.Property(o => o.Note).HasMaxLength(500);
            b.Property(o => o.CancelReason).HasMaxLength(300);
            b.Property(o => o.UpiReference).HasMaxLength(35);
            b.Property(o => o.UpiScreenshotPath).HasMaxLength(300);
            b.Property(o => o.PaymentRejectReason).HasMaxLength(300);
            b.Property(o => o.Version).IsRowVersion();
            b.Ignore(o => o.DisplayNumber);
            // The same UPI reference can never be used to pay for two orders.
            b.HasIndex(o => o.UpiReference).IsUnique();
            b.HasIndex(o => new { o.ShopId, o.CreatedAt });
            b.HasIndex(o => new { o.CustomerId, o.CreatedAt });
            // Orders are business records: a shop or customer with orders cannot simply be deleted.
            b.HasOne(o => o.Shop).WithMany().HasForeignKey(o => o.ShopId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(o => o.Customer).WithMany().HasForeignKey(o => o.CustomerId).OnDelete(DeleteBehavior.Restrict);
            b.HasMany(o => o.Items).WithOne().HasForeignKey(i => i.OrderId).OnDelete(DeleteBehavior.Cascade);
            b.HasMany(o => o.Events).WithOne().HasForeignKey(e => e.OrderId).OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<OrderItem>(b =>
        {
            b.Property(i => i.Name).HasMaxLength(150);
            b.Property(i => i.Unit).HasMaxLength(30);
            b.Property(i => i.UnitPrice).HasPrecision(10, 2);
            b.Property(i => i.LineTotal).HasPrecision(12, 2);
            b.HasOne<Item>().WithMany().HasForeignKey(i => i.ItemId).OnDelete(DeleteBehavior.SetNull);
        });

        builder.Entity<OrderEvent>(b =>
        {
            b.Property(e => e.Title).HasMaxLength(100);
            b.Property(e => e.Note).HasMaxLength(500);
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
