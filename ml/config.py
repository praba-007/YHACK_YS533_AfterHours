"""
MachPulse configuration.

All thresholds and splits here are taken directly from the verified
MachPulse dataset analysis (MachPulse_Dataset_Analysis.md). Nothing in this
file is invented; where the analysis left a value to "measure", that value
is computed at runtime by the pipeline, never hard-coded here.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field


# --------------------------------------------------------------------------
# Raw schema
# --------------------------------------------------------------------------

# Column in the raw CSV that holds the original (unlabelled) row index.
# It preserves the original 1 Hz row numbers (0, 10, 20, ...) from the
# un-decimated release and carries no information here. Dropped on load.
RAW_INDEX_COL = "Unnamed: 0"

TIMESTAMP_COL = "timestamp"

ANALOGUE_SENSORS = [
    "TP2",
    "TP3",
    "H1",
    "DV_pressure",
    "Reservoirs",
    "Oil_temperature",
    "Motor_current",
]

DIGITAL_SENSORS = [
    "COMP",
    "DV_eletric",
    "Towers",
    "MPG",
    "LPS",
    "Pressure_switch",
    "Oil_level",
    "Caudal_impulses",
]

ALL_SENSORS = ANALOGUE_SENSORS + DIGITAL_SENSORS

# TP3 and Reservoirs are Pearson r = 1.000 (max abs diff 0.182 bar across
# 1.5M rows) -- effectively the same channel. Drop the duplicate.
REDUNDANT_COLUMNS = ["Reservoirs"]

# The on-board low-pressure alarm. MUST NOT be used as a model feature --
# doing so means the model learns to predict a failure from the machine's
# own existing failure alarm (classic leakage). LPS is reserved exclusively
# as a comparison baseline (see baselines.py).
LEAKAGE_COLUMNS = ["LPS"]

# Near-constant at this resolution; low information content per the
# analysis (active rates 90-99% or otherwise not discriminative for an
# air-leak signature). Not used as model features by default, but kept in
# the frame so they remain available for inspection / future work.
LOW_INFORMATION_COLUMNS = ["Oil_level", "Pressure_switch", "Caudal_impulses", "Towers", "COMP", "DV_eletric", "MPG"]

# The five sensors the analysis ranks as most useful for an air-leak
# signature. These are the ones fed into the Mahalanobis detector.
MODEL_SENSORS = ["Motor_current", "TP2", "H1", "Oil_temperature", "DV_pressure"]

# TP3 is kept for the TP3 - TP2 cross-sensor differential feature even
# though it is not in MODEL_SENSORS individually.
CROSS_SENSOR_BASE = "TP3"


# --------------------------------------------------------------------------
# Operating-state segmentation (Motor_current, amps)
# --------------------------------------------------------------------------

STATE_OFF_MAX = 0.5        # < 0.5 A -> off
STATE_OFFLOADED_MAX = 6.0  # 0.5-6 A -> offloaded; > 6 A -> loaded

STATE_OFF = "off"
STATE_OFFLOADED = "offloaded"
STATE_LOADED = "loaded"
STATES = [STATE_OFF, STATE_OFFLOADED, STATE_LOADED]


# --------------------------------------------------------------------------
# Resampling / quality
# --------------------------------------------------------------------------

RESAMPLE_FREQ = "1min"

# A gap in the raw 10s stream longer than this is a genuine data gap, not
# jitter (nominal jitter tops out around 20-22s per the analysis).
GAP_THRESHOLD_SECONDS = 60

# Never interpolate across gaps longer than this; mark the affected grid
# points as missing/absent instead.
MAX_INTERPOLATION_GAP_SECONDS = 5 * 60

# A sensor holding a bit-identical value for this many consecutive raw
# (10s-nominal) samples is flagged as a frozen/stale reading.
FROZEN_RUN_MIN_SAMPLES = 30

# Expected raw samples per 1-minute bin at a 10s nominal rate.
EXPECTED_SAMPLES_PER_MINUTE = 6

# Per-window quality gate (see decision.py): below either bound the window
# is routed to INSUFFICIENT EVIDENCE rather than being scored.
MIN_WINDOW_COVERAGE = 0.6
MAX_WINDOW_FROZEN_FRACTION = 0.2


# --------------------------------------------------------------------------
# Rolling feature windows (on the 1-minute grid)
# --------------------------------------------------------------------------

FEATURE_WINDOWS = {
    "1h": "1h",
    "6h": "6h",
    "24h": "24h",
}

# Minimum consecutive minutes with the same activation to call something a
# "distinct episode" for alarm/alert grouping (LPS, fixed threshold, model).
EPISODE_MERGE_GAP_MINUTES = 10

# Motor_current threshold and sustain duration for the "fixed threshold"
# baseline (the naive, honest baseline every competing team will build).
FIXED_THRESHOLD_AMPS = 4.0
FIXED_THRESHOLD_SUSTAIN_MINUTES = 10


# --------------------------------------------------------------------------
# Documented failure events (transcribed from Data_Description_Metro.pdf)
# --------------------------------------------------------------------------
#
# The source document numbers two separate events "#1" and has no "#2".
# Renumbered here F1-F4 in chronological order; this renumbering is a
# labelling fix only, values are transcribed exactly.
#
# The F2 report text says "Maintenance on 30 Apr at 12:00", which precedes
# the failure window it is attached to (29-30 May) -- almost certainly a
# typo for 30 May. That text is NOT silently corrected here; it is carried
# through verbatim in `report_note` and flagged in `report_note_flag` so the
# pipeline output surfaces the discrepancy instead of hiding it.


@dataclass(frozen=True)
class FailureEvent:
    event_id: str
    start: dt.datetime
    end: dt.datetime
    failure_type: str
    severity: str
    report_note: str
    report_note_flag: str = ""


FAILURE_EVENTS = [
    FailureEvent(
        event_id="F1",
        start=dt.datetime(2020, 4, 18, 0, 0),
        end=dt.datetime(2020, 4, 18, 23, 59),
        failure_type="Air leak",
        severity="High stress",
        report_note="",
    ),
    FailureEvent(
        event_id="F2",
        start=dt.datetime(2020, 5, 29, 23, 30),
        end=dt.datetime(2020, 5, 30, 6, 0),
        failure_type="Air leak",
        severity="High stress",
        report_note="Maintenance on 30 Apr at 12:00",
        report_note_flag=(
            "Source document date precedes this failure window; likely a "
            "typo for 30 May. Transcribed as-is, not corrected."
        ),
    ),
    FailureEvent(
        event_id="F3",
        start=dt.datetime(2020, 6, 5, 10, 0),
        end=dt.datetime(2020, 6, 7, 14, 30),
        failure_type="Air leak",
        severity="High stress",
        report_note="Maintenance on 8 Jun at 16:00",
    ),
    FailureEvent(
        event_id="F4",
        start=dt.datetime(2020, 7, 15, 14, 30),
        end=dt.datetime(2020, 7, 15, 19, 0),
        failure_type="Air leak",
        severity="High stress",
        report_note="Maintenance on 16 Jul at 00:00",
    ),
]

# All four documented events are the same failure mode (air leak). n=4,
# one class -- not a classification problem, and not enough to calibrate an
# absolute probability. See README / report for what this does and does not
# license claiming.


# --------------------------------------------------------------------------
# Temporal split (strictly chronological -- never random; see analysis §14)
# --------------------------------------------------------------------------

@dataclass(frozen=True)
class SplitConfig:
    train_start: dt.datetime = dt.datetime(2020, 2, 1, 0, 0)
    train_end: dt.datetime = dt.datetime(2020, 2, 29, 23, 59, 59)

    calibrate_start: dt.datetime = dt.datetime(2020, 3, 1, 0, 0)
    calibrate_end: dt.datetime = dt.datetime(2020, 4, 10, 23, 59, 59)

    test_start: dt.datetime = dt.datetime(2020, 4, 11, 0, 0)
    test_end: dt.datetime = dt.datetime(2020, 9, 1, 23, 59, 59)


SPLIT = SplitConfig()

# Target false-alarm budget used to set the calibration threshold.
CALIBRATION_FALSE_ALARM_BUDGET_PER_MONTH = 2.0

# Lead-time window: an alert is credited to a documented event if it starts
# within this many hours before the event's documented start (and before
# the event's end). This does not claim hours-ahead prediction is generally
# achievable (analysis §9 shows it mostly is not) -- it only defines how
# credit is scored so numbers are reproducible.
LEAD_CREDIT_WINDOW_HOURS = 48
