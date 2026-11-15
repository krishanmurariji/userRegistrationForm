# Running the API from your own PC with a Cloudflare Tunnel

The API, its PostgreSQL database and your uploaded pictures run in Docker on your Windows PC. **Cloudflare Tunnel**
(free) gives it a public `https://` address without opening any port on your router, and works even when your
internet provider hides your IP.

**Status:** the code was tested locally (152 tests; the published API was run in Production mode, created a fresh
database, seeded the admin, logged in and answered `/health`), and the compose file validates in both modes. The
Docker images, Docker Desktop on Windows and the Cloudflare steps could not be run in the development environment,
so expect small fixes on the first run and send me the output of any command that fails.

## Be clear about what this means

- **The PC must be on, awake and online whenever customers use the app.** If it is off, the app cannot sign in or
  order. Set Windows power settings to "never sleep" (plugged in), and let it start Docker after a reboot.
- **A domain name is needed** for a permanent address. The tunnel itself is free, but a domain costs a few dollars a
  year (a `.xyz` or `.in` is often 1 to 8 USD; Cloudflare sells `.com` at cost, about 10 USD). Cloudflare's free
  "quick tunnels" give a random address that changes every restart, which cannot be baked into a release build.
- **Your PC's disk holds everything** (customers, orders, pictures). Run the backup script and copy backups to
  another place (USB drive, cloud drive).
- For a real shop with real customers a 4 to 6 USD a month server is steadier than a home PC (see the end).

## Step 1: Docker on the PC

1. Install **Docker Desktop** (docker.com). Accept the WSL 2 option. Restart when asked.
2. Docker Desktop, Settings, General: tick **Start Docker Desktop when you sign in**.
3. Install **Git for Windows** if you do not have it.

## Step 2: a domain on Cloudflare

1. Create a free account at cloudflare.com.
2. Either buy a domain there (Domain Registration, Register domains), or add a domain you already own
   (Add a site, and change its nameservers at your registrar to the two Cloudflare gives you).

## Step 3: create the tunnel

1. Open one.dash.cloudflare.com (Zero Trust). Choose the free plan if it asks. It may ask for a payment method; the
   free plan is not charged.
2. **Networks, Tunnels, Create a tunnel, Cloudflared**. Name it `smallmart`.
3. On the install page, copy the long **token** (the text after `--token`). Do not run the shown install command; the
   token is all you need.
4. **Public hostname** tab, add one:
   - Subdomain `api`, domain: yours (so the address is `https://api.yourdomain.com`)
   - Service type `HTTP`, URL `api:8080`
5. Save.

## Step 4: start Small Mart

In PowerShell:

```bash
git clone https://github.com/krishanmurariji/userRegistrationForm.git smallmart
cd smallmart\deploy
copy .env.example .env
notepad .env
```

Fill in `.env`: `TUNNEL_TOKEN` (from step 3), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `CLIENT_URL` (your API address for
now), and generate the two secrets with these commands, pasting each result into `.env`:

```bash
$b = New-Object byte[] 16; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { $_.ToString('x2') })
$b = New-Object byte[] 36; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

The first is `DB_PASSWORD`, the second is `JWT_KEY`. Never lose or change `JWT_KEY` later (everyone would be signed
out). Leave `COMPOSE_PROFILES=tunnel` and `DOMAIN` empty. If the repository is private, sign in to Git when it asks.

Then start it (the first build takes several minutes):

```bash
docker compose up -d --build
docker compose ps
```

## Step 5: check

Open `https://api.yourdomain.com/health` in a browser (from your phone's mobile data too). You should see
`{"status":"ok"}`. **That address is your API address**: use it as `api_url` in the Release workflow
([RELEASING.md](RELEASING.md)).

If it does not work: `docker compose logs cloudflared api`. "Bad gateway" usually means the public hostname service
is not exactly `http://api:8080`, or the API is still starting.

## Operating

```bash
cd smallmart\deploy
.\update.ps1                 # get the newest code and restart
docker compose logs -f api   # watch the logs
.\backup.ps1                 # database + pictures into deploy\backups (keeps 14 days)
```

Daily backup: Task Scheduler, Create Basic Task, Daily 3:00, Action "Start a program": program `powershell.exe`,
arguments `-ExecutionPolicy Bypass -File C:\path\to\smallmart\deploy\backup.ps1`. Copy `deploy\backups` somewhere
else regularly.

Tables are created and updated automatically when the API starts.

## Moving to a server later

The same files run on any Ubuntu server with a public IP: set `COMPOSE_PROFILES=server` and `DOMAIN` in `.env`,
run `sudo bash deploy/setup.sh`, then `docker compose up -d --build`. Caddy gets the HTTPS certificate itself, and
`deploy/update.sh` and `deploy/backup.sh` replace the PowerShell scripts. Choices:

- A small paid server (Hetzner or DigitalOcean, 4 to 6 USD a month) is the steadiest.
- Google Cloud's Always Free e2-micro (US regions only, 1 GB) is free, but sources disagree on whether its public
  IPv4 address is charged, so check Google's current pricing before relying on it
  ([one review](https://bestusavps.pages.dev/reviews/google-cloud)).
- Oracle Cloud Always Free works too if you have not used its allowance.
