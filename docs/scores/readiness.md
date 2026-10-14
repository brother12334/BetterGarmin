# Readiness / Recovery

**Labeled as:** BetterGarmin estimate — GarminDB has no equivalent stored
value. Follows the general shape of published multi-factor readiness models
(e.g. Whoop's Recovery score, Oura's Readiness score): combine several
recovery-relevant signals, each normalized against *your own* recent
history rather than a generic population norm.

## Inputs and weights (defaults, user-adjustable)

| Input | Weight | What "good" means |
|---|---|---|
| Last night's sleep score | 40% | Higher is better (Garmin's own 0-100 score) |
| Resting heart rate vs. your baseline | 25% | Lower than your personal average is better |
| Banister Form (see [Fitness/Fatigue/Form](fitness-fatigue-form.md)) | 20% | Less accumulated fatigue relative to fitness is better |
| Today's average stress vs. your baseline | 15% | Lower than your personal average is better |

## Formula

Your personal baseline for resting HR, form, and stress is the mean and
standard deviation of each over your available history (see
`src/scores/baselines.ts`). Each input is converted to a 0-100 "goodness"
score from its z-score against that baseline:

```
score = clamp(50 - z * 20, 0, 100)   // for "lower is better" inputs (RHR, stress)
score = clamp(50 + z * 20, 0, 100)   // for "higher is better" inputs (form)
```

Sleep score is already 0-100, so it's used directly. The final Readiness
score is the weighted average of whichever components have enough data
(at least 5 days of history for a baseline to form), re-normalizing weights
over the available components.

## Recommendation bands

| Score | Message |
|---|---|
| 80+ | Good day for a hard workout. |
| 60-79 | Normal training day. |
| 40-59 | Consider an easier session. |
| <40 | Prioritize recovery. |

## Source

`src/scores/readiness.ts`
