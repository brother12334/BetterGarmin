# Training Load & Training Status

**Labeled as:** BetterGarmin estimate. Garmin stores per-activity `training_load`
(a TRIMP-like value); BetterGarmin aggregates that into daily load and derives
status from it — it doesn't use Garmin's own "Training Status" algorithm,
which isn't exposed by GarminDB.

## Formula

Acute:Chronic Workload Ratio (ACWR), from Gabbett, T.J. (2016), "The
training–injury prevention paradox: should athletes be training smarter and
harder?", *British Journal of Sports Medicine* 50(5):273–280.

```
daily_load(day)   = sum of activities.training_load for that day (0 on rest days)
acute(day)        = mean(daily_load) over the trailing 7 days
chronic(day)      = mean(daily_load) over the trailing 28 days
ACWR(day)         = acute(day) / chronic(day)
```

Requires at least 14 days of history before chronic load (and therefore
status) is shown.

## Status bands

| ACWR | Status |
|---|---|
| < 0.8 | Detraining |
| 0.8 – 1.3 | Maintaining |
| 1.3 – 1.5 | Productive |
| > 1.5 | Overreaching |

These bands follow the "sweet spot" (0.8–1.3) and high-risk (>1.5) ranges
reported in Gabbett (2016) and subsequent sports-science literature on
workload and injury risk.

## Source

`src/scores/trainingLoad.ts`
