# Training analytics — audit, data model and roadmap

## 1. What the app is (constraints everything else follows from)

- **No backend, no accounts.** BetterGarmin is a static PWA. Garmin data is GarminDB's SQLite files, loaded into
  sql.js in a Web Worker (from a file drop, the demo set, or the optional self-hosted R2 cloud sync). Strength-log
  data lives in the browser's IndexedDB. Nothing is uploaded. "Users can only see their own data" holds by
  construction: there is no shared store to leak from.
- **No direct Garmin API.** Everything comes from what GarminDB exports. There are no OAuth scopes to extend.

## 2. Garmin data that is genuinely available

| Data | Source table | Resolution | Notes |
| --- | --- | --- | --- |
| HR during a recorded activity | `activity_records.hr` | ~1 s (device dependent) | Best source for set-level analysis. Only exists if the watch recorded an activity. |
| All-day HR | `monitoring_hr` | ~1–2 min | Fallback when no activity was recorded. Too coarse for per-set stats — labelled "coarse HR". |
| Activity summary | `activities` | per activity | Calories, avg/max HR, training load, aerobic/anaerobic training effect, self-evaluation feel/effort. |
| Resting HR | `resting_hr` | daily | |
| HRV | `hrv` (daily summary), `monitoring_hrv_value` | nightly / ~5 min overnight | Device dependent. |
| Sleep | `sleep`, `sleep_events` | nightly / stage events | Score, stages, timing. |
| Stress, Body Battery | `stress`, `daily_summary` | ~3 min / daily | |
| Respiration | `monitoring_rr` | ~2 min | |

**Not available — and not faked:**

- **Garmin's rep/set detection.** GarminDB parses the FIT `set` messages but does not store them.
- **Recovery-time recommendation, training status, acute/chronic load ratio.** Not exported by GarminDB.
- **Accelerometer / movement data.** Not exported, so there is no velocity, bar speed or movement-based set detection.

## 3. What the import pipeline provides (Element 26 JSON)

| Field | Available | Notes |
| --- | --- | --- |
| Workout start/end | ✅ ISO-8601 UTC | |
| Exercise names, order | ✅ | Mapped to muscle groups by the catalog, then by keyword. |
| Reps, weight, units | ✅ | lb → kg on import. Unknown units are warned about, not guessed. |
| Warm-up flag, RPE, PR flag, note, side | ✅ | |
| Technique (drop set / superset / to failure) | ✅ when labelled | Becomes `setType`. |
| RIR | ✅ if present in the file | |
| **Set timestamp** | ⚠️ **one per set** | When the set was *logged* (≈ its end). |
| Rest before set | ✅ app-reported | Used to *estimate* set start. |
| Set start / end as separate fields | ❌ | Never claimed. Starts are estimated or user-corrected. |

## 4. Data model (IndexedDB `bettergarmin-strength-log`, v2)

- `workouts`, `sets` — normalized records as imported. **Never modified by corrections.**
- `imports` — the original source file, verbatim, per workout.
- `corrections` — user edits layered on top:
  - `set:<id>` holds start and end overrides.
  - `workout:<id>` holds a clock offset.
- Every derived number is computed on the fly by a pure engine (`src/features/training/workoutTimeline.ts`). The
  engine takes (workout, sets, corrections, offset, HR samples), so results are reproducible and recalculate
  whenever any input changes. `ALIGNMENT_VERSION` identifies the method.

## 5. Alignment method (what every set-level number means)

- **Set end** = logged time (or a correction).
- **Set start** = previous set's end + reported rest (or a correction). Without either, the start falls back to end − 40 s and is labelled as such.
- Each boundary carries its provenance: `logged`, `corrected`, `estimated-from-rest`, `estimated-default` or `clamped`.
- **Clock offset**: added to every workout-side time. This fixes phone-vs-watch drift and time-zone mismatches (for example, after travel).
- **HR samples** are cleaned before use: values outside 30–230 bpm are dropped, and duplicates are removed.
- **Intervals** are half-open `[start, end)`, so a boundary sample belongs to exactly one segment.
- **Missing data**: a gap between samples longer than 60 s counts as missing. Lines break there, nothing is interpolated, and coverage reports the fraction actually covered.
- **Pre-set HR** = mean over the 15 s before start.
- **Rest checkpoints** (+30 s, +60 s) = the nearest sample within 5 s, else blank.
- **Drop in 60 s** = HR at rest start − HR at +60 s. Defined only when both values were measured.
- **Back near pre-set** = the first sample at or below (pre-set HR + 10 bpm) during that rest.
- **Confidence**:
  - **high** — both boundaries measured or corrected, and ≥ 80% HR coverage.
  - **medium** — start estimated from rest, and ≥ 80% coverage.
  - **low** — otherwise, or when the estimated set is implausibly long (> 2 min, which usually means the reported rest was too short).
  - **none** — no samples.

HR is presented as cardiovascular response only. It is never used as a proxy for muscular fatigue, effort, reps, RPE or failure.

## 6. Roadmap status

| Phase | Status |
| --- | --- |
| 1. Audit and data foundation | ✅ |
| 2. Synchronization and set analysis | ✅ |
| 3. Interactive workout experience | ✅ Zoomable timeline with a load/reps panel sharing its zoom and crosshair, set selection, set panel, boundary editing (±5 s nudges and sliders), replay (play/pause, 10–60×, scrub, jump to exercise; shows the last real HR sample and its age, never interpolated) and workout comparison. |
| 4. Historical analytics | ✅ Robust baselines (median/MAD, minimum n = 14) and a history view (7 d / 28 d / 90 d / 1 y / custom, one panel per metric with its own usual-range band). Per-exercise progression compares each exercise only with itself. HR-response trends per exercise use watch activities only. |
| 5. Intelligent insights | ✅ Recovery indicators (no composite score). Findings feed with evidence levels, methods, alternative explanations, links, and useful/dismiss buttons; a dismissed finding resurfaces when what it says changes. Also covers sleep vs. performance, time of day, rest vs. reps, volume vs. resting HR, and routine changes. |
| 6. Research and AI assistant | ✅ Personal experiments (5 templates; exploratory or prospective from a start date). Gemini assistant with your own key: off by default, the key stays in this browser, only computed results are sent (viewable via "Show exactly what is sent"), and citations to non-existent findings are dropped. |

### How the analyses avoid false confidence

- **Comparing like with like.** Session performance is each exercise's top-set e1RM divided by its own median over the previous 8 sessions. A squat session is never compared with a curl session.
- **Groups and effect sizes.** Groups are split at your own median, ties handled. Effects use Cliff's delta, with Spearman for weekly relationships.
- **Minimum sample sizes:** 5 per group, 10 sessions for the sleep analysis, 8 weeks for volume vs. resting HR, and 6 sessions for progression. Below these, a finding says what data is still needed instead of drawing a conclusion.
- **Evidence levels** are a conservative rule of thumb combining sample size and effect size. The UI states that they are not significance tests.
- **Shared source.** Every analysis reads one dataset (`src/features/analytics/`) and recomputes whenever the strength log, corrections or Garmin data change.

## 7. Correcting imports

- **Review screen** (`/training/strength/workout/:id/review`). Here you can:
  - rename an exercise or change its muscle group (with a "Did you mean…?" suggestion when the name matches one already in your history);
  - edit load, reps or the warm-up flag;
  - exclude likely duplicates (same exercise, load and reps logged within 10 s);
  - apply a units fix ("weights were really lb/kg").
- **Corrections are a layer, never a rewrite.** Every edit is stored as a correction; the imported sets and the original file are never modified. "Reset all edits" or re-importing restores the import exactly. Every screen reads the corrected view through one function (`src/db/applyCorrections.ts`).
- **Time-zone detection.** If the logged times overlap no strength activity, the app tries half-hour shifts up to ±14 h. It offers one only when a single shift gives at least 60% overlap with a watch-recorded strength activity and no other shift comes close.
- **Supersets and drop sets.** Both come from Element 26's technique label. Consecutive superset sets across two or more exercises form a group, and moving between partners counts as rest. Drop sets and supersets have their own colours, a bracket on the load panel, and badges in the set table.
- **Set boundaries** can be corrected three ways: drag handles on the chart, sliders, or ±5 s nudges. Only the moved boundary becomes a correction.

## 8. Known limitations

- Set boundaries are estimates unless corrected. Their accuracy depends on how promptly sets were logged and how honestly rest was reported.
- In demo mode, choosing "Try the demo" again resets the strength log to the demo seed. Simply reloading the app keeps imports and corrections.
- Manually logged workouts are still edited directly with the log form. The review/corrections layer is for imports, where an original exists to preserve.
- HR-response findings use only watch-recorded activities. All-day monitoring HR is too coarse for per-set statistics.
- Gemini is called directly from the browser with your key, so requests and quota are between you and Google.
