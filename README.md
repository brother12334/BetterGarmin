# BetterGarmin

A sleeker, deeper dashboard for your Garmin health data, built on the
open-source [GarminDB](https://github.com/tcgoetz/GarminDB) project. It runs
entirely in your browser as an installable app. Nothing is uploaded unless
you turn on the optional [cloud sync](docs/cloud-sync.md).

Not affiliated with Garmin. Not medical advice.

<p>
  <img src="docs/screenshots/today-desktop.png" alt="BetterGarmin Today screen, desktop, dark mode" width="100%" />
</p>
<p>
  <img src="docs/screenshots/today-mobile.png" alt="BetterGarmin Today screen, mobile, dark mode" width="32%" />
  <img src="docs/screenshots/onboarding.png" alt="BetterGarmin onboarding welcome screen, light mode" width="32%" />
</p>

## Features

- **Today**: a readiness score, Energy Reserve curve, sleep and stress bars, steps and active calories, and plain-language insights.
- **Health, Sleep, Training**: trends, records and activity details, including maps.
- **Strength training**: log workouts, or import them from **Element 26**. Each workout gets a heart-rate timeline lined up with your sets, recovery between sets, a correction tool and workout comparison.
- **Insights**: findings that link training with sleep, resting HR and HRV, with sample sizes and evidence levels instead of overconfident claims. Also history charts, personal experiments, and an optional Gemini assistant that uses your own API key.
- **Live heart rate**: straight from your watch over Bluetooth (Chrome/Edge, or Bluefy on iPhone).
- **Automatic sync** (optional): a scheduled job pulls from Garmin every 30 minutes, and **Sync now** pulls on demand.
- **Power tools**: units, goals, CSV export and an SQL console.

## Quick start

| I want to… | Do this |
| --- | --- |
| Look around | Open the app and tap **Try demo mode**. |
| Use my data privately | Run GarminDB on your computer and drop the `.db` files in. See [Getting your data](#getting-your-data). |
| Have it update itself | [Fork it and host your own copy](docs/self-hosting.md), then set up [cloud sync](docs/cloud-sync.md). |
| Fix a problem | See [troubleshooting](docs/troubleshooting.md). |

## How it works

GitHub Pages only serves static files — it can't run Python, can't run
GarminDB, and must never hold your Garmin credentials. So BetterGarmin works
in three steps:

1. **You** run [GarminDB](https://github.com/tcgoetz/GarminDB) on your own
   computer. It downloads your Garmin Connect data into local SQLite `.db`
   files — your login never leaves your machine.
2. **You** open BetterGarmin in your browser and drop those `.db` files in.
3. BetterGarmin opens them with [sql.js](https://sql.js.org) (SQLite compiled
   to WebAssembly) in a Web Worker, and runs every query and calculation
   locally in your browser. Nothing is uploaded, there's no backend, no
   analytics, no tracking.

Loaded files are cached in your browser's IndexedDB so you don't have to
re-select them every visit. A **Forget my data** button (under **More**)
wipes that cache instantly.

Don't have GarminDB data handy? Click **Try demo mode** on the welcome screen
to explore BetterGarmin with a realistic, entirely fake dataset — the only
data that's ever committed to this repository.

Want it to update itself instead of dropping files in by hand? See
[**Cloud sync**](docs/cloud-sync.md) — it's a separate, opt-in setup that
runs a scheduled job on your own free Cloudflare/GitHub accounts. It's a
genuine privacy tradeoff (your Garmin login ends up stored as a GitHub
secret), so the doc explains exactly what changes before you turn it on.

## Getting your data

1. Install GarminDB:
   ```sh
   pip install garmindb
   ```
2. Copy the example config and fill in your Garmin Connect login:
   ```sh
   curl -o ~/.GarminDb/GarminConnectConfig.json \
     https://raw.githubusercontent.com/tcgoetz/GarminDB/master/garmindb/GarminConnectConfig.json.example
   ```
3. Download and build your database (first run):
   ```sh
   garmindb_cli.py --all --download --import --analyze
   ```
   Later, update with just the newest data:
   ```sh
   garmindb_cli.py --all --download --import --analyze --latest
   ```
4. Open BetterGarmin and drag in the files from `~/HealthData/DBs` (or pick
   them with the file picker). BetterGarmin automatically figures out which
   file is which by inspecting its tables, so renamed files still work.

The in-app onboarding flow walks through the same steps with copy-to-clipboard
buttons.

### Keeping your watch synced (iPhone)

BetterGarmin reads your data from Garmin's servers, and only the official
**Garmin Connect** app can move it there from your watch. If Garmin Connect
hasn't run in a while, BetterGarmin has nothing new to fetch. These three
steps make syncing as hands-off as an iPhone allows.

#### 1. Turn on every Garmin notification

In Garmin Connect, open your device → **Notifications & Alerts** and switch
**all of them on**:

<img src="docs/screenshots/garmin-notifications.png" alt="Garmin Connect Notifications & Alerts with every toggle on" width="280">

A watch that gets alerts keeps a live Bluetooth link to your phone, and iOS
wakes Garmin Connect more often to serve it, so it syncs in the background
far more often. Also keep Background App Refresh on for Garmin Connect, keep
Low Power Mode off, and don't swipe the app closed.

#### 2. Create the "BetterGarmin Sync" Shortcut

This one Shortcut opens Garmin Connect so your watch uploads, then tells
BetterGarmin's cloud sync to run **straight away**, so new data shows up in
about 2–3 minutes instead of waiting for the 30-minute schedule.

In the **Shortcuts** app, tap **+** and rename it exactly
**BetterGarmin Sync** (the button looks for that name). Then:

1. **Let it accept input:** tap **ⓘ** at the bottom, turn on **Show in Share
   Sheet**, and tap **Done**. A **Receive … input from Share Sheet** block
   appears at the top. Tap its blue type word and choose **Text** only.
2. **Open App** → **Connect**
3. **Wait** → **5** seconds (a sync takes about 3 seconds; the rest is a buffer)
4. **Get Contents of URL**
   - URL: your Worker address followed by `/sync`, for example
     `https://bettergarmin-sync.yourname.workers.dev/sync`
   - Tap **›** (Show More) on the action
   - Method: **POST**
   - Headers → **Add new header**: key `Authorization`, value
     `Bearer YOUR_ACCESS_TOKEN` (the word Bearer, a space, then your token)
5. **If** → tap *Condition* → **Shortcut Input** → **is** → type `app`
   (if Shortcut Input isn't listed, tap **Select Variable** and tap the
   Receive block at the top)
   - Inside the If: **Open App** → **Bluefy** (or the browser you use)
   - Under **Otherwise**: **Go to Home Screen**
6. Tap **Done**.

The finished Shortcut reads:

```
Receive Text input from Share Sheet
Open App  Connect
Wait  5 seconds
Get Contents of URL  https://…workers.dev/sync  (POST, Authorization: Bearer …)
If  Shortcut Input  is  app
    Open App  Bluefy
Otherwise
    Go to Home Screen
End If
```

**Where to find your Worker info**

- **Worker address:** Cloudflare dashboard → **Workers & Pages** → your
  worker. It ends in `.workers.dev`, and it's the same address you entered in
  BetterGarmin.
- **Access token:** the `ACCESS_TOKEN` secret you saved in Cloudflare (and
  typed into BetterGarmin). Cloudflare hides secrets after saving, so if you
  forgot it, set a new one under your worker → **Settings → Variables and
  Secrets**, then enter the new value in BetterGarmin (More → Cloud sync →
  Disconnect, connect again) and in the Shortcut.

Your token stays inside the Shortcut on your phone. Don't share the Shortcut,
and crop the header row out of any screenshots.

**Turn it on in BetterGarmin:** go to **More → Cloud sync** and switch on
**Sync through iPhone Shortcut**. Sync now will then run the Shortcut: Garmin
Connect flashes open, your watch uploads, you land back in BetterGarmin, and
the new data appears a couple of minutes later. The first time, iOS asks for
permission to open Connect and Bluefy and to run the Shortcut; choose
**Always Allow**.

**Check that it worked**

- **Quick check:** temporarily add a **Show Result** action right after
  *Get Contents of URL* and run the Shortcut. `{"started":"…"}` means the
  cloud sync was started. `Unauthorized` means the token or the `Bearer `
  part is wrong; a "server not found" error means the address is wrong.
  Remove Show Result afterwards.
- **On GitHub:** open your repository → **Actions** → **Sync Garmin data**.
  A new run should appear within seconds of running the Shortcut.
- **In BetterGarmin:** about 2–3 minutes later, **Last synced** on the More
  page updates and your newest data shows up.

#### 3. Run it automatically

In **Shortcuts → Automation → +**, pick a trigger, choose **Run
Immediately**, turn off **Notify When Run**, and add one action: **Run
Shortcut** → BetterGarmin Sync. Good triggers:

- **Sleep → Wake Up** (or **Alarm → When stopped**): syncs last night's sleep
  as soon as you get up. This is the most important one.
- **App → Is Opened**: pick an app you open a few times a day, like
  Instagram or Messages. Avoid one you open constantly.
- **Charger → Connected**: catches the end of the day when you plug in.
- **NFC**: stick a cheap NFC tag on your nightstand or desk and tap your
  phone on it.
- Optional backup **Time of Day** runs at 7:30 AM, 12:30 PM, 5:00 PM and
  9:30 PM. These only run if the phone is unlocked at that minute.

> Yes, it's annoying to set up, but it's the only option available at the
> moment. Garmin doesn't let other apps pull data from the watch or tell
> Garmin Connect to sync, and bands without Wi-Fi (like the CIRQA) can only
> upload through the phone app.

## Privacy

By default (manual file loading, demo mode):

- No backend. No analytics. No tracking scripts.
- Your `.db` files are read directly in your browser and never leave your
  device.
- Cached data lives only in your browser's IndexedDB, scoped to this site.
  Clear it any time with **More → Forget my data**.
- Demo mode uses a synthetic dataset generated by
  [`scripts/generate-demo-data.ts`](scripts/generate-demo-data.ts) — it is
  not real health data, and no real health data is ever stored in this
  repository.

If you opt into **cloud sync**, that changes: your Garmin login is stored as
a GitHub Actions secret, and your data passes through a Cloudflare Worker and
R2 bucket you control. It's gated by a bearer token, not full multi-user
auth. Full details in [docs/cloud-sync.md](docs/cloud-sync.md) — read it
before enabling.

## Development

```sh
npm install
npm run dev          # start the dev server
npm run build         # type-check + production build
npm test              # unit tests (vitest)
npm run lint
npm run generate:demo # regenerate the fake demo dataset in public/demo-data
```

### Tech stack

Vite + React + TypeScript, Tailwind CSS, sql.js (SQLite/WASM) in a Web
Worker, Framer Motion, ECharts, IndexedDB via `idb`, and a GitHub Actions
workflow that builds and deploys to GitHub Pages. (Optional cloud sync adds a
Cloudflare Worker and a second, separate GitHub Actions workflow — see
[docs/cloud-sync.md](docs/cloud-sync.md).)

### Project structure

```
src/
  app/        theme, routing shell, data-loading context (incl. cloud sync)
  components/ shared design-system primitives (Card, Ring, Button, …)
  db/         sql.js client, typed queries, IndexedDB cache, cloud-sync client
  workers/    the sql.js Web Worker
  features/   one folder per screen (today, health, sleep, training, …)
  scores/     BetterGarmin's own score calculations (see docs/scores)
scripts/      the demo-data generator
worker/       optional Cloudflare Worker for cloud sync (see docs/cloud-sync.md)
docs/scores/  formulas and research sources behind every calculated score
docs/cloud-sync.md  full cloud-sync setup walkthrough
docs/self-hosting.md  fork + GitHub Pages setup
docs/troubleshooting.md  common problems and fixes
docs/ANALYTICS.md  how the training analytics work and their limits
```

## Calculated scores

Where GarminDB already stores a Garmin-calculated value (sleep score, Body
Battery, training load, VO2max on supported activities, …), BetterGarmin
shows it and labels it as Garmin's own number. Where it doesn't — a live
Energy Reserve curve, a Readiness score, Training Status, and more — those
are BetterGarmin's own estimates, clearly labeled, with the formula and
research sources behind each one documented in [`docs/scores`](docs/scores).

## Credits & license

BetterGarmin is built on top of
[GarminDB](https://github.com/tcgoetz/GarminDB) by Tom Goetz, licensed under
GPL-2.0. Huge thanks to that project for making this possible.
