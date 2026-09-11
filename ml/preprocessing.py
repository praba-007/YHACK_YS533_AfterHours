"""
Turn the raw, jittered 10s-nominal stream into a fixed 1-minute grid,
carrying data-quality information (coverage, gap membership, frozen
fraction) through the resample so later feature windows can be gated
honestly instead of silently averaging over holes.

Frozen-run and operating-state detection are done on the RAW stream before
resampling: averaging first would smear a frozen run into an ordinary-
looking mean and hide exactly the defect we want to catch.
"""
from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from . import config, quality

logger = logging.getLogger(__name__)


def segment_operating_state(motor_current: pd.Series) -> pd.Series:
    """
    Segment on Motor_current into {off, offloaded, loaded} per analysis §7:
      off       < 0.5 A
      offloaded 0.5 - 6 A
      loaded    > 6 A
    """
    state = pd.Series(config.STATE_OFFLOADED, index=motor_current.index, dtype=object)
    state[motor_current < config.STATE_OFF_MAX] = config.STATE_OFF
    state[motor_current > config.STATE_OFFLOADED_MAX] = config.STATE_LOADED
    state[motor_current.isna()] = np.nan
    state.name = "operating_state"
    return state


def add_frozen_flags(df: pd.DataFrame, columns: list[str] | None = None) -> pd.DataFrame:
    """Attach a `<col>_frozen` boolean column for each analogue sensor."""
    columns = columns or [c for c in config.ANALOGUE_SENSORS if c in df.columns and c != "Reservoirs"]
    out = df.copy()
    for col in columns:
        out[f"{col}_frozen"] = quality.detect_frozen_runs(df[col])
    return out


def build_minute_grid(raw: pd.DataFrame) -> pd.DataFrame:
    """
    Resample `raw` (already frozen-flagged, state-segmented, raw-cadence
    DataFrame indexed by timestamp) onto a fixed 1-minute grid.

    Returns a DataFrame indexed by the 1-minute grid with:
      - mean of each analogue sensor (NaN where no raw samples fall in the bin)
      - max ("any active") of each digital sensor
      - dominant operating_state for the minute
      - coverage: raw samples present / EXPECTED_SAMPLES_PER_MINUTE, capped at 1.0
      - any_frozen_<sensor>: fraction of the minute's raw samples flagged frozen
      - missing: True if the minute falls inside a documented gap and has zero
        raw samples (never interpolated across, per config.MAX_INTERPOLATION_GAP_SECONDS)
    """
    if raw.empty:
        raise ValueError("Cannot build minute grid from an empty DataFrame.")

    analogue_cols = [c for c in config.ANALOGUE_SENSORS if c in raw.columns and c != "Reservoirs"]
    digital_cols = [c for c in config.DIGITAL_SENSORS if c in raw.columns]
    frozen_cols = [c for c in raw.columns if c.endswith("_frozen")]

    resampler = raw.resample(config.RESAMPLE_FREQ)

    analogue_mean = resampler[analogue_cols].mean()
    digital_max = resampler[digital_cols].max()
    frozen_frac = resampler[frozen_cols].mean()  # mean of booleans == fraction True
    counts = resampler.size().rename("raw_sample_count")

    if "Motor_current" in analogue_mean.columns:
        state_col = segment_operating_state(analogue_mean["Motor_current"])
    elif "operating_state" in raw.columns:
        state_dummies = pd.get_dummies(raw["operating_state"])
        state_counts = state_dummies.resample(config.RESAMPLE_FREQ).sum()
        has_samples = state_counts.sum(axis=1) > 0
        state_col = state_counts.idxmax(axis=1).where(has_samples, np.nan).rename("operating_state")
    else:
        state_col = pd.Series(dtype=object, name="operating_state")

    grid = pd.concat([analogue_mean, digital_max, frozen_frac, state_col, counts], axis=1)

    grid["coverage"] = (grid["raw_sample_count"] / config.EXPECTED_SAMPLES_PER_MINUTE).clip(upper=1.0)

    gaps = quality.detect_gaps(raw.index)
    missing_minutes = quality.missing_minutes_from_gaps(gaps)
    grid["in_documented_gap"] = grid.index.isin(missing_minutes)

    # A minute with literally zero raw samples is missing regardless of
    # whether it happened to fall inside a >60s gap boundary calc; mark it
    # explicitly and never fill it in.
    grid["missing"] = (grid["raw_sample_count"] == 0) | grid["in_documented_gap"]
    grid.loc[grid["missing"], analogue_cols] = np.nan
    grid.loc[grid["missing"], "operating_state"] = np.nan

    logger.info(
        "Built 1-minute grid: %d minutes, %d marked missing (%.1f%%).",
        len(grid),
        int(grid["missing"].sum()),
        100 * grid["missing"].mean(),
    )

    return grid


def prepare(raw: pd.DataFrame) -> pd.DataFrame:
    """
    Full preprocessing entry point: frozen-flagging + state segmentation on
    raw cadence, then resample to the 1-minute grid.
    """
    if "Motor_current" not in raw.columns:
        raise ValueError("Motor_current column required for operating-state segmentation.")

    flagged = add_frozen_flags(raw)
    flagged["operating_state"] = segment_operating_state(raw["Motor_current"])

    grid = build_minute_grid(flagged)
    return grid
