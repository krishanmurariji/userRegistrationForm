# Small Mart App: Revised Plan (custom build)

Supersedes `nopcommerce-mart-plan.md`. Status: plan only, nothing built yet.

## 1. Why custom instead of nopCommerce

| Requirement | nopCommerce | Custom build |
|---|---|---|
| Cross-platform app (Android, iOS, web) | Razor website only | One Angular codebase, packaged for mobile |
| Any user creates shops | Vendors need admin approval, one vendor per account | Native concept |
| UPI screenshot + manual verification | Would be a custom payment plugin | Native concept |
| Your stack (C#, Angular) | C# but no Angular | Full match |

## 2. Stack

- **Backend:** ASP.NET Core Web API, EF Core, PostgreSQL or SQL Server.
  Use ASP.NET Zero as the base if you hold a license: it already has login, roles,
  Google and Microsoft sign-in, audit logs, and an Angular admin.
- **Apps:** Angular + Ionic + Capacitor. One codebase gives the web app, Android app, and iOS app.
- **Files (item photos, payment screenshots):** local disk at first, blob storage later.
- **Notifications:** Firebase Cloud Messaging (free) for push, email for the rest.
- **Shops are plain entities owned by a user, not tenants**, so one customer account can browse and order from every shop.

## 3. Roles

- **Customer:** browses, orders, pays, tracks.
- **Shop owner:** creates shops, manages everything in them.
- **Shop manager / staff:** added by the owner, manages items, orders, and payment verification.
- **Platform admin:** you. Can suspend shops and users.

One account can be both a customer and a shop owner.

## 4. Features

### 4.1 Login
- Email + password with email verification, password reset, and lockout after failed attempts.
- Sign in with Google and Microsoft.
- JWT access tokens with refresh tokens, so the app stays signed in safely.
- Optional two-factor login for shop owners.
- Phone OTP login is possible later, but SMS costs money per message.

### 4.2 Shops
- Create a shop: name, logo, address, phone, opening hours, delivery area, delivery fee, minimum order.
- UPI ID and QR code for payments.
- Open / closed switch.
- Invite staff with a role.

### 4.3 Items
- Categories (lists) inside each shop.
- Item: name, photos, description, price, MRP, unit (kg, piece, litre), variants (500 g, 1 kg), barcode, tax, active flag.
- Bulk import from Excel.

### 4.4 Customer shopping
- Browse shops and categories.
- Search with filters (category, price, in stock) and typo tolerance.
- Cart (one shop per order), saved addresses, order notes.
- Order history and one-tap reorder.

### 4.5 Promotional offers
- Item discount (percent or flat) with start and end dates.
- Coupon codes with minimum order value and usage limits.
- Free delivery above an amount.
- Offer banners on the shop page.

### 4.6 Payment
**Cash on Delivery:** order is confirmed at once, marked paid when delivered.

**UPI with manual verification:**
1. Checkout shows the shop's QR code and a "Pay with UPI app" button with the exact amount and order number pre-filled.
2. Customer pays in any UPI app.
3. Customer uploads the screenshot and types the UPI reference number (UTR).
4. Order shows "Payment under verification".
5. Manager opens the "UPI payments to verify" list, checks the money in their own bank or UPI app, then approves or rejects with a reason.
6. Customer gets a notification: "Payment confirmed" or "Payment not found, please retry".

Safeguards:
- Screenshots can be faked. The manager must match the UTR and amount in their own bank or UPI app, never trust the picture alone.
- The same UTR cannot be used on two orders.
- Unverified orders auto-cancel after a time limit and stock is released.
- Every approval is logged with who and when.

There are no gateway fees in this model.

### 4.7 Orders and delivery
- Statuses: Placed, Accepted, Packed, Out for delivery, Delivered, Cancelled.
- Timeline visible to the customer, push notification on each change.
- Shop can reject an order with a reason.
- Home delivery or pickup from shop.

### 4.8 Inventory
- Stock quantity per item and variant.
- Stock reserved when ordered, restored when cancelled.
- Low-stock alerts, automatic "out of stock" label.
- Stock adjustments with a reason (purchase, damage, correction) and a history log.

### 4.9 Suggested extras
**Worth including in the first version**
- Help and support: tickets per order, plus an FAQ.
- Sales dashboard: today's orders, revenue, top items, pending payments.
- Order receipt as PDF.
- Share shop link on WhatsApp.

**Later**
- Delivery person app view with assigned orders.
- Ratings and reviews.
- Hindi and other languages.
- Customer credit ("khata") ledger.
- Barcode scanning with the phone camera for stock entry.
- Purchase and supplier records, expiry-date tracking.
- Online gateway (Razorpay) as an optional third payment method.

## 5. Main data tables

`User`, `Shop`, `ShopStaff`, `Category`, `Item`, `ItemVariant`, `ItemImage`,
`StockMovement`, `Offer`, `Coupon`, `Cart`, `CartItem`, `Address`,
`Order`, `OrderItem`, `OrderStatusEvent`, `UpiPayment` (order, amount, UTR, screenshot, status, verified by, verified at),
`SupportTicket`, `SupportMessage`, `Notification`.

## 6. Build order

| Phase | Work | Rough effort (one developer) |
|---|---|---|
| 1 | Project setup, login, Google and Microsoft sign-in, roles | 1 to 2 weeks (days with ASP.NET Zero) |
| 2 | Shops, categories, items, photos | 1.5 to 2 weeks |
| 3 | Customer browsing, search, cart, addresses | 1.5 to 2 weeks |
| 4 | Checkout, COD, UPI verification flow | 1 to 1.5 weeks |
| 5 | Orders, delivery timeline, notifications | 1 to 1.5 weeks |
| 6 | Inventory, offers and coupons | 1.5 to 2 weeks |
| 7 | Dashboard, support, receipts | 1 to 1.5 weeks |
| 8 | Mobile packaging, testing, store release | 1 to 2 weeks |

Estimates are rough and assume familiarity with C# and Angular.

## 7. Costs to expect

- Google Play developer account: one-time fee. Apple developer account: yearly fee.
- Server and database hosting.
- ASP.NET Zero license, if you don't already have one.
- SMS, only if you add phone OTP.
- Google and Microsoft sign-in, Firebase push, and manual UPI are free.

## 8. Open decisions

1. ASP.NET Zero or plain ASP.NET Core as the base?
2. Platforms for launch: Android + web first, iOS later?
3. One shop per order, or a cart spanning several shops?
4. Should new shops need platform admin approval before going live?
