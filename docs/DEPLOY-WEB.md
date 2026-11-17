# Putting the web version online (Cloudflare Pages, free)

The web version is the same Angular app the Android, iOS and Windows apps are built from. It must be online because
the links in confirmation and password-reset emails open it. Cloudflare Pages hosts it for free (commercial use
allowed, no bandwidth limit) and rebuilds it by itself whenever you push to `master`.

The app already talks to `https://smallmart-api.runasp.net` (set in `app/src/environments/environment.ts`).

**Status:** the production build was checked locally. The Cloudflare steps have not been run yet.

## Step 1: create the site

1. Sign in at dash.cloudflare.com (a free account is enough).
2. **Workers & Pages**, **Create**, **Pages**, **Connect to Git**. Connect GitHub and pick `userRegistrationForm`.
3. Settings:
   | Setting | Value |
   |---|---|
   | Production branch | `master` |
   | Framework preset | None |
   | Root directory | `app` |
   | Build command | `npm ci && npx ng build --configuration production` |
   | Build output directory | `dist/app/browser` |
4. **Environment variables**, add `NODE_VERSION` = `24` (Angular needs Node 24).
5. **Save and Deploy**. The first build takes a few minutes. You get an address like `https://smallmart.pages.dev`.

Links such as `/orders` work on refresh: Cloudflare Pages serves `index.html` for unknown paths when the site has
no `404.html`, which this app does not.

### If Cloudflare offers you a Worker instead of Pages

Cloudflare may open "Set up your application" for a **Worker** (with build and deploy commands). That works too:
`app/wrangler.jsonc` tells the Worker to serve the built app.

| Setting | Value |
|---|---|
| Project name | `smallmart-web` |
| Build command | `npm ci && npx ng build --configuration production` |
| Deploy command | `npx wrangler deploy` |
| Advanced settings, path / root directory | `app` |
| Advanced settings, build variable | `NODE_VERSION` = `24` |

Your address is then `https://smallmart-web.YOUR-NAME.workers.dev`.

## Step 2: tell the API about the web address

GitHub, **Settings**, **Secrets and variables**, **Actions**, **Variables** tab, add:

| Variable | Value |
|---|---|
| `API_CLIENT_URL` | your web address, for example `https://smallmart.pages.dev` (email links point here) |
| `API_ALLOWED_ORIGINS` | the same address (lets the website call the API) |

Then run **Actions**, **Deploy API** again.

## Step 3: Google and Microsoft sign-in on the website

The buttons only work from addresses you registered with Google and Microsoft:

- **Google Cloud Console**, APIs & Services, Credentials, your OAuth client: add the web address to
  **Authorized JavaScript origins**.
- **Microsoft Entra (Azure portal)**, App registrations, your app, Authentication, **Single-page application**:
  add `https://YOUR-ADDRESS/msal-redirect` as a redirect URI.

## Check

Open the web address, register a new customer, and confirm the email: the link in the email should open the website
and confirm the account.
