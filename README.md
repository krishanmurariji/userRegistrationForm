# Small Mart

A cross-platform app for small shops: owners create shops and list items, customers browse, order and pay
by cash on delivery or UPI. See [PLAN.md](PLAN.md) for the full feature plan and build phases.

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Backend: accounts, sign-in, Google/Microsoft sign-in, roles | Done, tested |
| 1 | App: sign-in, register, password reset and email confirmation screens | Done, tested in a browser |
| 1 | App: Google and Microsoft sign-in buttons (web) | Built; real sign-in not yet confirmed end to end |
| 2 | Shops, categories, items with photos (API and app screens) | Done, tested |
| 2 | Item variants, staff invites, opening hours, Excel import | Not started |
| Admin | Roles (customer, shop owner, admin), admin section: users, shops, activity log | Done, tested |
| 3+ | Customer browsing, cart, payments, orders, inventory | Not started |

## Who can do what

| Role | How the account is created | What it can do |
|---|---|---|
| Customer | Signing up in the app (email, Google or Microsoft) | Shop and order (coming in phase 3) |
| Shop owner | Only by the platform admin: a new account, or by promoting a customer | Open shops and manage their items |
| Platform admin | Only by the startup seed (`Seed:AdminEmail`, `Seed:AdminPassword`) | The admin section |

The admin section (`/admin` in the app) has an overview with headline numbers, a user list (add shop owner,
make or remove shop owner, suspend, reactivate), a shop list (deactivate, activate) and an activity log of
sign-ins and admin actions. A deactivated shop is read-only for its owner. A suspended user is signed out
and cannot sign in, including through Google, Microsoft or a password reset.

A role change reaches a signed-in user within 15 minutes, or at once if they sign out and in again.

## App (`app/`)

Angular, Ionic and Capacitor. See [app/README.md](app/README.md).

## Backend (`backend/`)

ASP.NET Core 10 Web API, EF Core, PostgreSQL, ASP.NET Core Identity.

### Run it

Needs the .NET 10 SDK and PostgreSQL 14+ on `localhost:5432` (user `postgres`, password `postgres`).

If your PostgreSQL password differs, do not edit the committed settings files. Create
`backend/src/SmallMart.Api/appsettings.Local.json` (ignored by Git) with your own connection string:

```json
{
  "ConnectionStrings": {
    "Default": "Host=localhost;Database=smallmart_dev;Username=postgres;Password=YOUR_PASSWORD"
  }
}
```

```bash
cd backend
dotnet run --project src/SmallMart.Api --launch-profile http
```

The database `smallmart_dev` is created on first run. A development admin is seeded:
`admin@smallmart.local` / `Admin12345`. API description: `http://localhost:5028/openapi/v1.json`.

Without SMTP settings, confirmation and reset emails are written to the console log instead of being sent.

### Test it

```bash
cd backend
dotnet test
```

Tests run the real API against a throwaway PostgreSQL database. Set `SMALLMART_TEST_DB`
(for example `Host=localhost;Username=me;Password=secret`) to use a different server.

### Endpoints

| Method and path | Purpose |
|---|---|
| `POST /api/auth/register` | Create an account, sends a confirmation email |
| `POST /api/auth/confirm-email` | Confirm with the emailed user id and token |
| `POST /api/auth/resend-confirmation` | Send the confirmation email again |
| `POST /api/auth/login` | Email + password, returns access and refresh tokens |
| `POST /api/auth/refresh` | Swap a refresh token for a new pair |
| `POST /api/auth/logout` | End the session of a refresh token |
| `POST /api/auth/forgot-password` | Email a reset link |
| `POST /api/auth/reset-password` | Set a new password, signs out everywhere |
| `POST /api/auth/external/google` | Sign in with a Google ID token |
| `POST /api/auth/external/microsoft` | Sign in with a Microsoft ID token |
| `GET /api/auth/me` | Current user (needs access token) |

Platform admin only:

| Method and path | Purpose |
|---|---|
| `GET /api/admin/stats` | Dashboard numbers |
| `GET /api/admin/users` | Users (`?search=`, `?role=`, `?suspended=`, `?skip=`, `?take=`) |
| `POST /api/admin/users/shop-owners` | Create a shop owner (optional starting password, otherwise an email invite) |
| `POST/DELETE /api/admin/users/{id}/shop-owner` | Give or take away the shop owner role |
| `POST /api/admin/users/{id}/suspend`, `/unsuspend` | Block or unblock an account |
| `GET /api/admin/shops` | All shops (`?search=`, `?active=`) |
| `POST /api/admin/shops/{id}/deactivate`, `/activate` | Freeze or restore a shop |
| `GET /api/admin/audit-logs` | Activity log (`?search=`, `?action=` prefix such as `shop.`) |

Shop management (signed-in members of the shop only; others get 404):

| Method and path | Purpose |
|---|---|
| `GET /api/shops/mine` | Shops the user owns or works in |
| `POST /api/shops`, `GET/PUT /api/shops/{id}` | Create (shop owners only), read, update a shop |
| `POST /api/shops/{id}/logo` | Upload the logo (form field `file`) |
| `GET/POST /api/shops/{id}/categories`, `PUT/DELETE .../{categoryId}` | Categories |
| `GET/POST /api/shops/{id}/items`, `GET/PUT/DELETE .../{itemId}` | Items (`?search=`, `?categoryId=`) |
| `POST /api/shops/{id}/items/{itemId}/image` | Upload the item photo (form field `file`) |

Pictures must be JPEG, PNG or WebP up to 5 MB. They are stored under `App_Data/uploads` (set `Storage__Root`
to a persistent folder in production) and served from `/files/...`.

Errors are `application/problem+json` with a machine-readable `code` (for example `invalid_credentials`,
`email_not_confirmed`, `locked_out`, `account_exists`).

### Security behaviour

- Passwords: minimum 8 characters with a digit and a lowercase letter, hashed by ASP.NET Core Identity.
- Five wrong passwords lock the account for 15 minutes.
- Email must be confirmed before password sign-in.
- Access tokens last 15 minutes. Refresh tokens last 30 days, are stored hashed, and rotate on every use.
  Reusing an old refresh token ends that session.
- Register, forgot-password and resend-confirmation answer the same way whether or not the email exists.
- Google/Microsoft accounts are matched by the provider's account id. They attach to an existing account
  by email only when the provider verified the email and the existing account's email is confirmed.
- Sign-in endpoints are rate-limited per IP (default 60 requests a minute).

### Configuration for production

Set these with environment variables or a secret store, never in committed files:

| Setting | Notes |
|---|---|
| `ConnectionStrings__Default` | PostgreSQL connection string |
| `Jwt__Key` | Random secret, 32+ characters |
| `App__ClientUrl` | Public URL of the app, used in email links |
| `App__AllowedOrigins__0`, `__1`, ... | Origins allowed to call the API |
| `Authentication__Google__ClientIds__0`, ... | Google OAuth client ids (web, Android, iOS) |
| `Authentication__Microsoft__ClientIds__0`, ... | Microsoft Entra application (client) ids |
| `Smtp__Host`, `Smtp__Port`, `Smtp__Username`, `Smtp__Password`, `Smtp__FromEmail` | Email delivery |
| `Seed__AdminEmail`, `Seed__AdminPassword` | Creates the first platform admin once |
| `Database__MigrateOnStartup` | `true` to apply migrations at startup |

Behind a reverse proxy, add forwarded-headers handling so the rate limiter sees the real client IP.

### Google and Microsoft sign-in setup

The client ids are in `appsettings.json` (API) and `app/src/environments/` (app). They are public
identifiers; no client secret is used. Each provider must also know the app's address:

- **Google Cloud console** → the OAuth client → *Authorized JavaScript origins*: add `http://localhost:8100`
  and later the production address.
- **Microsoft Entra admin center** → the app registration → *Authentication* → add a
  *Single-page application* redirect URI: `http://localhost:8100/msal-redirect` (and later the production one).
  If the registration is limited to one organisation, set `microsoftTenant` in `app/src/environments/`
  to that tenant id instead of `common`.

### Not yet verified

A complete sign-in with a real Google or Microsoft account has not been run: it needs a person to sign in
on a machine whose address is registered with the provider. Checked so far: both buttons render,
Microsoft's window opens with the right client id and return address, invalid tokens are refused by the
API, and the account-linking rules are covered by tests with a fake validator.
Real SMTP delivery is likewise untested.
