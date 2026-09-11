"""
Load the raw MetroPT-3 CSV and apply the fixed, documented cleanup steps:
drop the stale row-index column and the redundant Reservoirs column, parse
timestamps, and validate the schema. No aggregation, resampling, or feature
computation happens here -- see preprocessing.py for that.
"""
from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

from . import config

logger = logging.getLogger(__name__)


class SchemaError(ValueError):
    """Raised when the CSV does not contain the columns MachPulse expects."""


def load_raw(csv_path: str | Path) -> pd.DataFrame:
    """
    Load the raw MetroPT-3 CSV.

    Returns a DataFrame indexed by `timestamp` (DatetimeIndex, sorted
    ascending), containing the 7 analogue + 8 digital sensor columns minus
    `Reservoirs` (duplicate of TP3, dropped here). `LPS` is retained in this
    frame -- it is excluded later, only at feature-construction time, since
    it is still needed as the baseline-alarm signal.

    Raises SchemaError if required columns are missing, which is preferable
    to silently producing NaN-filled features from a mismatched schema.
    """
    csv_path = Path(csv_path)
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV not found at {csv_path}")

    logger.info("Loading raw CSV from %s", csv_path)
    df = pd.read_csv(csv_path)

    _validate_schema(df, csv_path)

    # Drop the stale original-row-number index column, if present under any
    # of its likely names (pandas writes it as 'Unnamed: 0' if the source
    # CSV had an unlabelled leading index column).
    index_col_candidates = [c for c in df.columns if c == config.RAW_INDEX_COL or c.strip() == ""]
    if index_col_candidates:
        df = df.drop(columns=index_col_candidates)

    df[config.TIMESTAMP_COL] = pd.to_datetime(df[config.TIMESTAMP_COL])
    df = df.sort_values(config.TIMESTAMP_COL).reset_index(drop=True)

    n_before = len(df)
    dupes = df[config.TIMESTAMP_COL].duplicated().sum()
    if dupes:
        logger.warning(
            "%d duplicated timestamps found; keeping first occurrence of each.",
            dupes,
        )
        df = df.drop_duplicates(subset=[config.TIMESTAMP_COL], keep="first")

    full_dupes = df.duplicated().sum()
    if full_dupes:
        logger.warning("%d fully duplicated rows found; dropping.", full_dupes)
        df = df.drop_duplicates()

    df = df.set_index(config.TIMESTAMP_COL)

    existing_redundant = [c for c in config.REDUNDANT_COLUMNS if c in df.columns]
    if existing_redundant:
        df = df.drop(columns=existing_redundant)

    n_after = len(df)
    logger.info(
        "Loaded %d rows (%d dropped as exact/timestamp duplicates), "
        "span %s -> %s",
        n_after,
        n_before - n_after,
        df.index.min(),
        df.index.max(),
    )

    return df


def _validate_schema(df: pd.DataFrame, csv_path: Path) -> None:
    if config.TIMESTAMP_COL not in df.columns:
        raise SchemaError(
            f"'{config.TIMESTAMP_COL}' column not found in {csv_path}. "
            f"Columns present: {list(df.columns)}"
        )

    required_sensors = set(config.ALL_SENSORS) - set(config.REDUNDANT_COLUMNS)
    missing = required_sensors - set(df.columns)
    # Reservoirs itself is optional (we drop it anyway), everything else
    # required except we allow Reservoirs to be absent already.
    missing -= {"Reservoirs"}
    if missing:
        raise SchemaError(
            f"CSV at {csv_path} is missing expected sensor column(s): "
            f"{sorted(missing)}. Columns present: {list(df.columns)}"
        )
