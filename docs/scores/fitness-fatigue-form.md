# Fitness / Fatigue / Form

**Labeled as:** BetterGarmin estimate, built on a long-published, widely-used
sports-science model — not a Garmin value.

## Formula

The Banister Impulse-Response model: Banister, E.W., Calvert, T.W., Savage,
M.V., Bach, T. (1975), "A systems model of training for athletic
performance", *Australian Journal of Sports Medicine* 7:57–61. Popularized
as the CTL/ATL/TSB "Performance Management Chart" by Dr. Andrew Coggan and
TrainingPeaks.

Each day's total training load (sum of `activities.training_load`, 0 on rest
days) is fed into two exponentially-weighted moving averages with different
time constants:

```
Fitness(t) = Fitness(t-1) + (load(t) - Fitness(t-1)) * (1 - e^(-1/42))   // 42-day time constant
Fatigue(t) = Fatigue(t-1) + (load(t) - Fatigue(t-1)) * (1 - e^(-1/7))    // 7-day time constant
Form(t)    = Fitness(t) - Fatigue(t)
```

- **Fitness** rises and falls slowly — it reflects your accumulated,
  long-term training.
- **Fatigue** reacts quickly to recent training.
- **Form** is fitness minus fatigue. Strongly negative form means recent
  training has outpaced your long-term base (high fatigue); positive form
  means you're relatively fresh.

## Source

`src/scores/fitnessFatigueForm.ts`
