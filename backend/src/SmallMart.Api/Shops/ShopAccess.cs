using Microsoft.EntityFrameworkCore;
using SmallMart.Api.Data;
using SmallMart.Api.Domain;

namespace SmallMart.Api.Shops;

public class ShopAccess(AppDbContext db)
{
    /// <summary>The user's role in the shop, or null when they do not belong to it (or it does not exist).</summary>
    public Task<ShopRole?> RoleAsync(Guid shopId, Guid userId, CancellationToken ct) =>
        db.ShopMembers.Where(m => m.ShopId == shopId && m.UserId == userId)
            .Select(m => (ShopRole?)m.Role).SingleOrDefaultAsync(ct);
}
