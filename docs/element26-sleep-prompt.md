# Prompt: automatic Garmin sleep in Element 26

Paste everything below the line into the AI or developer working on Element 26.

---

Add automatic sleep tracking to Element 26, using my Garmin data from my BetterGarmin sync. Don't add any manual sleep entry.

## Where the data comes from

My BetterGarmin setup already syncs my Garmin account every 30 minutes and publishes a JSON summary of my recent sleep through a Cloudflare Worker:

- **URL:** `https://bettergarmin-sync.ferbyablon.workers.dev/files/sleep.json`
- **Auth:** send the header `Authorization: Bearer <ACCESS_TOKEN>`. It's the same access token BetterGarmin uses. A missing or wrong token returns `401`.
- **CORS:** the Worker allows browser requests from origins listed in its `ALLOWED_ORIGIN` setting (comma-separated). I'll add Element 26's origin there myself.
- Optional: `POST https://bettergarmin-sync.ferbyablon.workers.dev/sync` with the same header starts a fresh Garmin download. It returns `202`, and the new `sleep.json` lands about 2 minutes later. Only use this behind an explicit "Refresh from Garmin" button, never automatically, because Garmin can lock accounts that log in too often.

## Response format

```json
{
  "generatedAt": "2026-10-16T12:39:19+00:00",
  "nights": [
    {
      "date": "2026-10-16",
      "start": "2026-10-16T03:50:00Z",
      "end": "2026-10-16T11:11:00Z",
      "asleepMinutes": 402,
      "deepMinutes": 88,
      "lightMinutes": 271,
      "remMinutes": 43,
      "awakeMinutes": 39,
      "score": 77,
      "qualifier": "GOOD",
      "stages": [
        { "stage": "light_sleep", "start": "2026-10-16T03:50:00Z", "minutes": 20 }
      ]
    }
  ]
}
```

- `nights` is newest first, up to 30 nights. Nights with no recorded sleep are left out.
- `date` is the morning the night ended, as Garmin files it.
- `start` and `end` are **UTC**. Always convert them to the user's local time zone before displaying them; don't print them raw.
- Durations are whole minutes. Any field can be `null`.
- `stage` is one of `deep_sleep`, `light_sleep`, `rem_sleep`, `awake` or `wake_time` (treat the last as awake). `stages` can be empty.
- `score` is Garmin's 0–100 sleep score.

## What to build

1. **Settings:** a "Garmin sleep (via BetterGarmin)" section with fields for the Worker URL and access token.
   - Store them locally on the device (e.g. localStorage) and never send them anywhere except that Worker.
   - Include a **Test connection** button that fetches `sleep.json` and shows "Connected: N nights" or a clear error, with different messages for 401 (wrong token), a network or CORS failure, and an empty `nights` list.
2. **Automatic sync:** fetch `sleep.json` when the app opens, when it comes back into view (`visibilitychange`), and every 15 minutes while it's open.
   - Store the nights locally, keyed by `date`, overwriting existing ones, so they survive offline use.
   - Skip fetching while `navigator.onLine` is false.
3. **Link sleep to workouts:** for each workout, find the night that ended on the morning of the workout's day, and show its total sleep, deep and REM minutes, and score on the workout.
   - If no night matches, show "No sleep data". Never estimate or fill in values.
4. **Sleep view:**
   - last night's total, bed and wake times in local time, and stage minutes with percentages
   - a 14-night history of total sleep
5. **Correlations (only once there's enough data):** compare training performance after shorter versus longer sleep, using my own median sleep as the split.
   - Require at least 10 nights linked to workouts before showing anything, and say how many more are needed until then.
   - Describe it as an association, not a cause.

## Rules

- Don't fabricate data. A missing value stays missing.
- Don't put the token in URLs, logs or analytics.
- Handle the Worker being unreachable by showing the last stored data and its age ("Sleep data from 3h ago").
