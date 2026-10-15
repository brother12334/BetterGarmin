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
| 1. Audit and data foundation | ✅ Original import is preserved, a corrections layer is added, import data-quality warnings are shown, and re-import is idempotent. |
| 2. Synchronization and set analysis | ✅ Alignment engine with provenance, coverage and confidence; clock offset; set-level response and recovery metrics; manual boundary correction; previous-session comparison; tests. |
| 3. Interactive workout experience | 🟡 Done: zoomable timeline, set selection with highlighting, set panel, tap-to-select table. To do: drag-to-edit boundaries, replay, multi-chart sync (load and reps). |
| 4. Historical analytics | ⏳ Baselines currently use mean and SD (`src/scores/baselines.ts`). They need to move to robust rolling medians/MAD with minimum-n gates, plus comparable-set history and a unified history view. |
| 5. Intelligent insights | ⏳ |
| 6. Research and AI assistant | ⏳ Needs a decision. An LLM requires either a backend or a user-supplied API key, and both break the current "nothing leaves the device" guarantee. Every number would come from deterministic calculations; the model would only phrase the findings. |

## 7. Known limitations

- Set boundaries are estimates unless corrected. Their accuracy depends on how promptly sets were logged and how honestly rest was reported.
- In demo mode, choosing "Try the demo" again resets the strength log to the demo seed. Simply reloading the app keeps imports and corrections.
- The Strength session list matches workouts to activities without applying a workout's clock offset. The workout page itself does apply it.
