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
hasn't run in a while, "Sync now" in BetterGarmin has nothing new to fetch.

To make it hands-off, add a few iOS Shortcuts automations that open Garmin
Connect for a moment and then leave again:

1. Open **Shortcuts → Automation → +** and choose a trigger (see below).
2. Pick **Run Immediately** and turn off **Notify When Run**.
3. Add these actions:
   - **Open App** → Connect
   - **Wait** → 20 seconds
   - **Go to Home Screen**, or **Open App** → the app you were in

Triggers that work well:

- **Alarm → When stopped**: syncs last night's sleep as soon as you wake up.
- **App → Is Opened**: pick an app you use often (end with **Open App** →
  that app so you bounce straight back).
- **Charger → Connected**: syncs whenever you plug in.

Time-of-day triggers are skipped while the phone is locked, so the triggers
above are more reliable. Also keep Background App Refresh on for Garmin
Connect, and don't swipe the app closed.

> Yes, it's annoying to set up, but it's the only option available at the
> moment. Garmin doesn't let other apps pull data from the watch or tell
> Garmin Connect to sync.

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
