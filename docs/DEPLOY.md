# Deploying the API for free, always on (Oracle Cloud Always Free)

Free services that sleep (Render, Koyeb and similar) are not good for a shop: the first customer of the day waits a
minute. Oracle Cloud's **Always Free** tier gives you a real small server that stays on 24 hours a day, with a disk
that is kept, at no cost. This guide runs everything on that one server:

- the **API** (this repository's `backend/`),
- its **PostgreSQL** database (kept on the server's disk, with a backup script),
- **Caddy**, which gets a free HTTPS certificate for you automatically,
- uploaded pictures on the server's disk.

**Status:** the code was tested locally (152 tests; the published API was run in Production mode, created a fresh
database, seeded the admin, logged in and answered `/health`). The compose file passes `docker compose config`.
The Docker images and the steps on Oracle could not be run in the development environment, so expect to fix small
things on the first deploy and send me the output of any failing command.

## What you need

- A phone number and a **credit or debit card for identity verification** (Oracle does not charge it for Always Free
  resources; some Indian cards are refused, a virtual card often works).
- 45 minutes.
- Windows PowerShell has `ssh` built in, nothing to install.

## Step 1: create the server

1. Sign up at oracle.com/cloud/free. Choose a **home region near your customers** (for India: Mumbai or Hyderabad).
   You cannot change the region later.
2. In the console: **Compute, Instances, Create instance**.
   - Image: **Ubuntu 24.04** (or 22.04).
   - Shape: **Ampere, VM.Standard.A1.Flex**, 2 OCPU and 12 GB memory (the free allowance is up to 4 OCPU and 24 GB).
     If it says "Out of host capacity", try again later or in another availability domain, or choose the AMD shape
     **VM.Standard.E2.1.Micro** (1 GB, enough for a small shop; the setup script adds swap).
   - Networking: keep the defaults and make sure **Assign a public IPv4 address** is on.
   - SSH keys: **Generate a key pair** and download the private key (keep it safe, you cannot download it again).
3. When it is running, copy the **Public IP address**.
4. Open the web ports. Instance page, **Subnet, Default security list, Add ingress rules**: source `0.0.0.0/0`,
   TCP, destination port `80`; add a second rule for port `443`. (Without this nothing from the internet reaches the
   server.)
5. Optional but wise: Oracle can reclaim Always Free servers that sit almost idle for 7 days. Upgrading the account to
   "Pay as you go" removes that risk, and you are still not charged while you stay inside the free limits.

## Step 2: a free address

HTTPS certificates need a name, not a bare IP.

1. Go to duckdns.org, sign in, create a name such as `mysmallmart`, and set its IP to the server's public IP.
2. Your address is `mysmallmart.duckdns.org`. (Your own domain works the same: point an A record at the IP.)

## Step 3: set up the server

In PowerShell on your computer (use your downloaded key's path and your IP):

```bash
ssh -i C:\path\to\ssh-key.key ubuntu@YOUR_SERVER_IP
```

On the server:

```bash
git clone https://github.com/krishanmurariji/userRegistrationForm.git smallmart
cd smallmart
sudo bash deploy/setup.sh
cd deploy
cp .env.example .env
nano .env
```

Fill in `.env` (Ctrl+O, Enter, Ctrl+X to save in nano). You can make the random values with:

```bash
openssl rand -hex 16      # for DB_PASSWORD
openssl rand -base64 36   # for JWT_KEY
```

| Name | Value |
|---|---|
| `DOMAIN` | `mysmallmart.duckdns.org` |
| `DB_PASSWORD`, `JWT_KEY` | the random values above |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | your platform admin login (8+ characters, with a digit) |
| the rest | optional: email (Zoho), OpenAI key |

If the repository is private, clone with a GitHub personal access token (`https://TOKEN@github.com/...`).

Start everything (the first build takes several minutes):

```bash
docker compose up -d --build
docker compose ps
```

## Step 4: check

Open `https://mysmallmart.duckdns.org/health`. You should see `{"status":"ok"}`. **That `https://...` address is your
API address.** Use it as `api_url` in the Release workflow (see [RELEASING.md](RELEASING.md)).

The first request may wait a few seconds while Caddy gets the certificate. If it fails, run
`docker compose logs caddy api` and check that ports 80 and 443 are open in step 1.4.

## Updating and operating

```bash
cd ~/smallmart && bash deploy/update.sh        # get the newest code and restart
cd ~/smallmart/deploy && docker compose logs -f api   # watch the logs
bash ~/smallmart/deploy/backup.sh              # backup now (database + pictures) into ~/smallmart-backups
```

Backup daily: `crontab -e`, add `0 3 * * * bash /home/ubuntu/smallmart/deploy/backup.sh`. Copy the backups off the
server now and then (for example with `scp`), because a backup on the same server does not protect you if the
server is lost.

The database tables are created and updated automatically each time the API starts. Never lose `JWT_KEY`: it signs
everyone's login tokens.

## Other free always-on options

- **Google Cloud e2-micro** ("Always Free", US regions only, 1 GB): the same files work on it, only step 1 differs.
- **Azure App Service Free (F1)** and similar plans have a daily CPU allowance and idle out, so they are not good
  for a shop.
- If you would rather pay a little for less work: a 4 to 6 USD per month server (Hetzner, DigitalOcean) uses these
  same files.
