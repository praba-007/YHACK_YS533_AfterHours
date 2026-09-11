"""
Data-quality primitives operating on the raw (10s-nominal) time series.

Two real, measured defects drive everything here (see analysis §4):
  1. Temporal gaps -- long stretches of simply-absent wall-clock time.
  2. Frozen sensors -- a channel holding a bit-identical value for far
     longer than is physically plausible for a real analogue reading.

Neither is simulated; both are detected from the actual timestamps and
values at runtime.
"""
from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from . import config

logger = logging.getLogger(__name__)


def detect_gaps(index: pd.DatetimeIndex, threshold_seconds: int = config.GAP_THRESHOLD_SECONDS) -> pd.DataFrame:
    """
    Find gaps in a sorted DatetimeIndex longer than `threshold_seconds`.

    Returns a DataFrame with columns [start, end, duration_seconds], one row
    per gap, where `start` is the last timestamp before the gap and `end` is
    the first timestamp after it.
    """
    if len(index) < 2:
        return pd.DataFrame(columns=["start", "end", "duration_seconds"])

    deltas = index.to_series().diff().dt.total_seconds().to_numpy()
    gap_mask = deltas > threshold_seconds
    gap_positions = np.where(gap_mask)[0]

    rows = []
    for pos in gap_positions:
        rows.append(
            {
                "start": index[pos - 1],
                "end": index[pos],
                "duration_seconds": deltas[pos],
            }
        )
    gaps = pd.DataFrame(rows)
    if not gaps.empty:
        total_hours = gaps["duration_seconds"].sum() / 3600
        logger.info(
            "Detected %d gaps > %ds, totalling %.1f hours of missing wall-clock time.",
            len(gaps),
            threshold_seconds,
            total_hours,
        )
    return gaps


def missing_minutes_from_gaps(gaps: pd.DataFrame) -> pd.DatetimeIndex:
    """
    Expand each gap into the set of whole minutes it spans, for marking a
    1-minute resampled grid as missing rather than silently interpolated.
    """
    if gaps.empty:
        return pd.DatetimeIndex([])

    minute_ranges = []
    for _, row in gaps.iterrows():
        rng = pd.date_range(
            start=pd.Timestamp(row["start"]).ceil(config.RESAMPLE_FREQ),
            end=pd.Timestamp(row["end"]).floor(config.RESAMPLE_FREQ),
            freq=config.RESAMPLE_FREQ,
        )
        minute_ranges.append(rng)
    if not minute_ranges:
        return pd.DatetimeIndex([])
    return pd.DatetimeIndex(np.unique(np.concatenate([r.values for r in minute_ranges if len(r)])))


def detect_frozen_runs(series: pd.Series, min_samples: int = config.FROZEN_RUN_MIN_SAMPLES) -> pd.Series:
    """
    Flag a bit-identical run of >= `min_samples` consecutive raw samples in
    `series` as frozen (stale) readings.

    Returns a boolean Series aligned to `series.index`, True where the
    sample belongs to a qualifying frozen run. Consecutive-run detection is
    based on row adjacency in the (already time-sorted) series, not on
    elapsed time, matching how the analysis measured it.
    """
    values = series.to_numpy()
    n = len(values)
    if n == 0:
        return pd.Series(dtype=bool, index=series.index)

    same_as_prev = np.empty(n, dtype=bool)
    same_as_prev[0] = False
    same_as_prev[1:] = values[1:] == values[:-1]

    # run_id increments every time the value changes from the previous row
    run_id = np.cumsum(~same_as_prev)
    run_lengths = pd.Series(run_id).map(pd.Series(run_id).value_counts())

    is_frozen = (run_lengths >= min_samples).to_numpy()
    return pd.Series(is_frozen, index=series.index, name=f"{series.name}_frozen")


def frozen_summary(df: pd.DataFrame, columns: list[str] | None = None) -> pd.DataFrame:
    """
    Per-sensor summary of frozen-run hours, mirroring analysis §4's table.
    Assumes ~10s nominal spacing for the hour conversion; uses the median
    actual spacing of `df.index` instead when it differs materially.
    """
    columns = columns or [c for c in config.ANALOGUE_SENSORS if c in df.columns]

    if len(df.index) > 1:
        median_step = df.index.to_series().diff().dt.total_seconds().median()
    else:
        median_step = 10.0

    rows = []
    for col in columns:
        frozen_mask = detect_frozen_runs(df[col])
        frozen_samples = int(frozen_mask.sum())
        rows.append(
            {
                "sensor": col,
                "frozen_samples": frozen_samples,
                "frozen_hours": frozen_samples * median_step / 3600.0,
            }
        )
    return pd.DataFrame(rows).sort_values("frozen_hours", ascending=False).reset_index(drop=True)


def window_quality_score(coverage: float, longest_gap_minutes: float, frozen_fraction: float) -> float:
    """
    A single interpretable [0, 1] quality score for a feature window,
    combining coverage, the worst single gap inside the window, and the
    frozen-sample fraction. Lower is worse. This score is reported
    alongside every decision (see decision.py); it is not itself the gate
    (the gate uses the raw coverage/frozen thresholds directly).
    """
    coverage = float(np.clip(coverage, 0.0, 1.0))
    frozen_fraction = float(np.clip(frozen_fraction, 0.0, 1.0))
    # Penalize a long single gap even if overall coverage looks acceptable
    # (a window can have high average coverage but still contain one big
    # gap-crossing hole -- see analysis §13, risk 5).
    gap_penalty = float(np.clip(longest_gap_minutes / (24 * 60), 0.0, 1.0))
    score = coverage * (1 - frozen_fraction) * (1 - 0.5 * gap_penalty)
    return float(np.clip(score, 0.0, 1.0))
