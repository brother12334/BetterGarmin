# Cloud sync (optional)

> Cloud sync needs your own copy of the repo. Set that up first with
> [self-hosting.md](self-hosting.md). If something fails, see
> [troubleshooting.md](troubleshooting.md#cloud-sync).

By default, BetterGarmin is 100% local: you run GarminDB yourself and drop the
resulting files in. **Cloud sync is a separate, opt-in feature** that
automates that step — a scheduled job fetches your Garmin data on its own and
BetterGarmin pulls it in automatically, with no manual file drops.

Read the "What this changes about privacy" section before setting this up.
It's a real, meaningful tradeoff, not a formality.

## What this changes about privacy

The rest of this app (manual file loading, demo mode) keeps the original
promise: nothing ever leaves your computer. Cloud sync **breaks that
promise on purpose**, because there's no way to have a scheduler reach out to
Garmin on your behalf without a server that can act as you:

- **Your Garmin Connect username and password are stored as GitHub Actions
  secrets** on your repository. GitHub encrypts secrets at rest and only
  exposes them to workflow runs you control, but you are trusting GitHub
  with your Garmin login.
- **Your health data passes through your own Cloudflare account** (R2
  storage + a Worker) on its way from Garmin to your browser.
- Access to your synced data is gated by a single **bearer token**, not a
  real multi-user login. Anyone who has your Worker URL and token can read
  everything in your bucket. Treat the token like a password — don't post it,
  don't commit it to the repo, and if it ever leaks, rotate it (see below).
- This is sized for **one person's own use**, not a shared product. There's
  no per-user isolation because there's only one user: you.

If you'd rather not accept that, skip this — manual file loading and demo
mode remain fully local and don't require any of this setup.

## What it costs

Free, at the scale one person's data needs:

- **GitHub Actions**: unlimited free minutes on a public repo.
- **Cloudflare R2**: free tier is 10 GB storage with no egress fees — a few
  GarminDB `.db` files are a rounding error against that.
- **Cloudflare Workers**: free tier is 100,000 requests/day.

No credit card is required for either GitHub's public-repo Actions or
Cloudflare's free tier at the time of writing, though Cloudflare has asked
for card verification on some accounts in the past — if it does, you can
still stay on the free plan.

## How it works

1. A GitHub Actions workflow (`.github/workflows/sync-garmin-data.yml`) runs
   on a schedule (every 30 minutes by default). It restores your last synced database
   files from R2, runs the real `garmindb_cli.py --latest` to pull anything
   new from Garmin Connect, and uploads the updated files back to R2.
2. A small Cloudflare Worker (`worker/`) sits in front of that R2 bucket. It
   checks a bearer token on every request and serves `/manifest` (a file
   listing) and `/files/:name` (the actual `.db` files).
3. BetterGarmin's **More → Cloud sync** (or the "Set up automatic sync" step
   during onboarding) connects to that Worker with its URL and your token,
   downloads the files the same way manual file loading would, and checks
   back every few minutes (and whenever you return to the tab) for anything
   newer.

Garmin itself only syncs your watch to its cloud when your phone syncs over
Bluetooth — so "automatic" here means "as fresh as Garmin's own data gets,
checked roughly every hour," not literally real-time.

## Setup

> **Easiest:** open your BetterGarmin and choose **Set up automatic sync (guided)**
> on the welcome screen, or **More → Cloud sync → Set up automatic sync**. The
> in-app wizard walks through every step below with direct links, copy buttons,
> a generated access token and the Worker code built in. The rest of this
> section is the same process written out.

### 1. Create a Cloudflare account and R2 bucket

1. Sign up at [dash.cloudflare.com](https://dash.cloudflare.com) (free).
2. Go to **R2 Object Storage** → **Create bucket**. Name it anything, e.g.
   `bettergarmin-data`.

### 2. Deploy the Worker

From the repo, on your own machine:

```sh
cd worker
npm install
npx wrangler login
```

Edit `worker/wrangler.toml`:
- Set `bucket_name` to the R2 bucket you just created.
- Set `ALLOWED_ORIGIN` to your deployed BetterGarmin URL (no trailing slash),
  e.g. `https://your-username.github.io`.

Generate a random access token and set it as a Worker secret (don't put it in
`wrangler.toml` — it stays out of the repo this way):

```sh
openssl rand -hex 32    # copy this value, you'll need it in step 4 too
npx wrangler secret put ACCESS_TOKEN
# paste the value when prompted
```

Deploy it:

```sh
npx wrangler deploy
```

This prints your Worker's URL, something like
`https://bettergarmin-sync.your-subdomain.workers.dev`. Save it.

**No computer? Deploy from the dashboard instead:** Workers & Pages → Create →
Worker (Hello World) → name it `bettergarmin-sync` → Deploy → Edit code, replace
everything with the contents of `worker/dashboard-worker.js`, Deploy. Then in
the Worker's **Settings → Bindings** add an **R2 bucket** binding named
`DB_BUCKET` → your bucket, and in **Settings → Variables and Secrets** add a
**Secret** `ACCESS_TOKEN` (a long random string, e.g. from a password manager)
and a **Text** variable `ALLOWED_ORIGIN` = your BetterGarmin URL.

### 3. Create R2 API credentials for GitHub Actions

In the Cloudflare dashboard: **R2** → **Manage R2 API Tokens** → **Create API
Token**. Give it **Object Read & Write** permission, scoped to your bucket if
possible. Save the **Access Key ID**, **Secret Access Key**, and your
**Account ID** (shown on the R2 overview page).

### 4. Add GitHub repository secrets

In your repo: **Settings → Secrets and variables → Actions → New repository
secret**. Add:

| Secret | Value |
|---|---|
| `GARMIN_USERNAME` | Your Garmin Connect email/username |
| `GARMIN_PASSWORD` | Your Garmin Connect password |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | From step 3 |
| `R2_SECRET_ACCESS_KEY` | From step 3 |
| `R2_BUCKET_NAME` | Your R2 bucket name |

Optional **repository variable** (same screen, "Variables" tab):

| Variable | Value |
|---|---|
| `SYNC_START_DATE` | How far back to backfill on the very first sync, `MM/DD/YYYY`. Defaults to the last 7 days if unset. |

### 5. Run the first sync

The workflow runs hourly on its own, but the first run does a full backfill
and can take a few minutes — don't wait for the schedule. In your repo:
**Actions → Sync Garmin data → Run workflow**.

Watch it in the Actions tab. Once it succeeds, your R2 bucket has your
GarminDB files in it.

### 6. Connect BetterGarmin

Open BetterGarmin → onboarding → **Set up automatic sync (advanced)** (or
**More → Cloud sync** if you're already past onboarding). Enter your Worker
URL from step 2 and the access token you generated. Click **Connect**.

## "Sync now" button (optional, recommended)

The app's **Sync now** button (on Today and in More → Cloud sync) makes the
Worker start the GitHub sync job immediately, then loads the result as soon as
it lands — typically about 2 minutes after you tap it. Open Garmin Connect on
your phone first so the watch's newest data is on Garmin's servers.

It needs a GitHub token the Worker can use to start the workflow:

1. GitHub → **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**.
2. **Repository access**: Only select repositories → your BetterGarmin repo.
3. **Permissions → Repository permissions → Actions: Read and write**. Nothing else.
4. Generate, and copy the token.
5. In Cloudflare: your Worker → **Settings → Variables and Secrets**. Add a
   **Secret** `GITHUB_TOKEN` (the token), and **Text** variables
   `GITHUB_REPO` (e.g. `brother12334/BetterGarmin`) and `GITHUB_REF` (the
   branch the workflow lives on). If you deployed from the dashboard, also
   paste the latest `worker/dashboard-worker.js` into the editor and Deploy.

If you deploy with wrangler instead, edit `GITHUB_REPO`, `GITHUB_REF` (and
`ALLOWED_ORIGIN`) in `worker/wrangler.toml` to match your fork, then run
`npx wrangler secret put GITHUB_TOKEN` and `npx wrangler deploy`.

The token can only start workflows in that one repo; it never reaches the app.

## Changing the sync frequency

Edit the `cron` line in `.github/workflows/sync-garmin-data.yml`. The default
is every 30 minutes. Garmin can flag accounts that authenticate too often, so avoid
going much tighter than every 15–30 minutes.

## Turning it off

- **In the app**: More → Cloud sync → Disconnect. This stops polling but
  leaves your already-downloaded data in place; use "Forget my data" to
  clear everything.
- **Stop the scheduled sync entirely**: delete the `GARMIN_USERNAME` /
  `GARMIN_PASSWORD` secrets (or disable the workflow in the Actions tab). The
  workflow checks for them and skips itself if they're missing.
- **Rotate the access token**: `npx wrangler secret put ACCESS_TOKEN` again
  with a new value, then reconnect in the app with the new token. The old
  token stops working immediately.
- **Delete everything**: delete the R2 bucket and the Worker in the
  Cloudflare dashboard, and remove the GitHub secrets.
