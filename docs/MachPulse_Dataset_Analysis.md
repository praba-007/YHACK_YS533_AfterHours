# MachPulse — MetroPT-3 Dataset Analysis

*All figures below computed from the uploaded `MetroPT3_AirCompressor_.csv`. Nothing inferred from the documentation where the data itself could be measured.*

---

## 1. Dataset size and rows

| Property | Value |
|---|---|
| Rows | **1,516,948** |
| Columns | 16 (unnamed integer index + timestamp + 15 sensors) |
| File size | 218 MB |
| Time span | 2020-02-01 00:00:00 → 2020-09-01 03:59:50 |
| Calendar span | 5,116 hours (~213 days) |
| Actual data time | ~4,214 hours |

**Documentation conflict — important.** The PDF states 15,169,480 instances at 1 Hz. This CSV has exactly one tenth of that (1,516,948) at 10-second intervals. This is the **downsampled 0.1 Hz release** of MetroPT-3, not the raw 1 Hz stream. The original index column preserves the original row numbers (0, 10, 20, …), which confirms the decimation.

Do not repeat the "15 million points at 1 Hz" figure in your pitch. State 1.5 M samples at 10-second resolution. A judge who checks will catch the discrepancy, and being the team that noticed it is a much better position than being the team that copied the PDF.

---

## 2. Columns

**Index column** — unnamed, original 1 Hz row number. Drop it.

**`timestamp`** — datetime, 10 s nominal.

### Analogue (7)

| Column | Unit | Meaning |
|---|---|---|
| `TP2` | bar | Pressure at the compressor |
| `TP3` | bar | Pressure at the pneumatic panel |
| `H1` | bar | Pressure from the drop when the cyclonic separator filter discharges |
| `DV_pressure` | bar | Pressure drop when air-dryer towers discharge; **zero indicates the compressor is under load** |
| `Reservoirs` | bar | Downstream reservoir pressure; should track TP3 |
| `Oil_temperature` | °C | Compressor oil temperature |
| `Motor_current` | A | One phase of the 3-phase motor. ~0 A off, ~4 A offloaded, ~7 A under load, ~9 A starting |

### Digital (8) — all strictly binary {0, 1}

| Column | Active rate | Meaning |
|---|---|---|
| `COMP` | 83.70% | Air intake valve signal; active when there is **no** air intake (off or offloaded) |
| `DV_eletric` | 16.06% | Outlet valve control; active when under load |
| `Towers` | 91.99% | 0 = tower 1 drying, 1 = tower 2 drying |
| `MPG` | 83.27% | Starts compressor under load when APU pressure drops below 8.2 bar |
| `LPS` | 0.34% | **Low-pressure switch — fires below 7 bar. This is the existing on-board alarm.** |
| `Pressure_switch` | 99.14% | Detects discharge in the air-drying towers |
| `Oil_level` | 90.42% | Active when oil is **below** expected |
| `Caudal_impulses` | 93.71% | Pulse count proxy for air flow APU → reservoirs |

---

## 3. Timestamp and true sampling interval

Nominal 10 s, with jitter:

| Δt (s) | Count | Share |
|---|---|---|
| 10 | 1,337,521 | 88.2% |
| 9 | 128,277 | 8.5% |
| 12 | 38,321 | 2.5% |
| 13 | 7,988 | 0.5% |
| 11 | 4,471 | 0.3% |
| 17–22 | 25 | negligible |

Monotonic — zero negative or zero-length steps. The jitter is small enough to ignore for windowed features, but you **must resample onto a fixed grid** before any rolling-window computation, or your window lengths silently vary.

---

## 4. Missing values — the documentation is misleading

**Cell-level: zero NaN in every column.** The PDF's "Missing Values: N/A" is technically true.

**Time-level: substantial.** There are **331 gaps longer than 60 seconds**, totalling **909.5 hours of missing wall-clock time** — about 18% of the calendar span. Largest gaps:

| Gap start | Duration |
|---|---|
| 2020-04-27 01:12 | 48.0 h |
| 2020-06-28 23:07 | 36.2 h |
| 2020-03-01 04:00 | 28.1 h |
| 2020-08-05 08:23 | 24.7 h |
| 2020-05-25 01:14 | 24.6 h |
| 2020-07-08 15:20 | 23.9 h |
| 2020-08-23 18:51 | 23.7 h |

**Frozen sensor values — a second, subtler defect.** `Oil_temperature` holds a bit-identical value across 9 runs of ≥5 minutes, totalling **141.3 hours**. The longest is **51.4 continuous hours** (2020-06-22 15:06 → 2020-06-25 05:08) at exactly 65.15 °C. Physically implausible for a real thermal measurement — this is a held/stale reading, not data.

There is also a 15-hour frozen span on **2020-04-17 09:19 → 23:59**, immediately before failure F1, where TP2, H1, Oil_temperature and Motor_current all hold constant to the last decimal.

**This is the best possible material for your data-quality engine.** You have two genuinely distinct real defects — temporal gaps and frozen sensors — that you did not invent. Detecting them and routing to INSUFFICIENT EVIDENCE is a defensible, demonstrable capability.

---

## 5. Duplicates

- Fully duplicated rows: **0**
- Duplicated timestamps: **0**

Clean on this axis. But note the **near-duplicate columns** in §6.

---

## 6. Value ranges and statistics

| Sensor | mean | std | 1% | 50% | 99% | max |
|---|---|---|---|---|---|---|
| TP2 | 1.368 | 3.251 | — | ~-0.01 | 10.352 | 10.676 |
| TP3 | 8.985 | 0.639 | — | ~9.0 | 10.140 | 10.302 |
| H1 | 7.568 | 3.333 | — | ~9.3 | 10.114 | 10.288 |
| DV_pressure | 0.056 | 0.382 | — | ~-0.02 | 2.112 | 9.844 |
| Reservoirs | 8.985 | 0.638 | — | ~9.0 | 10.138 | 10.300 |
| Oil_temperature | 62.644 | 6.516 | — | ~63 | 76.175 | 89.050 |
| Motor_current | 2.050 | 2.302 | — | ~1.0 | 6.188 | 9.295 |

### Redundancy — cut two features immediately

| Pair | Pearson r | Note |
|---|---|---|
| **TP3 ↔ Reservoirs** | **1.000** | Max absolute difference across 1.5 M rows: **0.182 bar**. Effectively the same signal. |
| **TP2 ↔ H1** | **−0.961** | Mirror pair. H1 collapses exactly when TP2 rises. |

Keep TP3, drop Reservoirs. Keep both TP2 and H1 only if you want the mirror as a consistency check; otherwise TP2 alone carries the information.

Other notable correlations: Motor_current ↔ TP2 (0.697), Motor_current ↔ Oil_temperature (0.529), Motor_current ↔ H1 (−0.600).

---

## 7. Operating states

Segmenting on `Motor_current`:

| State | Threshold | Share of samples |
|---|---|---|
| **Off** | < 0.5 A | **54.6%** |
| **Offloaded** | 0.5 – 6 A | **40.7%** |
| **Under load** | > 6 A | **4.7%** |

More than half the dataset is the machine switched off. **Any baseline or anomaly model that ignores operating state will be dominated by on/off transitions rather than machine condition.** State segmentation is not optional preprocessing here — it is the first modelling decision.

**No meaningful hour-of-day cycle.** Duty fraction across all 24 hours in healthy February sits between 0.026 and 0.039, with no day/night structure. This is useful: you do not need to model diurnal seasonality, which removes a common source of false positives.

---

## 8. Documented failure windows mapped to the CSV

From the PDF (transcribed exactly):

| Nr | Start | End | Failure | Severity | Report |
|---|---|---|---|---|---|
| #1 | 2020-04-18 00:00 | 2020-04-18 23:59 | Air leak | High stress | — |
| #1 | 2020-05-29 23:30 | 2020-05-30 06:00 | Air leak | High stress | Maintenance on 30 Apr at 12:00 |
| #3 | 2020-06-05 10:00 | 2020-06-07 14:30 | Air leak | High stress | Maintenance on 8 Jun at 16:00 |
| #4 | 2020-07-15 14:30 | 2020-07-15 19:00 | Air leak | High stress | Maintenance on 16 Jul at 00:00 |

**Two documentation defects worth stating openly in your report:**
1. Two rows are both numbered **#1**; there is no **#2**. Renumber as F1–F4 and say why.
2. The second event (29–30 May) cites *"Maintenance on 30 Apr"* — a date **before** the failure it supposedly follows. Almost certainly a typo for 30 May. Do not silently correct it; flag it.

**Coverage inside each window:**

| Event | Rows present | Rows expected | Coverage |
|---|---|---|---|
| F1 | 8,663 | ~8,634 | 100.3% |
| F2 | 2,366 | ~2,340 | 101.1% |
| F3 | 17,315 | ~18,900 | **91.6%** |
| F4 | 1,627 | ~1,620 | 100.4% |

All four windows are covered. F3 has a partial gap. (Coverage slightly above 100% reflects the 9-second jitter samples.)

**All four events are the same failure mode: air leak.** There is no oil-leak event in this file. You have n=4 events of one class.

---

## 9. Does sensor behaviour change before and during failures?

### During — yes, dramatically and unambiguously

| Sensor | Feb–Mar baseline | F1 during | F2 during | F3 during | F4 during |
|---|---|---|---|---|---|
| TP2 | 1.043 | 8.518 | 8.154 | 7.892 | 8.240 |
| H1 | 7.920 | 0.079 | 0.095 | −0.007 | 0.272 |
| Motor_current | 1.678 | 5.604 | 5.562 | 5.494 | 5.493 |
| Oil_temperature | 59.343 | 74.131 | 75.860 | 75.517 | 83.872 |
| DV_pressure | 0.008 | 1.879 | 1.920 | 2.016 | −0.009 |

The physical picture is coherent: air leaks out, pressure cannot be held, the compressor stops cycling and runs continuously under load, current stays high, oil heats up. The failure signature is enormous — **detecting the failure while it is happening is close to trivial and is not, by itself, an achievement.**

### Before — this is the critical finding

**At hourly resolution, onset is a step change, not a ramp.**

F1, hour by hour:

| Hour | Motor_current | TP2 | H1 | Oil_temp |
|---|---|---|---|---|
| 2020-04-17 08:00 | 1.37 | 0.70 | 8.27 | 54.07 |
| 09:00 – 23:00 | 0.04 (frozen) | −0.02 | 8.24 | 49.45 |
| **2020-04-18 00:00** | **4.01** | **6.00** | **2.42** | **66.25** |
| 01:00 | 5.65 | 8.56 | −0.01 | 74.24 |

F2, hour by hour:

| Hour | Motor_current | TP2 | H1 | Oil_temp |
|---|---|---|---|---|
| 2020-05-29 21:00 | 1.62 | 1.13 | 7.82 | 62.92 |
| 22:00 | 2.13 | 1.19 | 7.80 | 63.55 |
| **23:00** | **4.25** | **6.21** | **2.13** | **70.09** |
| 2020-05-30 00:00 | 5.57 | 8.22 | −0.01 | 75.50 |

In both cases the hour immediately before onset is indistinguishable from normal operation. **There is no gradual degradation ramp in the final hours.** Any claim of hours-ahead prediction from this data would be fabricated.

### What early signal does exist — at multi-day scale

Two things are real:

**(a) Precursor anomaly days.** Isolated days show the failure signature days before the reported window:
- **2020-04-12** (6 days before F1): mc 4.147, TP2 5.852, H1 3.242 — a partial event on an otherwise normal week.
- **2020-05-20** (9 days before F2): mc 5.400, TP2 7.613, H1 0.230 — a full-signature day not in any report.
- **2020-06-05** (F3's own start day): mc 3.980, TP2 5.086 — intermediate, then full failure on 6–7 June.

**(b) Slow baseline drift across the record.** Healthy-day daily means:

| Period | Motor_current | Oil_temp | TP2 | H1 | median load fraction |
|---|---|---|---|---|---|
| Early Feb | ~1.3 | ~57 | ~0.55 | ~8.4 | 0.031 |
| Early Apr | ~1.4 | ~57 | ~0.75 | ~8.2 | 0.046 |
| Late May | ~2.2 | ~67 | ~1.3 | ~7.6 | 0.037 |
| Mid Jul | ~2.5 | ~68 | ~1.4 | ~7.6 | 0.054 |
| Aug | — | — | — | — | 0.058 |

**Confounder you must state.** This drift runs February → August in Porto: winter into summer. Rising oil temperature and rising duty cycle are **exactly what ambient warming would also produce**. You cannot attribute this drift to degradation without controlling for ambient temperature, and this dataset contains **no ambient temperature channel**.

This is the single most likely place for a judge to catch you overclaiming. The correct posture: report the drift, name the confound, and say you would need an ambient channel to separate them. That answer is stronger than a confident wrong one.

---

## 10. Most useful features (3–5)

Ranked by discriminative value and physical interpretability:

1. **`Motor_current`** — the single best channel. Directly encodes off / offloaded / loaded, drives the duty-cycle features, and separates cleanly (1.7 A healthy → 5.5 A failed).
2. **`TP2`** — compressor pressure. 1.0 → 8.2 bar across all four events. Most direct expression of the leak.
3. **`Oil_temperature`** — 59 → 75–84 °C. Slower-moving, useful for trend, but **the most ambient-confounded**.
4. **`H1`** — collapses 7.9 → ~0. Redundant with TP2 (r = −0.961); keep as a cross-check rather than an independent feature.
5. **`DV_pressure`** — separates F1/F2/F3 (≈1.9–2.0) from F4 (≈−0.01), so it carries mode information the others miss.

**Excluded deliberately:**
- `Reservoirs` — duplicate of TP3.
- **`LPS` — must be excluded from features. See §13.**
- `Oil_level`, `Pressure_switch`, `Caudal_impulses`, `Towers` — near-constant; low information at this resolution.

---

## 11. Recommended window features

Resample to a fixed **1-minute** grid first (aggregating the 10 s samples), then compute over **1 h, 6 h, and 24 h** trailing windows:

**Duty-cycle features — the physically meaningful ones for an air leak:**
- fraction of window with Motor_current > 6 A (under load)
- fraction with Motor_current < 0.5 A (off)
- number of load-cycle starts per hour
- mean load-episode duration
- ratio of loaded time to offloaded time

**Distributional features per analogue sensor:** mean, std, min, max, and the 10th/90th percentiles.

**Trend features:** slope of a rolling linear fit over 6 h and 24 h; difference between the 1 h mean and the 24 h mean.

**Cross-sensor features:** TP3 − TP2 (pressure differential), Oil_temperature conditioned on load state (compute separately for loaded and offloaded samples so state changes do not masquerade as thermal drift).

**Data-quality features, computed alongside and carried through:** sample coverage in the window, longest gap, count of frozen runs, fraction of state-ambiguous samples.

**All features must be computed within operating-state strata.** Comparing a loaded-state mean against an off-state baseline produces garbage.

---

## 12. What can and cannot be legitimately supported

| Capability | Verdict | Reason |
|---|---|---|
| **Anomaly detection** | ✅ **Fully supported** | Unsupervised model on healthy February data. Failure states are far outside the healthy distribution. Ground truth for evaluation exists via the four reports. |
| **Data-quality assessment** | ✅ **Fully supported** | 909 h of gaps and 141 h of frozen values are real and measurable. |
| **Failure-state detection** | ✅ Supported, but trivial | Separation during failure is enormous. Present it as a sanity check, not a result. |
| **Degradation detection** | ⚠️ **Partially** | Multi-day drift is present but confounded by season with no ambient channel. Report as "observed trend, cause not isolable." |
| **Failure-risk estimation** | ⚠️ **Only as a relative index** | With n=4 events you cannot calibrate an absolute probability. A monotone risk index anchored to deviation from healthy baseline is defensible; a "73% chance of failure" is not. |
| **RUL** | ❌ **Not supported** | Requires run-to-failure degradation trajectories. Onset here is a step change within one hour, after a normal-looking preceding hour. There is no degradation curve to extrapolate. |
| **Fault classification** | ❌ **Not supported** | All four events are the same mode (air leak). One class is not a classification problem. |

**This directly vindicates §9 and Gap 2 of your MachineGuard README.** You wrote "only show RUL if the dataset supports it." It does not. Show the health/condition index, degradation trend, risk level, and recommendation instead — exactly the fallback you already specified.

---

## 13. Data leakage risks

**Risk 1 — `LPS`, and it is severe.** LPS is the on-board low-pressure alarm. Including it as a model input means your model learns to predict a failure from the machine's existing failure alarm. This is the classic leakage trap in this dataset, and a sharp judge will find it. **Exclude LPS from all features. Reserve it exclusively as a comparison baseline** (see §15) — where it becomes one of your strongest assets.

**Risk 2 — training on failure-window data.** Fit the healthy baseline on February only. If you fit on the whole record, failure periods contaminate the "normal" distribution and your detector goes blind to exactly what it should catch.

**Risk 3 — global normalisation.** Computing scaler statistics (mean/std, min/max) over the whole dataset leaks future information into the training window. Fit the scaler on the training period alone.

**Risk 4 — future-looking windows.** Every rolling feature must be strictly trailing. A centred window at time *t* contains information from *t+Δ*.

**Risk 5 — gap-crossing windows.** A 24 h window spanning the 48 h gap on 27 April contains ~0 h of data while appearing complete. Enforce a minimum-coverage requirement per window or route to INSUFFICIENT EVIDENCE.

**Risk 6 — tuning on the test period.** With four events, iterating thresholds against all four means your reported numbers are training numbers. Decide the split first and do not look at the held-out events until the end.

---

## 14. Most defensible temporal split

**Strictly chronological. Never random — random splitting of time series leaks trivially and will be your fastest way to lose credibility.**

| Segment | Period | Contents | Purpose |
|---|---|---|---|
| **Train (healthy)** | 2020-02-01 → 2020-02-29 | No reported failures, LPS almost entirely silent, most stable statistics in the record | Fit baseline / anomaly model on normal behaviour only |
| **Calibrate** | 2020-03-01 → 2020-04-10 | Includes LPS activity, no reported failures | Set thresholds and decision bands; measure the false-alarm rate on genuinely healthy operation |
| **Test** | 2020-04-11 → 2020-09-01 | All four failure events | Held-out evaluation |

February is the right training window on the evidence: daily means are the tightest in the record (mc 1.0–1.5, oil 55–59, TP2 0.40–0.69, H1 8.26–8.51) and LPS is silent across nearly the whole month.

**Optional strengthening if time allows:** report metrics for a leave-one-event-out variant, calibrating on three events and testing on the fourth. With n=4, be explicit that this gives an indication, not a confidence interval.

---

## 15. Baseline methods

Your comparison baselines matter more than your model here, because they are what make your result legible to a judge.

1. **`LPS`, the on-board alarm — the essential baseline.** It fired in **127 distinct episodes** across the 7 months (grouping activations separated by >10 min). Only 4 failures were reported. It also fires *after* events — 414 activations on 17 July, two days past the F4 window. Your framing writes itself: *the alarm already on the train fires 127 times for 4 real failures.* Everything you do is measured against that number.
2. **Fixed threshold on a single sensor** — e.g. Motor_current > 4 A sustained. Naive but honest, and the thing every competing team will implement.
3. **Univariate z-score against the February baseline**, per sensor.
4. **Multivariate distance** — Mahalanobis distance to the healthy distribution, computed within operating state. This is a strong, fully interpretable, non-black-box baseline and may well be good enough to *be* your model.
5. **Isolation Forest / One-Class SVM** on the windowed feature set — only if it demonstrably beats (4). Do not adopt a less interpretable model that does not earn its place.

---

## 16. Evaluation metrics

**Do not report per-sample accuracy, precision, recall, or F1.** With failure states occupying a fraction of a percent of samples, a model predicting "healthy" always scores above 99%. That number is meaningless and a judge will say so.

**Use event-based metrics:**

| Metric | Definition |
|---|---|
| **Events detected** | Of 4, how many raised an alert within the window or a defined lead period before it |
| **Detection lead time** | Minutes/hours between first sustained alert and documented onset — report per event, all four |
| **False alarm count** | Alert episodes during periods with no reported failure, over the test span |
| **False alarms per month** | The operationally meaningful normalisation |
| **Alert precision** | Alert episodes overlapping a real event ÷ total alert episodes |
| **Coverage-adjusted rate** | The above corrected for the 909 h of missing time |

**The headline comparison — this is your demo climax:**

| System | Alert episodes | Events caught | False alarms |
|---|---|---|---|
| LPS on-board alarm | 127 | *(measure)* | *(measure)* |
| Fixed threshold | *(measure)* | *(measure)* | *(measure)* |
| **MachPulse** | *(measure)* | *(measure)* | *(measure)* |

Fill this table with your own measurements. Do not pre-commit to what the numbers will be.

**Always report alongside:** number of events (4), that all are the same failure mode, and the percentage of test time excluded for insufficient coverage.

---

## 17. What MachPulse can legitimately demonstrate

- Learning a machine-specific healthy baseline from February data, unsupervised.
- Detecting all four documented failure events with measured, per-event lead times.
- Producing a continuous, interpretable health/condition index derived from deviation from that baseline.
- Ranking contributing parameters per alert, with real physical meaning (an air leak shows as duty-cycle collapse plus TP2 rise plus H1 collapse).
- Quantified false-alarm reduction against the on-board LPS alarm and against a fixed threshold, on real ground truth.
- Genuine data-quality handling: 331 gaps, 909 h of missing time, 141 h of frozen sensor values, with INSUFFICIENT EVIDENCE triggered by real defects rather than simulated ones.
- Graceful degradation under sensor loss, demonstrable live by dropping a channel.
- Multi-day baseline drift surfaced as an observation, with the seasonal confound stated.
- MONITOR / INSPECT / MAINTAIN decisions grounded in deviation magnitude, persistence, multi-sensor agreement, and data sufficiency.

## 18. What MachPulse must NOT claim

- ❌ Any RUL or "N days remaining" figure. The data does not contain degradation trajectories.
- ❌ Absolute failure probabilities. n=4 does not calibrate a probability.
- ❌ Fault-type classification. One failure mode only.
- ❌ Hours-ahead prediction of onset. The hour before onset looks normal in F1 and F2.
- ❌ That the February → August drift is degradation. It is confounded with season and there is no ambient channel.
- ❌ Generalisation to motors, pumps, or other compressors. One APU on one train.
- ❌ Per-sample accuracy figures.
- ❌ "15 million samples at 1 Hz." This file is 1.5 M at 10 s.
- ❌ That LPS-adjacent performance is impressive without stating LPS was excluded from features.

---

## Recommended Architecture — First MachPulse Prototype

### Preprocessing
1. Drop the unnamed index and `Reservoirs` (duplicate of TP3).
2. Parse timestamps; resample onto a fixed **1-minute** grid by aggregation.
3. Detect and label gaps; never interpolate across gaps >5 min — mark them absent.
4. Detect frozen runs: flag any sensor holding a bit-identical value for ≥30 consecutive raw samples.
5. Segment operating state from Motor_current: **off** (<0.5 A), **offloaded** (0.5–6 A), **loaded** (>6 A).
6. Emit a per-window **data-quality score** from coverage, longest gap, and frozen-sample fraction.

### Features
Trailing 1 h / 6 h / 24 h windows on the 1-minute grid:
- Duty-cycle set: loaded fraction, off fraction, cycle starts per hour, mean load-episode duration.
- Per-sensor (TP2, TP3, Oil_temperature, Motor_current, DV_pressure): mean, std, min, max, p10, p90 — **computed within operating state**.
- Trend: 6 h and 24 h rolling slope; 1 h mean minus 24 h mean.
- Cross-sensor: TP3 − TP2; Oil_temperature conditioned on load state.
- Quality: coverage, longest gap, frozen fraction.

### Model
**Primary: Mahalanobis distance to the February healthy distribution, computed per operating state.** Interpretable, fast, no training instability, and it decomposes naturally into per-feature contributions — which gives you explainability for free rather than bolted on.

**Secondary, only if it measurably wins: Isolation Forest** on the same feature set. Keep both, report both, and if Mahalanobis is competitive, ship Mahalanobis and say why. "We chose the interpretable model because it performed comparably" is a strong answer to a judge.

**Do not use an LSTM or autoencoder.** With four events, no per-sample labels, and a step-change onset, a deep model adds training risk and removes explainability while buying nothing you can demonstrate.

### Training strategy
- Fit exclusively on **February 2020**, and only on samples passing the quality gate.
- Fit scalers and covariance on the training window alone.
- Set decision thresholds on the **March – 10 April** calibration window, targeting a stated false-alarm budget (e.g. ≤2 alert episodes per month on healthy data).
- Never touch the test period until evaluation.

### Evaluation
- Event-based only, per §16.
- Report all three systems side by side: LPS, fixed threshold, MachPulse.
- Report per-event lead time individually — four numbers, not an average.
- State excluded time and the coverage adjustment.

### Explanation method
Decompose the Mahalanobis distance into per-feature contributions — mathematically exact, no approximation, and directly usable as your "contributing parameters" panel. Render as a ranked bar list with each feature's current value against its healthy band.

If you later add Isolation Forest, use SHAP for it — but do not introduce SHAP if Mahalanobis is your shipping model, since the exact decomposition is strictly better.

### Confidence and data-quality handling
Route the final decision through a gate:

```
if window_coverage < 0.6 or frozen_fraction > 0.2:
    → INSUFFICIENT EVIDENCE
elif deviation low and stable:
    → MONITOR
elif deviation elevated, persistent across ≥2 windows, ≥2 sensors agree:
    → INSPECT
elif deviation severe and sustained:
    → MAINTAIN
```

Persistence and multi-sensor agreement are what suppress false alarms. Both are directly measurable against the LPS baseline, which is what turns your false-alarm claim into evidence.

Attach to every decision: the data-quality score, the number of contributing sensors, and the window coverage. A decision without those three numbers is not defensible.

---

**Do not begin implementation until the team agrees on the split in §14 and the exclusion of LPS in §13. Those two decisions determine whether every number you produce afterwards is credible.**
