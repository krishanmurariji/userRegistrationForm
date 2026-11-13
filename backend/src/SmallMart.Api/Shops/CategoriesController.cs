using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmallMart.Api.Auth;
using SmallMart.Api.Data;
using SmallMart.Api.Domain;

namespace SmallMart.Api.Shops;

[ApiController]
[Route("api/shops/{shopId:guid}/categories")]
[Authorize]
public class CategoriesController(AppDbContext db, ShopAccess access) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(Guid shopId, CancellationToken ct)
    {
        if (await access.RoleAsync(shopId, User.GetUserId(), ct) is null)
            return NotFound();

        var categories = await db.Categories.AsNoTracking()
            .Where(c => c.ShopId == shopId)
            .OrderBy(c => c.SortOrder).ThenBy(c => c.Name)
            .Select(c => new CategoryDto(c.Id, c.Name, c.SortOrder, db.Items.Count(i => i.CategoryId == c.Id)))
            .ToListAsync(ct);
        return Ok(categories);
    }

    [HttpPost]
    public async Task<IActionResult> Create(Guid shopId, CategoryRequest request, CancellationToken ct)
    {
        if (await access.RoleAsync(shopId, User.GetUserId(), ct) is null)
            return NotFound();
        if (!await access.IsActiveAsync(shopId, ct))
            return this.ShopDeactivated();

        var name = request.Name.Trim();
        if (await NameTakenAsync(shopId, name, null, ct))
            return Duplicate();

        var category = new Category { Id = Guid.NewGuid(), ShopId = shopId, Name = name, SortOrder = request.SortOrder };
        db.Categories.Add(category);
        await db.SaveChangesAsync(ct);
        return StatusCode(StatusCodes.Status201Created, new CategoryDto(category.Id, category.Name, category.SortOrder, 0));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid shopId, Guid id, CategoryRequest request, CancellationToken ct)
    {
        if (await access.RoleAsync(shopId, User.GetUserId(), ct) is null)
            return NotFound();
        if (!await access.IsActiveAsync(shopId, ct))
            return this.ShopDeactivated();
        var category = await db.Categories.SingleOrDefaultAsync(c => c.Id == id && c.ShopId == shopId, ct);
        if (category is null)
            return NotFound();

        var name = request.Name.Trim();
        if (await NameTakenAsync(shopId, name, id, ct))
            return Duplicate();

        category.Name = name;
        category.SortOrder = request.SortOrder;
        await db.SaveChangesAsync(ct);
        var count = await db.Items.CountAsync(i => i.CategoryId == id, ct);
        return Ok(new CategoryDto(category.Id, category.Name, category.SortOrder, count));
    }

    /// <summary>Deletes the category. Its items are kept and become uncategorised.</summary>
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid shopId, Guid id, CancellationToken ct)
    {
        if (await access.RoleAsync(shopId, User.GetUserId(), ct) is null)
            return NotFound();
        if (!await access.IsActiveAsync(shopId, ct))
            return this.ShopDeactivated();
        var category = await db.Categories.SingleOrDefaultAsync(c => c.Id == id && c.ShopId == shopId, ct);
        if (category is null)
            return NotFound();

        db.Categories.Remove(category);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private Task<bool> NameTakenAsync(Guid shopId, string name, Guid? exceptId, CancellationToken ct) =>
        db.Categories.AnyAsync(c => c.ShopId == shopId && c.Id != exceptId && c.Name.ToLower() == name.ToLower(), ct);

    private ObjectResult Duplicate() =>
        this.ApiError(StatusCodes.Status409Conflict, "duplicate_category", "This shop already has a category with that name.");
}
