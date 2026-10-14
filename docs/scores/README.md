# BetterGarmin scores

This folder documents the formula, inputs, and research sources behind every
score BetterGarmin calculates itself (as opposed to scores it simply displays
from Garmin's own stored data).

Built so far:

- [Training Load & Training Status](training-load.md) — acute:chronic workload ratio
- [Fitness / Fatigue / Form](fitness-fatigue-form.md) — Banister impulse-response model
- [Energy Reserve](energy-reserve.md) — BetterGarmin's own intraday estimate (not Garmin's Body Battery)
- [Readiness / Recovery](readiness.md) — weighted composite of sleep, resting HR, form, and stress

Garmin's own values are displayed as-is where GarminDB stores them (sleep
score, Body Battery daily min/max/charged, HRV, VO2max on supported
activities, per-activity training load/effect) — labeled clearly as Garmin's,
not recalculated.

Not yet built: aerobic efficiency trend, cardiovascular-age-style insight.
