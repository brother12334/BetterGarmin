# BetterGarmin Intelligence

The Intelligence screen (Insights → Intelligence) analyzes patterns in your own
data. It compares each signal with your own personal baseline and states its
confidence. When data is missing or the science doesn't support a conclusion,
it says so instead of guessing.

**Device support: Garmin CIRQA only.** Everything below was checked against
data from a real CIRQA Smart Band (firmware 3.2, October 2026).

Contents:

1. [What the CIRQA actually provides](#1-cirqa-capability-inventory)
2. [Architecture](#2-architecture)
3. [Feature feasibility (all 19)](#3-feature-feasibility)
4. [Evidence matrix](#4-evidence-matrix)
5. [Algorithms](#5-algorithms-of-the-shipped-features)
6. [Validation and tests](#6-validation-and-tests)
7. [Privacy and data quality](#7-privacy-and-data-quality)
8. [Implementation report](#8-implementation-report)

---

## 1. CIRQA capability inventory

**Sources:**
- **Band:** files downloaded straight from the band over Bluetooth (FileAccess).
- **Cloud:** the optional GarminDB cloud sync, which only has data while Garmin Connect is paired.

**Status:**
- ✅ decoded and in use
- 🟡 found but not decoded, or the field's meaning is unconfirmed
- ❌ not seen

| Marker | Band file / message | Status | Notes |
| --- | --- | --- | --- |
| Heart rate (all-day) | Monitor (FIT 32) | ❌ not yet received | The band lists a Monitor directory but hasn't offered a file to a non-Garmin app. Cloud: ✅ |
| Heart rate (workouts) | Activity (FIT 4) `record` | ✅ | Per-second or smart-recording samples |
| Resting heart rate | Monitor `monitoring_hr` | ❌ (band), ✅ (cloud) | |
| Beat-to-beat (RR) intervals | none found | ❌ | RMSSD is **not** computed from minute HR. |
| HRV | HRV status file (FIT 68) `hrv_status_summary`, `hrv_value` | ✅ | Garmin's overnight value (device-calculated), 5-minute readings |
| Sleep onset / final awakening | Sleep (FIT 49) events; Firstbeat backup (FIT 72) msg 411 | ✅ | Times stored in UTC |
| Sleep stages | FIT 72 msg 411 (totals); FIT 49 `sleep_level` | ✅ totals, 🟡 timeline | Msg 411 fields matched on a real night. The stage timeline is drawn only when it agrees with the totals. |
| Sleep score and sub-scores | FIT 49 `sleep_assessment` | ✅ | |
| Sleep interruptions | FIT 49 `sleep_assessment.awakeningsCount`; FIT 79 | 🟡 | FIT 79 is undocumented |
| Movement / steps | Monitor; KPI protobuf | ❌ / 🟡 | One KPI value may be daily steps (unconfirmed) |
| Exercise sessions | Activity (FIT 4) | ✅ | Sport, duration, HR, calories, training effect, strength sets |
| Respiration | Monitor / sleep | ❌ (band), ✅ (cloud waking average) | |
| SpO₂ | `spo2_data` (269) | 🟡 decoder ready, no data yet | Pulse Ox set to *During Sleep* on the test band |
| Skin temperature | SkinTemp (FIT 73) `skin_temp_overnight` | 🟡 | Values were empty on the test nights |
| Stress | Monitor `stress_level` | ❌ (band), ✅ (cloud daily average) | The existing stress detector is kept |
| Body Battery | FIT 44 msg 369 field 7 | 🟡 | Read as "energy at wake"; unconfirmed |
| Calories | Activity; KPI | ✅ workouts, 🟡 daily | |
| VO₂max | none found | ❌ | |
| GPS / speed / distance | Activity | ✅ when recorded | The CIRQA has no GPS of its own |
| Post-exercise HR recovery | Activity HR tail | 🟡 | Only if the recording continues after exercise |
| Device metadata | Device file (FIT 1), `device_info` | ✅ | Model, firmware, part numbers, directory list |

**Rules followed:**
- Nothing is invented.
- Every marker records whether the band measured it, Garmin calculated it, or BetterGarmin derived it (shown in each card's *How this works*).
- Re-syncs don't duplicate anything (each file is keyed by device and file ID).
- Missing days stay missing.

## 2. Architecture

```
features/analytics/dataset.ts   daily records (from band overlay + cloud), shared with Findings
features/analytics/robust.ts    median, MAD, robust z (existing, reused)
features/intelligence/
  engine.ts      marker registry + provenance, capability registry, personal baselines,
                 Theil–Sen trends, confidence rules
  evidence.ts    scientific evidence registry (references + what each supports)
  features.ts    one pure function per feature → Insight {state, conclusion, contributors,
                 confidence, asOf, view, how}
  IntelligencePage.tsx  presentation layer
```

**Shared rules:**
- **Baselines:**
  - The 28 days before the day being judged; that day is never compared with itself.
  - At least 21 valid days.
  - Median ± MAD × 1.4826, with a per-marker floor on the spread so ordinary wobble isn't called a change.
  - These are engineering starting points, not validated physiological constants.
- **States:** every feature returns `ready`, `calibrating` (not enough data yet, with the reason) or `unavailable` (the marker doesn't exist).
- **Confidence:** depends on the baseline size and recent coverage. It is never a probability.
- **No composite health score:** no combined score is made where no validated model exists.

## 3. Feature feasibility

| Feature | Status | Why |
| --- | --- | --- |
| True Energy | **Experimental, shipped** | Shows last night's recovery signals against your own baseline. No single energy number: no validated model exists, and copying Body Battery wouldn't be independent. Daytime drain needs all-day data. |
| Illness Radar | **Experimental, shipped** | Multi-signal baseline deviation; no diagnosis, no probability. Skin temperature excluded (no values yet). |
| Recovery Momentum | **Shipped** | 7-day HRV / resting HR vs a 28-day baseline, smallest-worthwhile-change threshold. |
| Circadian Intelligence | **Shipped** | Sleep midpoint, bedtime and wake variability, social jetlag. The Sleep Regularity Index needs epoch data, which isn't available. |
| Sleep Debt Interest | **Shipped** | Shortfall below 7 h over 7 and 14 nights. No repayment schedule. |
| Health Trajectory | **Shipped** | Per-domain 30/90/180-day Theil–Sen trends; no combined score. |
| Recovery Time Predictor | Planned | Needs per-workout recovery outcomes (HRV/RHR return to baseline) over many sessions. Workouts are now stored; evaluate after ~8 weeks. |
| Hidden Fatigue | Planned | Needs daily activity load, which comes from the Monitor file (not received from the band yet). |
| Exercise Adaptation | Planned | Needs comparable repeated sessions (pace/power + HR). Strength sessions lack a standard workload; cardio sessions need distance or pace. |
| Fitness Plateau Detector | Planned | As above. Strength progression via e1RM is possible from Element 26 imports (Progress page already shows it). |
| Personal Stress Triggers | Planned (timing only) | Needs an intraday stress series: cloud has it, band doesn't yet. Will reuse the existing stress detector. |
| Rest Effectiveness | Blocked | Needs all-day HR and movement at minute resolution (Monitor file). |
| Biological Rhythm Stability | Blocked | Interdaily stability / intradaily variability need epoch-level activity (Monitor file). |
| Mental Readiness | Experimental, not shipped | Two-process model needs validation against your own alertness ratings or reaction tests; no check-in flow yet. |
| Crash Predictor | Experimental, not shipped | Same model as Mental Readiness, plus calibration against fatigue check-ins. |
| Sleep Forecast | Experimental, not shipped | Needs ~30 nights to train and compare against a personal-average baseline. |
| Burnout Trend | Not shipped | Without subjective/occupational input it would be named "Accumulated Strain". Needs multi-week load data. |
| Muscle Recovery Intelligence | Not shipped | Heart rate can't localize muscle recovery. A muscle map needs exercise, sets and soreness feedback; Element 26 imports could supply this later. |
| What-If Simulator | Not shipped | Needs validated predictive models; observational correlations can't support "if you do X, Y happens". |

## 4. Evidence matrix

| Feature | Concept | Inputs (provenance) | Relationship type | References |
| --- | --- | --- | --- | --- |
| Recovery Momentum | Weekly direction of autonomic recovery markers vs personal baseline | Overnight HRV (Garmin), resting HR (Garmin) | Correlational / monitoring | Plews 2013; Buchheit 2014; Leys 2013 |
| Illness Radar | Concurrent multi-signal deviation | Resting HR, HRV, respiration, awake time, SpO₂ | Correlational; prospective studies of detection, not diagnosis | Radin 2020; Mishra 2020; Quer 2021 |
| Circadian | Sleep timing and regularity | Sleep start/end (Garmin) | Descriptive; regularity associated with outcomes | Wittmann 2006; Phillips 2017 |
| Sleep Debt | Accumulated shortfall below the adult minimum | Sleep duration (Garmin) | Consensus minimum; experimental dose-response evidence | Watson 2015; Van Dongen 2003 |
| Health Trajectory | Long-term per-domain change | RHR, HRV, sleep, steps, SpO₂, respiration | Descriptive | Sen 1968; Leys 2013 |
| True Energy | Overnight recovery vs usual | HRV, RHR, sleep, awake | Correlational; **no validated energy model** | Plews 2013; Buchheit 2014; Watson 2015 |

Full citations are in `src/features/intelligence/evidence.ts` and appear in the app. DOIs are left out rather than risk citing a wrong one.

## 5. Algorithms of the shipped features

- **Recovery Momentum:**
  - Inputs: the mean of the last 7 days (at least 4 valid) and the 28-day baseline that ends before them.
  - Change = (mean − baseline median) in the "recovered" direction (HRV up, resting HR down).
  - It's "steady" if |change| < 0.5 × baseline spread. This is adapted from the HRV "smallest worthwhile change" (0.5 × CV); the use of MAD here is an engineering adaptation.
- **Illness Radar:**
  - For each of the last 3 days, compute a robust z of each marker against its own 28-day baseline, signed in the illness direction.
  - A marker counts as outside its range at z ≥ 2.
  - "Elevated" needs ≥ 2 markers on the same day, including resting HR or HRV.
  - The threshold is an engineering choice, aimed at fewer false positives (single-signal flags are mostly noise in the cited studies).
- **Circadian:**
  - Needs at least 7 of the last 14 nights.
  - Computes the sleep midpoint, the SD of bedtime and wake time, and social jetlag (free-day minus work-day midpoint).
  - Free days are assumed to be Friday and Saturday nights.
- **Sleep Debt:** per night, max(0, 420 − minutes asleep), summed over 7 and 14 nights. Unrecorded nights are excluded.
- **Health Trajectory:**
  - Theil–Sen slope × window length.
  - A change counts only beyond 0.5 × the marker's robust spread and with ≥ 40 % day coverage (at least 10 days).
- **True Energy:**
  - Robust z of last night's HRV, resting HR, sleep duration and awake time against the 28-day baseline.
  - "Better" or "worse" only when ≥ 2 signals agree at |z| ≥ 1.

## 6. Validation and tests

`src/features/intelligence/intelligence.test.ts` uses synthetic data with known answers. It checks:
- Features stay in *calibrating* or *unavailable* without enough data and never produce numbers then.
- One bad night on one marker doesn't trigger Illness Radar.
- Two non-core markers alone don't trigger Illness Radar either.
- A real week-long shift is detected.
- Weekend-shifted sleep is measured as social jetlag.
- A slow downward resting-HR trend is detected, while noise alone reads as stable.
- No combined health score is produced.

Still to do, which needs your own history:
- Compare Illness Radar flags with logged sick days.
- Check Recovery Momentum against how you felt.
- Calibrate Sleep Forecast against real nights once it's built.
- Re-run the feasibility table when the band starts sending Monitor files.

## 7. Privacy and data quality

- **Processing:** all analysis runs on the phone. Nothing is sent anywhere. The optional AI assistant is separate and opt-in.
- **Storage:** band files and the history stay in the browser's own storage on this device, and can be deleted from More.
- **Encryption:** the data isn't encrypted beyond what the phone already does. BetterGarmin has no server to hold a key, and a key kept next to the data wouldn't add real protection. This is a known limitation.
- **Logs:** protocol logs record counts, sizes, IDs and dates, never health values. The raw-file viewer shows values only when you open it.
- **Data quality:** handled through valid-value filters, minimum-data rules for baselines, explicit missing days, UTC sleep times, and per-device file keys for duplicates. Firmware or device changes can shift baselines; the trajectory card warns about this.

## 8. Implementation report

- **Completed:**
  - Capability inventory and marker provenance.
  - Shared engine (capability registry, personal baselines, Theil–Sen trends, confidence rules, evidence registry).
  - Recovery Momentum, Circadian Rhythm, Sleep Debt, Health Trajectory.
  - The Intelligence screen, with a *How this works* panel for every card.
  - Automated tests.
- **Experimental (shipped, labelled):** True Energy (component view only) and Illness Radar.
- **Planned once data allows:** Recovery Time, Hidden Fatigue, Exercise Adaptation, Fitness Plateau, Personal Stress Triggers (timing only).
- **Blocked by missing band data:** Rest Effectiveness and Biological Rhythm Stability. Both need the band's Monitor file.
- **Not shipped (would need validation or user input first):** Mental Readiness, Crash Predictor, Sleep Forecast, Burnout Trend, Muscle Recovery, What-If Simulator.
- **Not touched:** the existing stress detector, workout readiness and workout controls.
- **Not built, as requested:** Personal Pattern Discovery, Sleep Saboteur Finder, Heart Efficiency Intelligence, Recovery Fingerprint, Optimal Activity Dose, Anomaly Explainer.
