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
    /// <summary>When false the item is treated as always available and <see cref="StockQuantity"/> is ignored.</summary>
    public bool TrackStock { get; set; }
    /// <summary>Units on hand. Changes only through orders and stock adjustments, each recorded as a <see cref="StockMovement"/>.</summary>
    public int StockQuantity { get; set; }
    /// <summary>The shop is warned when stock falls to this number or below.</summary>
    public int LowStockThreshold { get; set; } = 5;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public enum StockReason
{
    /// <summary>The count entered when stock tracking was switched on.</summary>
    Opening = 0,
    /// <summary>New stock received from a supplier.</summary>
    Restock = 1,
    /// <summary>Sold through an order.</summary>
    Sale = 2,
    /// <summary>Put back because an order was cancelled.</summary>
    OrderCancelled = 3,
    /// <summary>Damaged, expired or lost.</summary>
    Damage = 4,
    /// <summary>The count was corrected after checking the shelf.</summary>
    Correction = 5,
}

/// <summary>One change to an item's stock, kept forever so the shop can see where stock went.</summary>
public class StockMovement
{
    public long Id { get; set; }
    public Guid ShopId { get; set; }
    public Guid ItemId { get; set; }
    public Item Item { get; set; } = null!;
    /// <summary>Positive when stock came in, negative when it went out.</summary>
    public int Change { get; set; }
    public int QuantityAfter { get; set; }
    public StockReason Reason { get; set; }
    public string? Note { get; set; }
    public Guid? OrderId { get; set; }
    public Guid? ActorUserId { get; set; }
    public DateTimeOffset At { get; set; }
}

/// <summary>A message shown in the app's notification list.</summary>
public class Notification
{
    public long Id { get; set; }
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;
    public string Title { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    /// <summary>The page in the app this is about, for example "/orders/…".</summary>
    public string? Link { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ReadAt { get; set; }
}
