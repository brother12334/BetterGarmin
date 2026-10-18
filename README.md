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
- **Automatic sync** (optional): a scheduled job pulls from Garmin every 30 minutes, and **Sync now** pulls on demand.
- **Power tools**: units, goals, CSV export and an SQL console.

## Quick start

| I want to… | Do this |
| --- | --- |
| Look around | Open the app and tap **Try demo mode**. |
| Use my data privately | Run GarminDB on your computer and drop the `.db` files in. See [Getting your data](#getting-your-data). |
| Have it update itself | [Fork it and host your own copy](docs/self-hosting.md), then set up [cloud sync](docs/cloud-sync.md). |
| Fix a problem | See [troubleshooting](docs/troubleshooting.md). |

## Recommended setup (iPhone)

Not sure what to pick? Do these and you're done. Each one links to the
details and the alternatives.

| Choice | ⭐ Recommended | Alternatives |
| --- | --- | --- |
| **How to open the app** | A **Safari tab** with the beacio extension and the [Compact tab layout](#making-safari-look-like-an-app): live heart rate works and the address bar shrinks out of the way | Safari **Home Screen app** (always full screen, no live heart rate), [Bluefy or WebBLE](#choosing-a-browser-iphone) |
| **Live heart rate over Bluetooth** | The **beacio** Safari extension in a Safari tab (the Home Screen app's **Open in Safari** button takes you there) | [Bluefy](#choosing-a-browser-iphone) |
| **Getting your data in** | [Cloud sync](docs/cloud-sync.md): updates itself every 30 min | [Drop in GarminDB files](#getting-your-data) by hand |
| **Watch → Garmin** | [Every Garmin notification on](#1-turn-on-every-garmin-notification) + the [BetterGarmin Sync Shortcut](#2-create-the-bettergarmin-sync-shortcut) | [Other options](#other-options) |
| **Automatic syncs** | [Sleep → Wake Up](#3-run-it-automatically) and **App → Is Opened** automations | Charger, NFC tag, backup times |
| **Sync now button** | **Sync through iPhone Shortcut** on (More → Cloud sync) | Off: starts the cloud sync only |
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
inside it (Worker address and access token). In your Shortcut, set the last
**Open App** to **Safari** (Home Screen web apps usually aren't in the Open App
list; Safari brings you back to your BetterGarmin tab).

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

**All the ways to keep it synced, at a glance**

| Method | Effort | What it covers |
| --- | --- | --- |
| ⭐ [Garmin notifications on](#1-turn-on-every-garmin-notification) | One-time, 1 min | More frequent background syncs all day |
| ⭐ [BetterGarmin Sync Shortcut](#2-create-the-bettergarmin-sync-shortcut) | One-time, 5 min | One tap: watch uploads **and** cloud sync starts right away |
| ⭐ [Shortcut automations](#3-run-it-automatically) | One-time, 2 min each | Syncs on wake-up, when you open an app, when you charge, or with an NFC tap |
| [Garmin Connect widget](#other-options) | One-time | Gives the app extra chances to sync |
| [Garmin Express while charging](#other-options) | Plug in at a computer | Full sync every time you charge there |
| [Wi-Fi upload](#other-options) | Watches with Wi-Fi only | Uploads activities without the phone |
| [Spare Android phone](#other-options) | Advanced | Fully automatic syncing at home |
| Cloud sync schedule | Automatic | BetterGarmin pulls from Garmin every 30 minutes |

The in-app setup (**More → Cloud sync → Set up**) walks through the first
three as its last step. ⭐ = recommended.

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
   - Inside the If: **Open App** → **Safari** (or Bluefy if that's where you
     use BetterGarmin). This is where Sync now brings you back to.
   - Under **Otherwise**: **Go to Home Screen**
6. Tap **Done**.

The finished Shortcut reads:

```
Receive Text input from Share Sheet
Open App  Connect
Wait  5 seconds
Get Contents of URL  https://…workers.dev/sync  (POST, Authorization: Bearer …)
If  Shortcut Input  is  app
    Open App  Safari
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
permission to open Connect and your browser and to run the Shortcut; choose
**Always Allow**.

**Check that it worked**

- **Quick check:** temporarily add a **Show Content** action (called Show Result on older iOS; Quick Look also works) right after
  *Get Contents of URL* and run the Shortcut. `{"started":"…"}` means the
  cloud sync was started. `Unauthorized` means the token or the `Bearer `
  part is wrong; a "server not found" error means the address is wrong.
  Remove it afterwards.
- **On GitHub:** open your repository → **Actions** → **Sync Garmin data**.
  A new run should appear within seconds of running the Shortcut.
- **In BetterGarmin:** about 2–3 minutes later, **Last synced** on the More
  page updates and your newest data shows up.

#### 3. Run it automatically

In **Shortcuts → Automation → +**, pick a trigger, choose **Run
Immediately**, turn off **Notify When Run**, and add one action: **Run
Shortcut** → BetterGarmin Sync. Good triggers:

- ⭐ **Sleep → Wake Up** (or **Alarm → When stopped**): syncs last night's sleep
  as soon as you get up. This is the most important one.
- ⭐ **App → Is Opened**: pick an app you open a few times a day, like
  Instagram or Messages. Avoid one you open constantly.
- **Charger → Connected**: catches the end of the day when you plug in.
- **NFC**: stick a cheap NFC tag on your nightstand or desk and tap your
  phone on it.
- Optional backup **Time of Day** runs at 7:30 AM, 12:30 PM, 5:00 PM and
  9:30 PM. These only run if the phone is unlocked at that minute.

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
