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
- **Live heart rate**: straight from your watch over Bluetooth (Chrome/Edge; on iPhone, Safari with the beacio extension or Bluefy).
- **Sync straight from the band**: **Sync now** downloads stress, energy, heart rate, steps, sleep and activities from your Garmin band over Bluetooth. No Garmin Connect or Garmin cloud needed.
- **Cloud sync** (optional backup): a scheduled job pulls from Garmin every 30 minutes, used when the band isn't nearby.
- **Power tools**: units, goals, CSV export and an SQL console.

## Quick start

| I want to… | Do this |
| --- | --- |
| Look around | Open the app and tap **Try demo mode**. |
| Use my data privately | Run GarminDB on your computer and drop the `.db` files in. See [Getting your data](#getting-your-data). |
| Sync from my band | Open the app in Bluefy (or Chrome/Edge) and tap **Sync now**. See [Syncing from the band](#syncing-from-the-band). |
| Have a cloud backup | [Fork it and host your own copy](docs/self-hosting.md), then set up [cloud sync](docs/cloud-sync.md). |
| Fix a problem | See [troubleshooting](docs/troubleshooting.md). |

## Recommended setup (iPhone)

Not sure what to pick? Do these and you're done. Each one links to the
details and the alternatives.

| Choice | ⭐ Recommended | Alternatives |
| --- | --- | --- |
| **How to open the app** | A **Safari tab** with the beacio extension and the [Compact tab layout](#making-safari-look-like-an-app): live heart rate works and the address bar shrinks out of the way | Safari **Home Screen app** (always full screen, no live heart rate), [Bluefy or WebBLE](#choosing-a-browser-iphone) |
| **Live heart rate over Bluetooth** | The **beacio** Safari extension in a Safari tab (the Home Screen app's **Open in Safari** button takes you there) | [Bluefy](#choosing-a-browser-iphone) |
| **Getting your data in** | [**Sync now** straight from the band](#syncing-from-the-band) | [Cloud sync](docs/cloud-sync.md) backup, or [drop in GarminDB files](#getting-your-data) |
| **Look** | The **Glacier** preset (default) | 7 other presets in Customize |
| **Clock and units** | Whatever your phone uses (default) | More → Clock / Units |

### Choosing a browser (iPhone)

Live heart rate needs Web Bluetooth, which Safari, Chrome and Edge on iPhone
don't have. Everything else (cloud sync, charts, Sync now) works in any browser.

| Option | Full screen | Live heart rate | Notes |
| --- | --- | --- | --- |
| ⭐ **Safari tab + beacio extension** | Nearly: the address bar shrinks to a small pill, or hide it | ✅ | Best overall. See [Making Safari look like an app](#making-safari-look-like-an-app). |
| **Safari Home Screen app** | ✅ Always | ❌ (extensions don't run in Home Screen apps; it has an **Open in Safari** button) | Good if you rarely need live heart rate |
| **Bluefy** | Only from Bluefy's own menu (the app can't turn it on) | ✅ | Easiest if you want live heart rate everywhere |
| **WebBLE** | Not confirmed | ✅ | Similar to Bluefy |

**Setting up Safari + beacio (recommended)**

1. Install **[beacio](https://apps.apple.com/tt/app/ioswebble/id6761301368)**
   (listed as "iOSWebBLE", "Web Bluetooth for Safari") from the App Store and
   open it once. It's from an independent developer, so only allow it on
   BetterGarmin's site.
2. **Settings → Apps → Safari → Extensions → beacio**: turn it on and allow
   it only on your BetterGarmin address (for example
   `yourname.github.io`), not All Websites.
3. Open BetterGarmin in a normal Safari tab and tap **Connect** on the heart
   rate card (turn on Broadcast Heart Rate on the watch first). If your watch
   connects, the extension works.
4. Tap **Share → Add to Home Screen** and use the new icon every day: it's
   always full screen. iOS doesn't run Safari extensions inside Home Screen
   apps, so for live heart rate tap **Open in Safari** on the heart rate card.
   It opens BetterGarmin in a Safari tab, where beacio works and **Connect**
   appears.

#### Making Safari look like an app

Safari on iPhone doesn't let websites go fullscreen (Apple only allows that for
videos), but you can get close:

1. **Compact tab layout:** Settings → Apps → Safari → **Tabs** → **Compact**.
   The address bar shrinks to a thin strip as soon as you scroll.
2. **Hide Toolbar:** tap the page menu at the left of the address bar →
   **Hide Toolbar**. Tap the top of the screen to bring it back.
3. **Toolbar colours:** BetterGarmin asks Safari to tint its bars to match the
   top of the screen. Older Safari versions follow this; the floating address
   bar in the newest iOS mostly picks its own colour, so there it may still
   show as a dark strip. Steps 1 and 2 are what really get it out of the way.

The Home Screen app keeps its own storage, so connect cloud sync once more
inside it (Worker address and access token).

## Syncing from the band

BetterGarmin can connect straight to a Garmin **CIRQA** band over Bluetooth
(Bluefy on iPhone, or Chrome/Edge), without Garmin Connect or Garmin's cloud.

- **Workouts:** starting a Strength activity on the band from a workout is
  planned for **Element 26**, not BetterGarmin. The tested protocol is in
  [docs/band-protocol.md](docs/band-protocol.md).
- **Test band alert:** makes the band buzz (Find My Watch). It's a test, not a
  custom vibration or an alarm.
- **Sync now** (Today, More, and the band card) is the main way data gets
  in. It connects to the band, downloads new files, checks each one with
  Garmin's FIT SDK and imports stress, energy (Body Battery), heart rate,
  steps, sleep stages and sleep score, plus activities. Files are never
  deleted or changed on the band, and nothing is imported twice. If the band
  can't be reached and cloud sync is set up, Sync now falls back to the cloud
  copy. With cloud sync set up, it also refreshes the Garmin cloud copy after
  the band sync.

**Testing status (October 2026):** still being tested on a real CIRQA band.

- **Confirmed on the real band:** connecting, listing files, and downloading
  and checking them. 18 files came through: activities, workouts, device and
  settings files, and three file types (44, 72, 74) that use undocumented
  Garmin messages.
- **Not confirmed yet:** all-day (monitoring) and sleep files. None have
  appeared on the band so far. The likely reason is that Garmin Connect
  collects them first while it's paired.
- **Next test:** an overnight run with the band's Garmin Connect setting off,
  to see whether those files stay on the band for BetterGarmin to read.
- **For now:** the band only talks to one app at a time. To use both apps,
  keep Garmin Connect paired; sleep, stress and energy then come in through
  the cloud sync.
- **Wake-up alarms:** not available yet.

**Connect:** More → **Garmin band** → **Connect**, then choose your CIRQA.

**Band not in the list?** Garmin Connect may be holding it. On iPhone go to
Settings → Bluetooth → ⓘ next to **Garmin Device** and turn **Connect** off
under *Apps allowed to connect*. Connect in BetterGarmin, and turn it back on
when you're done. Don't unpair or reset the band. Details are in
[troubleshooting](docs/troubleshooting.md#garmin-band-cirqa-wont-connect-directly);
the protocol and what's been verified are in
[docs/band-protocol.md](docs/band-protocol.md).

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

### Keeping the cloud backup fresh (iPhone)

Only needed for the optional cloud backup: **Sync now** reads straight from
the band and doesn't depend on any of this. The cloud copy comes from
Garmin's servers, and only the Garmin Connect app moves data there, so it
helps to keep Connect syncing in the background.

#### 1. Turn on every Garmin notification

In Garmin Connect, open your device → **Notifications & Alerts** and switch
**all of them on**:

<img src="docs/screenshots/garmin-notifications.png" alt="Garmin Connect Notifications & Alerts with every toggle on" width="280">

A watch that gets alerts keeps a live Bluetooth link to your phone, and iOS
wakes Garmin Connect more often to serve it, so it syncs in the background
far more often. Also keep Background App Refresh on for Garmin Connect, keep
Low Power Mode off, and don't swipe the app closed.

#### Other options

- **Garmin Connect widget:** add it to your Home Screen or Lock Screen. iOS
  refreshes widgets regularly, which gives Garmin Connect extra chances to
  sync in the background.
- **Garmin Express while charging:** install Garmin Express on a Mac or PC and
  charge the watch from that computer. It syncs everything each time you plug
  in, so your sleep is up to date in the morning. It only works while the
  watch is plugged in or nearby.
- **Wi-Fi upload:** if your watch has Wi-Fi (many Music and higher-end
  models), add your home network in Garmin Connect. It then uploads activities
  on its own, mostly after workouts and while charging. Screenless bands like
  the CIRQA don't have Wi-Fi.
- **Spare Android phone (advanced):** Android lets apps run in the
  background freely, and tools like MacroDroid can open Garmin Connect every
  hour even while the phone is locked. The catches: the watch pairs with only
  one phone, so you'd use your iPhone's Garmin Connect less, and it only syncs
  while you're home.
- **What doesn't work:** Garmin's LiveTrack only runs during recorded
  activities and still needs the phone app. Open-source replacements like
  Gadgetbridge are Android-only.

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
