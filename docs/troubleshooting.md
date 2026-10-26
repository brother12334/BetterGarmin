# Troubleshooting

## The app

**The site shows a blank page or 404 on my fork.**
Check **Settings → Pages → Source** is set to **GitHub Actions** and the
**Deploy to GitHub Pages** workflow succeeded. The address is case-sensitive:
`/BetterGarmin/` is not the same as `/bettergarmin/`.

**I don't see a change that was just deployed.**
The app is cached for offline use. Close it completely and reopen it, or
reload the page twice.

**Today is empty, or the screen says "Invalid Date".**
Update to the latest version (see above). Older versions couldn't read the
date format GarminDB uses (`2026-10-15 00:00:00.000000`).

**Insights shows workouts I never did.**
Those are demo-mode samples. Current versions remove them automatically once
you connect real data. If any are left, use **Training → Strength Training → Clear logged workouts**.

**Calories look far too high.**
Garmin's *total* calories include your resting metabolism for the whole day.
Today shows **active** calories, which is what you burned by moving.

## Cloud sync

Open your repo's **Actions → Sync Garmin data** run and read the failing step.
Every run also prints a **Summarise downloaded data** step that lists row
counts (no health values), which shows what Garmin actually returned.

| Symptom | Cause and fix |
| --- | --- |
| Run skipped with "missing secrets" | Add the six secrets from [cloud-sync.md](cloud-sync.md#4-add-github-repository-secrets). |
| "Garmin Connect login failed" | Wrong `GARMIN_USERNAME`/`GARMIN_PASSWORD`. Accounts with two-step verification can't use this automated login. |
| "R2_ACCOUNT_ID doesn't look like a Cloudflare account ID" | Use the 32-character ID from your Cloudflare dashboard URL, not the full endpoint. |
| "Cloudflare R2 rejected the credentials" / "Unauthorized" | The R2 API token needs **Object Read & Write** on the bucket. Check that the key ID and secret are not swapped. |
| The run is cancelled after hours | The first sync downloads history at about 1 s per day per data type. Set the `SYNC_START_DATE` variable to a recent date, or leave it unset for the last 7 days. |
| The run succeeds but the app shows no data | Your watch hasn't uploaded to Garmin yet. Open Garmin Connect on your phone and let it sync, then run the workflow again. Check the summary step's row counts. |
| Scheduled runs don't happen | GitHub delays or skips scheduled runs when it's busy. Use **Sync now** in the app, or **Run workflow** in the Actions tab. |

## Sync now button

| Error in the app | Fix |
| --- | --- |
| "Your Worker needs updating" | Paste the latest `worker/dashboard-worker.js` into the Worker editor and Deploy (or `npx wrangler deploy`). |
| "Sync now is not set up" | Add `GITHUB_TOKEN` (secret), `GITHUB_REPO` and `GITHUB_REF` to the Worker. |
| "GitHub refused to start the sync (401/403)" | The token is wrong, expired, or lacks **Actions: Read and write** on this repo. |
| "GitHub refused to start the sync (422)" | `GITHUB_REF` isn't a branch in the repo. Use the exact branch name, with no spaces, quotes or `refs/heads/`. |
| "Access token was rejected" | The token entered in the app doesn't match the Worker's `ACCESS_TOKEN`. |

## Live heart rate

- **"Not available in Safari or iOS"**: iPhone browsers block Bluetooth for
  websites. Open the site in **Bluefy** instead.
- **The device list is empty**: turn on **Broadcast Heart Rate** on the
  watch, or in Garmin Connect for watches without a screen. Keep it close,
  and try closing Garmin Connect.
- **It disconnects**: reloading the page, closing the browser or leaving the
  app for a while drops the connection. Tap **Connect** again.
- Over Bluetooth, only heart rate is available. Steps, stress and sleep come
  through sync.

## Garmin band (CIRQA) won't connect directly

### A sync stopped part-way, or a workout says "not downloaded"

The recording is still on the band; BetterGarmin never deletes or changes band
files. Keep the band close and tap **Retry download** on the workout, or
**Sync now**. Files that already arrived are kept and skipped, and the rest
download again. Each workout shows *Saved on band*, *Downloaded* and *Added to
history* separately, so you can see which step is missing.

### The band keeps disconnecting

BetterGarmin reconnects on its own a few times after a drop (the card shows
**Reconnecting…**). If it ends at **Disconnected**, bring the band within a
metre or two and tap **Connect**. If it still fails, check the Garmin Connect
conflict below.

### The band is missing from Bluefy's device chooser

Seen on a tested iPhone: the CIRQA worked in Bluefy, but after it reconnected to
Garmin Connect it disappeared from Bluefy's chooser, even with **Show all
devices**. Closing Garmin Connect and toggling Bluetooth didn't help. In iPhone
Settings the band showed up as **Garmin Device**, and its details page listed
**Apps allowed to connect → Connect** switched on. Turning that switch off
brought it back.

1. Open iPhone **Settings → Bluetooth** and tap ⓘ next to **Garmin Device**.
2. Under **Apps allowed to connect**, turn **Connect** off for now. Leave
   **Bluefy** on.
3. Open Bluefy and connect from BetterGarmin (**More → Garmin band → Connect**).
4. When you're done, disconnect in BetterGarmin and turn **Connect** back on,
   so Garmin Connect can sync again.
5. Don't forget, unpair or factory-reset the band for this. It isn't needed.

Notes:

- This workaround is verified on that setup. Whether Garmin Connect and
  BetterGarmin can both use the band at the same time hasn't been tested; in
  practice the band only talks to one app at a time.
- The "Garmin Device" name only appears in iPhone Settings. The band still
  identifies itself as **CIRQA Smart Band** over Bluetooth.
- During the failed attempts Bluefy reported a bare error, `2`. What it means
  isn't known, so BetterGarmin shows the browser's exact error text alongside
  these steps rather than calling it an authentication failure.

### The band is missing from Bluefy and Bluefy isn't under "Apps allowed to connect"

Seen on the tested iPhone after resetting all data on the band. **Don't use
Forget This Device for this.** It worked once, then the band hung up about a
second after every connection and disappeared from iPhone Settings. The band
kept its old pairing after the iPhone had dropped it.

1. Turn Bluetooth on for Garmin Connect (iPhone **Settings → Garmin Connect**)
   and let Connect pair with the band, re-adding the band in Connect if needed.
2. In **Settings → Bluetooth**, tap ⓘ next to the band ("Garmin Device").
3. Under **Apps allowed to connect**, turn **Connect** off and **Bluefy** on.
4. Close Garmin Connect fully, then connect from BetterGarmin in Bluefy.
