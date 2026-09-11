"""
Trailing-window feature engineering on the 1-minute grid produced by
preprocessing.prepare().

All windows are strictly trailing (each row's window looks only at that
row's timestamp and earlier), matching analysis §13 risk 4 -- a centred
window would leak future information into a feature meant to describe "what
do we know right now".

Every distributional/trend feature that compares sensor values is computed
*within an operating-state stratum* (analysis §7, §11): comparing a loaded-
state mean against an off-state baseline produces garbage, since more than
half the record is simply the machine switched off.
"""
from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from . import config

logger = logging.getLogger(__name__)


def _rolling_slope(series: pd.Series, window: str) -> pd.Series:
    """
    Rolling linear-regression slope of `series` against elapsed minutes,
    over a trailing time-based `window`. NaNs in the window are dropped
    before fitting; windows with < 3 valid points return NaN.

    Optimized via closed-form rolling moments over a trailing window (closed='both')
    preserving exact mathematical equivalence without expensive Python loops.
    """
    if len(series) == 0:
        return pd.Series(dtype=float, index=series.index)

    # Relative minutes since start for numerical stability
    x = (series.index - series.index[0]).total_seconds() / 60.0
    valid = series.notna().astype(float)
    y = series.fillna(0.0)
    xy = x * y
    x2 = x * x

    roll = lambda ser: ser.rolling(window, closed="both", min_periods=1).sum()
    N = roll(valid)
    Sx = roll(pd.Series(x * valid, index=series.index))
    Sy = roll(y)
    Sxx = roll(pd.Series(x2 * valid, index=series.index))
    Sxy = roll(xy)

    cov = Sxy - (Sx * Sy) / N
    var_x = Sxx - (Sx ** 2) / N

    slope = np.where((N >= 3) & (var_x > 1e-12), cov / var_x, np.nan)
    return pd.Series(slope, index=series.index)


def _duty_cycle_features(grid: pd.DataFrame, label: str, window: str, window_minutes: float) -> pd.DataFrame:
    state = grid["operating_state"]
    loaded = (state == config.STATE_LOADED).astype(float)
    off = (state == config.STATE_OFF).astype(float)

    loaded_frac = loaded.rolling(window, min_periods=1).mean()
    off_frac = off.rolling(window, min_periods=1).mean()

    starts = ((loaded == 1) & (loaded.shift(1).fillna(0) == 0)).astype(float)
    starts_in_window = starts.rolling(window, min_periods=1).sum()
    starts_per_hour = starts_in_window * (60.0 / window_minutes)

    total_loaded_minutes = loaded_frac * window_minutes
    # Mean minutes per load episode = total loaded minutes / episodes that
    # started in-window; guarded against division by zero (no episodes).
    mean_episode_minutes = (total_loaded_minutes / starts_in_window.replace(0, np.nan)).fillna(0.0)

    ratio_loaded_offloaded = (loaded_frac / (1 - loaded_frac - off_frac).replace(0, np.nan)).replace(
        [np.inf, -np.inf], np.nan
    )

    return pd.DataFrame(
        {
            f"duty_loaded_frac_{label}": loaded_frac,
            f"duty_off_frac_{label}": off_frac,
            f"duty_load_starts_per_hour_{label}": starts_per_hour,
            f"duty_mean_load_episode_min_{label}": mean_episode_minutes,
            f"duty_loaded_to_offloaded_ratio_{label}": ratio_loaded_offloaded,
        }
    )


def _stratified_sensor_features(grid: pd.DataFrame, sensors: list[str], label: str, window: str) -> pd.DataFrame:
    state = grid["operating_state"]
    out = {}
    for sensor in sensors:
        if sensor not in grid.columns:
            continue
        for s in config.STATES:
            masked = grid[sensor].where(state == s)
            roll = masked.rolling(window, min_periods=1)
            prefix = f"{sensor}_{s}_{label}"
            out[f"{prefix}_mean"] = roll.mean()
            out[f"{prefix}_std"] = roll.std()
            out[f"{prefix}_min"] = roll.min()
            out[f"{prefix}_max"] = roll.max()
            out[f"{prefix}_p10"] = roll.quantile(0.10)
            out[f"{prefix}_p90"] = roll.quantile(0.90)
    return pd.DataFrame(out)


def _trend_features(grid: pd.DataFrame, sensors: list[str]) -> pd.DataFrame:
    out = {}
    for sensor in sensors:
        if sensor not in grid.columns:
            continue
        series = grid[sensor]
        slope_6h = _rolling_slope(series, config.FEATURE_WINDOWS["6h"])
        slope_24h = _rolling_slope(series, config.FEATURE_WINDOWS["24h"])
        mean_1h = series.rolling(config.FEATURE_WINDOWS["1h"], min_periods=1).mean()
        mean_24h = series.rolling(config.FEATURE_WINDOWS["24h"], min_periods=1).mean()
        out[f"{sensor}_slope_6h"] = slope_6h
        out[f"{sensor}_slope_24h"] = slope_24h
        out[f"{sensor}_mean1h_minus_mean24h"] = mean_1h - mean_24h
    return pd.DataFrame(out)


def _cross_sensor_features(grid: pd.DataFrame) -> pd.DataFrame:
    out = {}
    if config.CROSS_SENSOR_BASE in grid.columns and "TP2" in grid.columns:
        out["pressure_diff_TP3_minus_TP2"] = grid[config.CROSS_SENSOR_BASE] - grid["TP2"]
    return pd.DataFrame(out)


def _quality_features(grid: pd.DataFrame, label: str, window: str) -> pd.DataFrame:
    coverage = grid["coverage"].rolling(window, min_periods=1).mean()

    missing = grid["missing"].astype(int)
    # length (in minutes) of the missing run ending at each row, 0 if not missing
    run_id = (~grid["missing"]).cumsum()
    run_length = missing.groupby(run_id).cumsum()
    longest_gap = run_length.rolling(window, min_periods=1).max().fillna(0.0)

    frozen_cols = [c for c in grid.columns if c.endswith("_frozen")]
    if frozen_cols:
        any_frozen = grid[frozen_cols].max(axis=1).astype(float)
    else:
        any_frozen = pd.Series(0.0, index=grid.index)
    frozen_fraction = any_frozen.rolling(window, min_periods=1).mean()

    return pd.DataFrame(
        {
            f"quality_coverage_{label}": coverage,
            f"quality_longest_gap_min_{label}": longest_gap,
            f"quality_frozen_fraction_{label}": frozen_fraction,
        }
    )


def build_features(grid: pd.DataFrame, sensors: list[str] | None = None) -> pd.DataFrame:
    """
    Build the full trailing-window feature set on `grid` (output of
    preprocessing.prepare()).

    `sensors` defaults to config.MODEL_SENSORS -- the 5 sensors the
    analysis ranks as most discriminative and physically interpretable for
    an air-leak signature. TP3 is added automatically for the cross-sensor
    differential even if not in `sensors`.
    """
    sensors = list(sensors or config.MODEL_SENSORS)
    stratify_sensors = sorted(set(sensors) | {config.CROSS_SENSOR_BASE})

    window_minutes = {"1h": 60.0, "6h": 360.0, "24h": 1440.0}

    blocks = [grid[["operating_state", "coverage", "missing"]].copy()]

    for label, window in config.FEATURE_WINDOWS.items():
        blocks.append(_duty_cycle_features(grid, label, window, window_minutes[label]))
        blocks.append(_stratified_sensor_features(grid, stratify_sensors, label, window))
        blocks.append(_quality_features(grid, label, window))

    blocks.append(_trend_features(grid, sensors))
    blocks.append(_cross_sensor_features(grid))

    features = pd.concat(blocks, axis=1)
    logger.info("Built %d feature columns over %d rows.", features.shape[1], features.shape[0])
    return features


def model_feature_columns(features: pd.DataFrame, window_label: str = "24h") -> list[str]:
    """
    The subset of `features` columns actually fed to the Mahalanobis /
    IsolationForest model: the stratified distributional stats for
    `window_label`, restricted to the operating state each row is actually
    in is handled downstream (model.py) -- here we just select the
    candidate numeric columns, excluding quality/meta columns and other
    window labels, so the model isn't trained on its own gating signals.
    """
    cols = []
    for c in features.columns:
        if c in ("operating_state", "coverage", "missing"):
            continue
        if c.startswith("quality_"):
            continue
        if f"_{window_label}" in c or c.endswith("_slope_6h") or c.endswith("_slope_24h") or c.endswith(
            "mean1h_minus_mean24h"
        ) or c.startswith("pressure_diff"):
            cols.append(c)
    return cols
