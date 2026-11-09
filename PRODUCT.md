# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One person: the owner, who wears a Garmin CIRQA Smart Band and uses BetterGarmin as a personal health dashboard on an iPhone, opened from the Safari Home Screen. Others may fork the open-source repo, but design decisions serve the owner first.

## Product Purpose

A private alternative to the Garmin Connect app's dashboards. The two jobs it is opened for:

1. **Check today at a glance:** energy (Body Battery), stress, sleep, steps and heart rate, right now.
2. **Decide how hard to train:** readiness and recovery before a workout.

Workout review, history and long-term insights exist and must keep working, but are secondary to those two jobs.

## Positioning

Built on the user's own data with no Garmin app UI in between: GarminDB pulls from Garmin's cloud into the user's own storage (GitHub Actions + Cloudflare R2), and the app reads it in the browser. Scores and insights state their evidence and limits instead of overconfident claims; no invented formulas or thresholds.

## Operating Context

- Safari Home Screen app on iPhone (full screen, no Bluetooth). This is the primary way it's used.
- Data arrives through cloud sync (every 15 minutes via a Cloudflare Cron Trigger, plus a Sync now button). Garmin Connect must keep the band synced to Garmin's servers.
- Direct Bluetooth band sync (Bluefy) and live heart rate exist but are marked obsolete for now.
- Glanced at often and briefly, including first thing in the morning.

## Capabilities and Constraints

- Screens: Today, Health, Training (strength/Element 26 workouts, history, progress), Sleep, Insights (including Intelligence), More (settings, sync source, cloud sync, backup, reminders, SQL console, band tools), Customize.
- All existing features must be kept.
- React + Vite + TypeScript + Tailwind v4 PWA, deployed to GitHub Pages; sql.js runs the GarminDB databases in a worker.
- Health values never leave the device except to the user's own storage.

## Brand Commitments

- Name: BetterGarmin. Dual Orbit logo.
- **Liquid glass** card design must be kept.
- **Photo backgrounds** (the daily mountain/forest backdrops) must be kept.
- **Customize options** (presets, card styles, fonts, widget order and visibility) must be kept.
- Independent project, not affiliated with Garmin; not medical advice.

## Evidence on Hand

The owner's real synced data. No testimonials, users or benchmarks exist; none may be invented.

## Product Principles

1. Today first: the morning glance answers "how am I and how hard can I go" without scrolling or tapping.
2. Honest numbers: show where a figure comes from and how sure it is; never fake precision.
3. One person's tool: favour the owner's daily use over setup flows for strangers.
4. Nothing lost: refinements keep every feature reachable.
