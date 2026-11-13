namespace SmallMart.Api.Domain;

public class Shop
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Phone { get; set; } = string.Empty;
    public string AddressLine { get; set; } = string.Empty;
    public string City { get; set; } = string.Empty;
    public string Pincode { get; set; } = string.Empty;
    /// <summary>UPI address customers pay to, for example "shopname@upi".</summary>
    public string? UpiId { get; set; }
    public decimal DeliveryFee { get; set; }
    public decimal MinimumOrder { get; set; }
    /// <summary>Whether the shop is taking orders right now.</summary>
    public bool IsOpen { get; set; } = true;
    /// <summary>
    /// Controlled by the platform admin. A deactivated shop is hidden from customers and cannot be changed
    /// by its owner until it is activated again.
    /// </summary>
    public bool IsActive { get; set; } = true;
    public string? LogoPath { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public List<ShopMember> Members { get; set; } = [];
}

/// <summary>Higher values include the rights of lower ones.</summary>
public enum ShopRole
{
    /// <summary>Manages categories and items.</summary>
    Staff = 1,
    /// <summary>Also changes shop settings.</summary>
    Manager = 2,
    /// <summary>Created the shop.</summary>
    Owner = 3,
}

/// <summary>Links a user to a shop they work in. One account can belong to several shops.</summary>
public class ShopMember
{
    public Guid ShopId { get; set; }
    public Shop Shop { get; set; } = null!;
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;
    public ShopRole Role { get; set; }
}

public class Category
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public Shop Shop { get; set; } = null!;
    public string Name { get; set; } = string.Empty;
    public int SortOrder { get; set; }
}

public class Item
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public Shop Shop { get; set; } = null!;
    public Guid? CategoryId { get; set; }
    public Category? Category { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    /// <summary>Selling price in rupees.</summary>
    public decimal Price { get; set; }
    /// <summary>Printed maximum retail price, shown struck through when higher than <see cref="Price"/>.</summary>
    public decimal? Mrp { get; set; }
    /// <summary>What one unit is, for example "1 kg", "500 g", "1 piece".</summary>
    public string Unit { get; set; } = string.Empty;
    public string? Barcode { get; set; }
    /// <summary>Inactive items are hidden from customers.</summary>
    public bool IsActive { get; set; } = true;
    public string? ImagePath { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
