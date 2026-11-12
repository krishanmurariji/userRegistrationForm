# Small Mart

A cross-platform app for small shops: owners create shops and list items, customers browse, order and pay
by cash on delivery or UPI. See [PLAN.md](PLAN.md) for the full feature plan and build phases.

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Backend: accounts, sign-in, Google/Microsoft sign-in, roles | Done, tested |
| 1 | App: Ionic + Angular sign-in screens | Not started |
| 2+ | Shops, items, cart, payments, orders, inventory | Not started |

## Backend (`backend/`)

ASP.NET Core 10 Web API, EF Core, PostgreSQL, ASP.NET Core Identity.

### Run it

Needs the .NET 10 SDK and PostgreSQL 14+ on `localhost:5432` (user `postgres`, password `postgres`;
change the connection string in `appsettings.Development.json` if yours differs).

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
| `GET /api/admin/users` | List/search users (platform admin) |
| `POST /api/admin/users/{id}/suspend`, `/unsuspend` | Block or unblock an account (platform admin) |

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
- Sign-in endpoints are rate-limited per IP (default 20 requests a minute).

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

### Not yet verified

Google and Microsoft token validation (`Auth/ExternalAuth.cs`) compiles and follows each provider's
documented checks, but has not been exercised with real tokens: that needs OAuth client ids from the
Google Cloud and Microsoft Entra consoles. The tests cover the account-linking rules with a fake validator.
Real SMTP delivery is likewise untested.
