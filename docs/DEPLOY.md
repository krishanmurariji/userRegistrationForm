# Deploying the API for free on Northflank (always on) with a Supabase database

**Why Northflank:** in a search of current free hosts, its free "Developer Sandbox" is the one that runs services
**without sleeping**: up to 2 services, 1 database and 2 jobs, built straight from your GitHub repository and your
`backend/Dockerfile`. Render, Zeabur and Koyeb's free plans sleep or scale to zero, and Koyeb's free plan is
reported to need a card and may be closed to new users.

**Status, read this first:** nothing here was run. Free-tier terms change often and the sources disagree, so
confirm on [Northflank's pricing page](https://northflank.com/pricing) before you start:

- A **payment card is needed** to create a service (seen on 17 Nov 2026: "Creating this service requires a card.
  You will not be charged for this service."). For a route with no card see [DEPLOY-MONSTERASP.md](DEPLOY-MONSTERASP.md).
- Northflank describes the sandbox as for hobby projects and testing, **not production**. It is good for trying the
  app with real people; plan a small paid plan for a busy shop.
- I found no per-service memory or CPU numbers. The API is small, but if it runs out of memory pick the largest
  size the sandbox allows.
- Sources: [Northflank pricing](https://northflank.com/pricing), [agentdeals summary](https://agentdeals.dev/vendor/northflank),
  [freetier.co comparison](https://freetier.co/compare/koyeb-vs-northflank).

## Step 1: the database (Supabase, free)

1. Supabase, your project, **Connect**, **Session pooler** (not Direct: that one is IPv6 only).
2. Make the connection string (one line):
   ```
   Host=aws-0-ap-south-1.pooler.supabase.com;Port=5432;Database=postgres;Username=postgres.abcdefghijk;Password=YOUR_PASSWORD;SSL Mode=Require;Trust Server Certificate=true
   ```
   (a password with `;` or `=` goes in double quotes.)

Supabase's free database is 500 MB and pauses after a week with no use. Pictures are stored in it too (see below).

## Step 2: the API on Northflank

1. Sign up at northflank.com with GitHub. Create a project (the free plan offers US - Central and Europe - West; the Asia regions need a paid plan).
2. **Create new, Service, Combined service** (build and deploy):
   - Repository: this repository, branch `master` (merge `release-pipeline` first).
   - Build: **Dockerfile**, Dockerfile location `/backend/Dockerfile`, build context `/backend`.
   - Port: `8080`, protocol **HTTP**, tick **Publish this port to the internet** (this gives you the `https://` address).
   - Health check (if offered): HTTP path `/health` on port 8080.
3. **Runtime variables** (mark the secret ones as secret):

   | Name | Value |
   |---|---|
   | `ASPNETCORE_ENVIRONMENT` | `Production` |
   | `ConnectionStrings__Default` | the string from step 1 (secret) |
   | `Database__MigrateOnStartup` | `true` |
   | `Storage__Provider` | `Database` (the free service has no kept disk; pictures go into the database) |
   | `App__DisableHttpsRedirect` | `true` |
   | `Jwt__Key` | 32+ random characters (secret). Never change it later. |
   | `Seed__AdminEmail`, `Seed__AdminPassword` | your platform admin login (secret) |
   | `App__ClientUrl` | the public address Northflank shows you (you can edit it after the first deploy) |

   Make a `Jwt__Key` in PowerShell:
   ```bash
   $b = New-Object byte[] 36; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
   ```
4. Create the service. The first build takes 5 to 10 minutes.

## Step 3: check

Open `https://<your-service-address>/health`. You should see `{"status":"ok"}`. **That address is your API address**:
use it as `api_url` in the Release workflow ([RELEASING.md](RELEASING.md)). Updates deploy by themselves when you
push to `master` if you enabled that in the service's build settings.

Optional variables, same place: `Smtp__Host`, `Smtp__Port`, `Smtp__Username`, `Smtp__Password`, `Smtp__FromEmail`
(real emails; Zoho is `smtp.zoho.in`, port 587) and `Ai__OpenAiApiKey` (adding items from a photo).

## If it does not work

- Service logs on Northflank. A first-run line mentioning `__EFMigrationsHistory` is normal.
- "Jwt:Key must be set": the `Jwt__Key` variable is missing.
- Database connection errors: use the Session pooler string and keep `SSL Mode=Require`.
- Out of memory or restarts: increase the service size, or reduce load.

## Other ways

- [DEPLOY-MONSTERASP.md](DEPLOY-MONSTERASP.md): MonsterASP.NET, free with **no card** (Northflank turned out to need a card to create a service).
- [DEPLOY-PC.md](DEPLOY-PC.md): run it on your own Windows PC with a Cloudflare Tunnel (needs a domain, PC always on).
- The same Docker files run on any Ubuntu server (`COMPOSE_PROFILES=server`), for example a 4 to 6 USD a month
  Hetzner or DigitalOcean machine, which is the steadiest option once real customers depend on the app.
