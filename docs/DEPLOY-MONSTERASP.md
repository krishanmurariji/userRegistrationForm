# Deploying the API to MonsterASP.NET (free, no card)

MonsterASP.NET hosts ASP.NET apps on Windows servers. Its free plan needs no card. A GitHub Actions workflow in this
repository, **Deploy API**, builds the API and sends it there with Web Deploy.

**Status:** the publish output and the settings file were tested locally (the published API started in Production
mode, created a fresh database, seeded the admin and logged in). The workflow itself and MonsterASP.NET's servers
have not been tried yet, so expect small fixes on the first run.

## What the free plan gives (from their site; check their pricing page)

- 1 website, 256 MB memory, 5 GB disk, .NET 10, a free `https://...runasp.net` address with HTTPS.
- 1 database of 1 GB.
- Not included: your own domain name.
- Not confirmed: whether the site is stopped when idle, and whether it may connect to a database outside
  MonsterASP.NET. The first deploy tells us.

Uploaded pictures are stored on the site's disk (`App_Data`), and a deploy never deletes them.

## Step 1: create the website

1. In the control panel: **Create new service**, **Website**, the **Free** plan.
2. Open the new website. Note its **address** (like `https://yourname.runasp.net`).
3. If it lets you choose, set the runtime to **.NET 10** (ASP.NET Core).
4. On the website's page open the **Visual Studio access** tab and set it to **Enabled**. Note the four values:
   | Value | Looks like | Secret name on GitHub |
   |---|---|---|
   | Website name | `site12345` | `MONSTERASP_WEBSITE_NAME` |
   | Server | `site12345.siteasp.net` (the workflow adds `https://` and port `8172` itself) | `MONSTERASP_SERVER` |
   | Login | `site12345` | `MONSTERASP_USERNAME` |
   | Password | shown or set in the panel | `MONSTERASP_PASSWORD` |

   These are also inside the downloadable publish profile file, as `msdeploySite`, `publishUrl` (the part before
   `:8172`), `userName` and `userPWD`.

## Step 2: choose the database

**Option A, PostgreSQL at MonsterASP.NET** (simplest if the free plan offers it): **Create new service**,
**Database**, choose **PostgreSQL**. Use the "local" connection details it shows, as one line:

```
Host=THE_HOST;Port=5432;Database=THE_DATABASE;Username=THE_USER;Password=THE_PASSWORD
```

**Option B, your Supabase database:** Supabase, **Connect**, **Session pooler**:

```
Host=aws-0-ap-south-1.pooler.supabase.com;Port=5432;Database=postgres;Username=postgres.abcdefghijk;Password=YOUR_PASSWORD;SSL Mode=Require;Trust Server Certificate=true
```

The app needs PostgreSQL. MSSQL and MySQL will not work.

## Step 3: add the secrets on GitHub

Repository, **Settings**, **Secrets and variables**, **Actions**, **New repository secret**. Never put these in chat
or in a file in the repository.

| Secret | Value |
|---|---|
| `MONSTERASP_WEBSITE_NAME`, `MONSTERASP_SERVER`, `MONSTERASP_USERNAME`, `MONSTERASP_PASSWORD` | from step 1 |
| `API_CONNECTION_STRING` | the line from step 2 |
| `API_JWT_KEY` | 32+ random characters; never change it later (everyone would be signed out) |
| `API_ADMIN_EMAIL`, `API_ADMIN_PASSWORD` | your platform admin login (password: 8+ characters with a digit) |

Make an `API_JWT_KEY` in PowerShell:

```bash
$b = New-Object byte[] 36; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

Optional secrets: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL` (real emails; Zoho is
`smtp.zoho.in`, port 587) and `OPENAI_API_KEY` (adding items from a photo).

On the **Variables** tab (not secrets): `API_URL` = your website address from step 1. The workflow uses it to check
that the API answers after a deploy, and the Release workflow uses it for the apps. Optional: `API_CLIENT_URL` (where
the web app lives, used in email links) and `API_ALLOWED_ORIGINS` (addresses of a web version, comma separated).

## Step 4: deploy

GitHub, **Actions**, **Deploy API**, **Run workflow**. When it is green, open `https://yourname.runasp.net/health`.
You should see `{"status":"ok"}`. That address is your API address.

Run the same workflow again whenever you want to publish new code.

## If it does not work

- **The workflow fails at "Send it to the server":** a Web Deploy value is wrong, or Web Deploy is not activated
  in the control panel.
- **The files arrive but the site shows an error (500.30 or similar):** run the workflow again with
  **startup logs** ticked, then open the `logs` folder with the control panel's file manager and read the newest
  file. Send me the error lines, without passwords. Run once more with the box unticked when it is fixed.
- **Database errors in that log:** the connection string is wrong, or (Option B) the free plan does not allow
  connections to an outside database. Then use Option A.
- **Out of memory:** 256 MB is small. Tell me and I will trim the app's memory use further.
