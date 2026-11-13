namespace SmallMart.Api.Domain;

/// <summary>The steps run in this order; a shop moves an order one step at a time. Cancelled can happen before Delivered.</summary>
public enum OrderStatus
{
    Placed = 0,
    Accepted = 1,
    Packed = 2,
    OutForDelivery = 3,
    Delivered = 4,
    Cancelled = 5,
}

public enum PaymentMethod
{
    CashOnDelivery = 0,
    Upi = 1,
}

public enum PaymentStatus
{
    /// <summary>Nothing received yet: cash is due on delivery, or the customer has not sent UPI proof.</summary>
    Pending = 0,
    /// <summary>The customer sent a UPI reference and screenshot; the shop has to check its bank or UPI app.</summary>
    AwaitingVerification = 1,
    Paid = 2,
    /// <summary>The shop could not find the UPI payment. The customer may send proof again.</summary>
    Rejected = 3,
}

public class Order
{
    public Guid Id { get; set; }
    /// <summary>Short running number shown to people, for example SM-00042.</summary>
    public int Number { get; set; }
    public Guid ShopId { get; set; }
    public Shop Shop { get; set; } = null!;
    public Guid CustomerId { get; set; }
    public ApplicationUser Customer { get; set; } = null!;

    public OrderStatus Status { get; set; }
    public PaymentMethod PaymentMethod { get; set; }
    public PaymentStatus PaymentStatus { get; set; }

    public decimal Subtotal { get; set; }
    public decimal DeliveryFee { get; set; }
    public decimal Total { get; set; }

    // Delivery details as typed at checkout; later changes to the account do not alter the order.
    public string CustomerName { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
    public string AddressLine { get; set; } = string.Empty;
    public string City { get; set; } = string.Empty;
    public string Pincode { get; set; } = string.Empty;
    public string? Note { get; set; }
    public string? CancelReason { get; set; }

    /// <summary>UPI transaction reference (UTR) typed by the customer. One reference can pay for one order only.</summary>
    public string? UpiReference { get; set; }
    public string? UpiScreenshotPath { get; set; }
    public DateTimeOffset? UpiSubmittedAt { get; set; }
    public string? PaymentRejectReason { get; set; }
    public Guid? PaymentVerifiedByUserId { get; set; }
    public DateTimeOffset? PaymentVerifiedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    /// <summary>Changes on every save, so two people cannot update the same order at once without noticing.</summary>
    public uint Version { get; set; }

    public List<OrderItem> Items { get; set; } = [];
    public List<OrderEvent> Events { get; set; } = [];

    public string DisplayNumber => $"SM-{Number:D5}";
}

/// <summary>A line of an order. Name, unit and price are copied so the order stays correct if the item changes.</summary>
public class OrderItem
{
    public Guid Id { get; set; }
    public Guid OrderId { get; set; }
    public Guid? ItemId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Unit { get; set; } = string.Empty;
    public decimal UnitPrice { get; set; }
    public int Quantity { get; set; }
    public decimal LineTotal { get; set; }
}

/// <summary>One entry in the order's timeline.</summary>
public class OrderEvent
{
    public long Id { get; set; }
    public Guid OrderId { get; set; }
    public DateTimeOffset At { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Note { get; set; }
    public Guid? ActorUserId { get; set; }
}
