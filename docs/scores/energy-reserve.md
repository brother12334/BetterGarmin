# Energy Reserve

**Labeled as:** BetterGarmin estimate. This is deliberately **not** called
"Body Battery" — that's Garmin's trademark — and this is **not** a
reproduction of Garmin/Firstbeat's proprietary algorithm, which isn't public.

## Why it exists

GarminDB stores Garmin's own daily Body Battery **min/max/charged** values
(`daily_summary.bb_min/bb_max/bb_charged`), but not an intraday curve — there
is no stored minute-by-minute Body Battery trace to display. BetterGarmin
builds its own simplified intraday estimate instead, from the day's stress
samples (`garmin.stress`), so the Today and Health screens have a curve to
show at all.

## Formula

Conceptual basis: parasympathetic-dominant (low-stress) periods allow
recovery, sympathetic-dominant (high-stress) periods deplete it — see e.g.
Plews, D.J. et al. (2013), "Training Adaptation and Heart Rate Variability in
Elite Endurance Athletes", *Sports Medicine* 43(9):773–781.

Starting from a baseline value, each stress sample nudges the running total
by a rate (points per minute) determined by its stress band, clamped to
0–100:

| Stress band | Rate (points/min) |
|---|---|
| Negative (Garmin's rest/sleep sentinel) | +0.07 |
| 0–24 (rest) | +0.05 |
| 25–49 (low) | +0.01 |
| 50–74 (medium) | −0.04 |
| 75+ (high) | −0.09 |

"Biggest drains" and "best recharges" are found by scanning the resulting
curve for the single largest contiguous run of decrease and increase,
respectively (a standard maximum-subarray / Kadane's-algorithm scan).

## Known limitations

- The rate constants above are a hand-picked, documented heuristic, not
  fitted to any dataset — treat the curve's *shape* (when you're draining
  vs. recharging) as more meaningful than its exact numeric value.
- Where Garmin's own daily min/max/charged values are present, those are
  shown alongside this curve and labeled as Garmin's.

## Source

`src/scores/energyReserve.ts`
