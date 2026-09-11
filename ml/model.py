"""
Primary detector: Mahalanobis distance to the healthy (February) baseline,
fit independently per operating-state stratum (off / offloaded / loaded).
Interpretable, fast, no training instability, and it decomposes exactly
into per-feature contributions -- explainability that falls out of the
math rather than being bolted on with a separate approximation method.

Secondary detector: Isolation Forest on the same feature matrix, provided
only as a comparison. Per the analysis, ship Mahalanobis unless Isolation
Forest demonstrably wins; do not adopt a less interpretable model that
doesn't earn its place.

Deliberately NOT provided: any RNN/LSTM/autoencoder. With four labelled
events, no per-sample labels, and a step-change onset, a deep model adds
training risk and removes explainability while buying nothing measurable
on this dataset.
"""
from __future__ import annotations

import logging
import sys
import types
from dataclasses import dataclass, field

# Windows AppControl defensive shim
try:
    import scipy.sparse.csgraph  # noqa: F401
except ImportError:
    _m = types.ModuleType("scipy.sparse.csgraph")
    _m.laplacian = lambda *a, **kw: None
    _m.minimum_spanning_tree = lambda *a, **kw: None
    _m._shortest_path = None
    _m._traversal = None
    sys.modules["scipy.sparse.csgraph"] = _m

import numpy as np
import pandas as pd
from sklearn.covariance import LedoitWolf
from sklearn.ensemble import IsolationForest

from . import config

logger = logging.getLogger(__name__)


@dataclass
class _StateModel:
    mean_: np.ndarray
    precision_: np.ndarray
    feature_names: list[str]
    train_median_: np.ndarray  # for imputing missing values at score time


class MahalanobisDetector:
    """
    Fit one shrinkage-covariance Gaussian model per operating state on
    healthy training data, then score arbitrary rows by Mahalanobis
    distance to the model matching that row's own operating state.
    """

    def __init__(self, feature_columns: list[str]):
        self.feature_columns = list(feature_columns)
        self._models: dict[str, _StateModel] = {}

    def fit(self, features: pd.DataFrame) -> "MahalanobisDetector":
        """
        `features` must contain `operating_state` plus all
        `self.feature_columns`, restricted beforehand to rows that pass the
        data-quality gate and belong to the training (healthy) period --
        that filtering is the caller's responsibility (see pipeline.py), not
        this class's, so the detector itself stays agnostic to splits.
        """
        for state in config.STATES:
            sub = features.loc[features["operating_state"] == state, self.feature_columns]
            sub = sub.dropna(axis=1, how="all")  # columns entirely NaN in this state (e.g. n/a stat)
            usable_cols = [c for c in self.feature_columns if c in sub.columns]
            sub = sub[usable_cols].dropna(axis=0, how="any")

            if len(sub) < max(30, 2 * len(usable_cols)):
                logger.warning(
                    "State '%s' has only %d clean training rows for %d features; "
                    "model for this state will be unreliable / skipped if unusable.",
                    state,
                    len(sub),
                    len(usable_cols),
                )
            if len(sub) < 5 or len(usable_cols) == 0:
                logger.warning("Skipping state '%s': insufficient training data.", state)
                continue

            lw = LedoitWolf().fit(sub.to_numpy())
            precision = np.linalg.pinv(lw.covariance_)

            self._models[state] = _StateModel(
                mean_=lw.location_,
                precision_=precision,
                feature_names=usable_cols,
                train_median_=sub.median().to_numpy(),
            )
            logger.info(
                "Fit Mahalanobis model for state '%s' on %d rows, %d features.",
                state,
                len(sub),
                len(usable_cols),
            )
        return self

    def score(self, features: pd.DataFrame) -> pd.DataFrame:
        """
        Score every row of `features` against the model for its own
        `operating_state`. Rows in a state with no fitted model, or missing
        values in an amount that would require guessing more than half the
        feature vector, get distance=NaN (the caller should route these
        through the quality gate, not treat NaN as "not anomalous").

        Returns a DataFrame indexed like `features` with columns
        [operating_state, distance] plus one `contrib__<feature>` column
        per feature used by that state's model (NaN for states/features not
        applicable to a given row).
        """
        distances = pd.Series(np.nan, index=features.index, dtype=float)
        contrib_frames = []

        for state, sm in self._models.items():
            mask = features["operating_state"] == state
            if not mask.any():
                continue
            X = features.loc[mask, sm.feature_names].copy()

            # Impute missing values with the training median for that
            # feature/state rather than dropping the row outright; the
            # quality gate upstream is what should be deciding whether this
            # window is trustworthy at all.
            n_missing = X.isna().sum(axis=1)
            frac_missing = n_missing / max(len(sm.feature_names), 1)
            X = X.fillna(pd.Series(sm.train_median_, index=sm.feature_names))

            diff = X.to_numpy() - sm.mean_
            # per-row contribution_i = diff_i * (Precision @ diff)_i ; sums exactly to d^2
            weighted = diff @ sm.precision_.T
            contrib = diff * weighted
            d2 = contrib.sum(axis=1)
            d2 = np.clip(d2, a_min=0.0, a_max=None)
            d = np.sqrt(d2)

            # Penalize (rather than hide) rows that needed heavy imputation:
            # distance is still reported, but flagged via NaN when more than
            # half the feature vector was missing -- those should fail the
            # quality gate anyway and be routed to INSUFFICIENT EVIDENCE.
            d = np.where(frac_missing.to_numpy() > 0.5, np.nan, d)

            distances.loc[mask] = d

            contrib_df = pd.DataFrame(
                contrib, index=X.index, columns=[f"contrib__{c}" for c in sm.feature_names]
            )
            contrib_frames.append(contrib_df)

        result = pd.DataFrame({"operating_state": features["operating_state"], "distance": distances})
        if contrib_frames:
            all_contrib = pd.concat(contrib_frames, axis=0).reindex(features.index)
            result = pd.concat([result, all_contrib], axis=1)
        return result

    def top_contributors(self, scored_row: pd.Series, n: int = 5) -> list[tuple[str, float]]:
        """Rank features by their (non-negative) contribution to one scored row's distance."""
        contrib_cols = [c for c in scored_row.index if c.startswith("contrib__")]
        pairs = [(c.replace("contrib__", ""), float(scored_row[c])) for c in contrib_cols if pd.notna(scored_row[c])]
        pairs.sort(key=lambda p: p[1], reverse=True)
        return pairs[:n]

    def n_contributing_sensors(self, scored_row: pd.Series, per_feature_threshold: float = 2.0) -> int:
        """
        Count features whose individual (signed-magnitude, i.e. sqrt of
        their contribution) deviation exceeds `per_feature_threshold`
        "sigma-equivalents" -- used by decision.py's multi-sensor-agreement
        check.
        """
        contrib_cols = [c for c in scored_row.index if c.startswith("contrib__")]
        vals = scored_row[contrib_cols].dropna()
        if vals.empty:
            return 0
        return int((np.sqrt(vals.clip(lower=0)) > per_feature_threshold).sum())

    def contributing_sensor_counts(
        self, scored_df: pd.DataFrame, per_feature_threshold: float = 2.0
    ) -> pd.Series:
        """
        Vectorised computation of contributing sensor counts across an entire
        scored DataFrame.
        """
        contrib_cols = [c for c in scored_df.columns if c.startswith("contrib__")]
        if not contrib_cols:
            return pd.Series(0, index=scored_df.index, dtype=int)
        vals = scored_df[contrib_cols].fillna(0.0).to_numpy()
        counts = (np.sqrt(np.clip(vals, 0.0, None)) > per_feature_threshold).sum(axis=1)
        return pd.Series(counts, index=scored_df.index, dtype=int)


class IsolationForestDetector:
    """
    Secondary baseline model, trained the same way (per operating state, on
    the healthy training split). Reported alongside Mahalanobis only to
    show whether it earns a place; not used for the shipped decision logic
    unless it measurably outperforms Mahalanobis on the calibration split.
    """

    def __init__(self, feature_columns: list[str], random_state: int = 42, n_estimators: int = 200):
        self.feature_columns = list(feature_columns)
        self.random_state = random_state
        self.n_estimators = n_estimators
        self._models: dict[str, tuple[IsolationForest, list[str], np.ndarray]] = {}

    def fit(self, features: pd.DataFrame) -> "IsolationForestDetector":
        for state in config.STATES:
            sub = features.loc[features["operating_state"] == state, self.feature_columns]
            sub = sub.dropna(axis=1, how="all")
            usable_cols = [c for c in self.feature_columns if c in sub.columns]
            sub = sub[usable_cols].dropna(axis=0, how="any")
            if len(sub) < 20:
                continue
            model = IsolationForest(
                n_estimators=self.n_estimators, random_state=self.random_state, contamination="auto"
            )
            model.fit(sub.to_numpy())
            self._models[state] = (model, usable_cols, sub.median().to_numpy())
        return self

    def score(self, features: pd.DataFrame) -> pd.Series:
        """Higher = more anomalous (negated sklearn score_samples, so it's comparable in direction to Mahalanobis distance)."""
        out = pd.Series(np.nan, index=features.index, dtype=float)
        for state, (model, cols, median) in self._models.items():
            mask = features["operating_state"] == state
            if not mask.any():
                continue
            X = features.loc[mask, cols].fillna(pd.Series(median, index=cols))
            out.loc[mask] = -model.score_samples(X.to_numpy())
        return out
