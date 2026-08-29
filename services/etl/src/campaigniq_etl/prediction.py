from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from time import monotonic
from typing import Any, TypedDict, cast
from uuid import UUID

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer  # type: ignore[import-untyped]
from sklearn.linear_model import Ridge  # type: ignore[import-untyped]
from sklearn.metrics import mean_absolute_error  # type: ignore[import-untyped]
from sklearn.pipeline import Pipeline  # type: ignore[import-untyped]
from sklearn.preprocessing import OneHotEncoder, StandardScaler  # type: ignore[import-untyped]
from sqlalchemy import func, insert, select, text, update
from sqlalchemy.engine import Engine

from campaigniq_etl.database import (
    campaign_predictions,
    campaigns,
    import_runs,
    marketing_performance,
    organizations,
    prediction_runs,
    warehouse_refresh_state,
)
from campaigniq_etl.models import PredictionResult
from campaigniq_etl.refresh import AGGREGATE_KEY

TARGET = "campaign_revenue_7d"
ALGORITHM = "ridge_regression"
MODEL_VERSION = "1"
HORIZON_DAYS = 7
LOOKBACK_DAYS = 28
HOLDOUT_DAYS = 28
MIN_ORGANIZATION_DAYS = 90
MIN_CAMPAIGN_OBSERVATIONS = 56
INTERVAL_LEVEL = 80
RIDGE_ALPHA = 1.0

NUMERIC_FEATURES = [
    "revenue_last_7d",
    "revenue_previous_7d",
    "revenue_last_28d_avg",
    "spend_last_7d",
    "impressions_last_7d",
    "clicks_last_7d",
    "conversions_last_7d",
    "roas_last_28d",
    "revenue_trend",
]
CATEGORICAL_FEATURES = ["campaign_id", "channel"]
FEATURE_LABELS = {
    "revenue_last_7d": "Recent revenue",
    "revenue_previous_7d": "Previous revenue",
    "revenue_last_28d_avg": "28-day revenue average",
    "spend_last_7d": "Recent spend",
    "impressions_last_7d": "Recent impressions",
    "clicks_last_7d": "Recent clicks",
    "conversions_last_7d": "Recent conversions",
    "roas_last_28d": "Recent ROAS",
    "revenue_trend": "Revenue trend",
}


class Driver(TypedDict):
    feature: str
    label: str
    direction: str
    contribution: str


@dataclass(frozen=True, slots=True)
class PreparedData:
    samples: pd.DataFrame
    current: pd.DataFrame
    data_as_of: date
    training_start_date: date
    training_end_date: date
    eligible_campaigns: int
    excluded_campaigns: int


class InsufficientPredictionData(RuntimeError):
    pass


class PredictionGenerator:
    def __init__(self, engine: Engine) -> None:
        self.engine = engine

    def generate(self, organization_id: UUID) -> PredictionResult:
        lock_key = f"campaigniq:predictions:{organization_id}"
        with self.engine.connect() as lock_connection:
            lock_connection.execute(
                text("select pg_advisory_lock(hashtextextended(:lock_key, 0))"),
                {"lock_key": lock_key},
            )
            try:
                return self._generate_locked(organization_id)
            finally:
                lock_connection.execute(
                    text("select pg_advisory_unlock(hashtextextended(:lock_key, 0))"),
                    {"lock_key": lock_key},
                )

    def _generate_locked(self, organization_id: UUID) -> PredictionResult:
        started = monotonic()
        run_id: UUID | None = None
        source_revision = 0
        try:
            source_revision, source_import_id, facts, campaign_count, existing_id = (
                self._load_snapshot(organization_id)
            )
            if existing_id is not None:
                return PredictionResult(
                    prediction_run_id=existing_id,
                    status="completed",
                    prediction_count=self._prediction_count(existing_id),
                    source_data_revision=source_revision,
                )

            run_id = self._start_run(organization_id, source_revision, source_import_id)
            prepared = prepare_prediction_data(facts, campaign_count)
            return self._train_and_persist(
                run_id, organization_id, source_revision, prepared, started
            )
        except InsufficientPredictionData as error:
            if run_id is None:
                raise
            self._finish_without_predictions(run_id, "insufficient_data", str(error), started)
            return PredictionResult(
                prediction_run_id=run_id,
                status="insufficient_data",
                prediction_count=0,
                source_data_revision=source_revision,
                error_message=str(error),
            )
        except Exception as error:
            if run_id is None:
                raise
            message = _sanitize_error(error)
            self._finish_without_predictions(run_id, "failed", message, started)
            return PredictionResult(
                prediction_run_id=run_id,
                status="failed",
                prediction_count=0,
                source_data_revision=source_revision,
                error_message=message,
            )

    def _load_snapshot(
        self, organization_id: UUID
    ) -> tuple[int, UUID | None, list[dict[str, object]], int, UUID | None]:
        with self.engine.begin() as connection:
            organization_exists = connection.scalar(
                select(organizations.c.id).where(organizations.c.id == organization_id)
            )
            if organization_exists is None:
                raise ValueError("organization does not exist")
            connection.execute(
                text("select pg_advisory_xact_lock_shared(hashtextextended(:organization_id, 0))"),
                {"organization_id": str(organization_id)},
            )
            source_revision = int(
                connection.scalar(
                    select(warehouse_refresh_state.c.data_revision).where(
                        warehouse_refresh_state.c.aggregate_key == AGGREGATE_KEY
                    )
                )
                or 0
            )
            source_import_id = connection.scalar(
                select(import_runs.c.id)
                .where(
                    import_runs.c.organization_id == organization_id,
                    import_runs.c.status == "completed",
                )
                .order_by(import_runs.c.completed_at.desc(), import_runs.c.id.desc())
                .limit(1)
            )
            existing_id = connection.scalar(
                select(prediction_runs.c.id)
                .where(
                    prediction_runs.c.organization_id == organization_id,
                    prediction_runs.c.source_import_run_id.is_not_distinct_from(source_import_id),
                    prediction_runs.c.status == "completed",
                    prediction_runs.c.target == TARGET,
                    prediction_runs.c.model_version == MODEL_VERSION,
                )
                .order_by(prediction_runs.c.started_at.desc())
                .limit(1)
            )
            campaign_count = int(
                connection.scalar(
                    select(func.count())
                    .select_from(campaigns)
                    .where(campaigns.c.organization_id == organization_id)
                )
                or 0
            )
            rows = connection.execute(
                select(
                    marketing_performance.c.campaign_id,
                    campaigns.c.channel,
                    marketing_performance.c.date,
                    marketing_performance.c.impressions,
                    marketing_performance.c.clicks,
                    marketing_performance.c.conversions,
                    marketing_performance.c.spend,
                    marketing_performance.c.revenue,
                )
                .join(
                    campaigns,
                    (campaigns.c.id == marketing_performance.c.campaign_id)
                    & (campaigns.c.organization_id == marketing_performance.c.organization_id),
                )
                .where(marketing_performance.c.organization_id == organization_id)
                .order_by(
                    marketing_performance.c.campaign_id,
                    marketing_performance.c.date,
                )
            ).mappings()
            facts = [dict(row) for row in rows]
        return (
            source_revision,
            cast(UUID | None, source_import_id),
            facts,
            campaign_count,
            cast(UUID | None, existing_id),
        )

    def _start_run(
        self,
        organization_id: UUID,
        source_revision: int,
        source_import_id: UUID | None,
    ) -> UUID:
        with self.engine.begin() as connection:
            run_id = connection.scalar(
                insert(prediction_runs)
                .values(
                    organization_id=organization_id,
                    status="running",
                    target=TARGET,
                    model_version=MODEL_VERSION,
                    algorithm=ALGORITHM,
                    source_data_revision=source_revision,
                    source_import_run_id=source_import_id,
                    started_at=func.now(),
                    parameters={
                        "ridge_alpha": RIDGE_ALPHA,
                        "horizon_days": HORIZON_DAYS,
                        "lookback_days": LOOKBACK_DAYS,
                        "holdout_days": HOLDOUT_DAYS,
                        "interval_level": INTERVAL_LEVEL,
                    },
                )
                .returning(prediction_runs.c.id)
            )
        assert isinstance(run_id, UUID)
        return run_id

    def _train_and_persist(
        self,
        run_id: UUID,
        organization_id: UUID,
        source_revision: int,
        prepared: PreparedData,
        started: float,
    ) -> PredictionResult:
        samples = prepared.samples
        cutoff_dates = sorted(samples["cutoff_date"].unique())
        test_dates = cutoff_dates[-HOLDOUT_DAYS:]
        test_start = pd.Timestamp(test_dates[0])
        train_end = test_start - timedelta(days=HORIZON_DAYS)
        train = samples[samples["cutoff_date"] <= train_end]
        test = samples[samples["cutoff_date"].isin(test_dates)]
        if train.empty or test.empty:
            raise InsufficientPredictionData("Not enough history for the purged holdout split")

        evaluation_model = _build_model()
        evaluation_model.fit(train[NUMERIC_FEATURES + CATEGORICAL_FEATURES], train["target"])
        evaluated = np.maximum(
            evaluation_model.predict(test[NUMERIC_FEATURES + CATEGORICAL_FEATURES]), 0
        )
        actual = test["target"].to_numpy(dtype=float)
        baseline = test["baseline"].to_numpy(dtype=float)
        mae = float(mean_absolute_error(actual, evaluated))
        baseline_mae = float(mean_absolute_error(actual, baseline))
        wape = _wape(actual, evaluated)
        baseline_wape = _wape(actual, baseline)
        residual_radius = float(np.quantile(np.abs(actual - evaluated), INTERVAL_LEVEL / 100))
        interval_coverage = float(
            np.mean(
                (actual >= np.maximum(evaluated - residual_radius, 0))
                & (actual <= evaluated + residual_radius)
            )
            * 100
        )

        final_model = _build_model()
        feature_columns = NUMERIC_FEATURES + CATEGORICAL_FEATURES
        final_model.fit(samples[feature_columns], samples["target"])
        forecast_values = np.maximum(final_model.predict(prepared.current[feature_columns]), 0)
        coefficients = _coefficient_metadata(final_model)
        forecast_start = prepared.data_as_of + timedelta(days=1)
        forecast_end = prepared.data_as_of + timedelta(days=HORIZON_DAYS)

        predictions: list[dict[str, object]] = []
        for index, (_, row) in enumerate(prepared.current.iterrows()):
            predicted = float(forecast_values[index])
            lower = max(predicted - residual_radius, 0)
            upper = max(predicted + residual_radius, predicted)
            predictions.append(
                {
                    "organization_id": organization_id,
                    "prediction_run_id": run_id,
                    "campaign_id": UUID(str(row["campaign_id"])),
                    "forecast_start_date": forecast_start,
                    "forecast_end_date": forecast_end,
                    "previous_revenue": _money(float(row["revenue_last_7d"])),
                    "predicted_revenue": _money(predicted),
                    "lower_bound": _money(lower),
                    "upper_bound": _money(upper),
                    "drivers": _prediction_drivers(final_model, row),
                }
            )

        with self.engine.begin() as connection:
            connection.execute(insert(campaign_predictions), predictions)
            connection.execute(
                update(prediction_runs)
                .where(prediction_runs.c.id == run_id)
                .values(
                    status="completed",
                    data_as_of=prepared.data_as_of,
                    training_start_date=prepared.training_start_date,
                    training_end_date=prepared.training_end_date,
                    forecast_start_date=forecast_start,
                    forecast_end_date=forecast_end,
                    training_rows=len(samples.index),
                    eligible_campaigns=prepared.eligible_campaigns,
                    excluded_campaigns=prepared.excluded_campaigns,
                    mae=_money(mae),
                    wape=_metric(wape),
                    baseline_mae=_money(baseline_mae),
                    baseline_wape=_metric(baseline_wape),
                    interval_level=INTERVAL_LEVEL,
                    interval_coverage=_metric(interval_coverage),
                    quality="beats_baseline" if wape <= baseline_wape else "below_baseline",
                    coefficients=coefficients,
                    completed_at=func.now(),
                    duration_ms=_duration_ms(started),
                    error_message=None,
                )
            )
        return PredictionResult(
            prediction_run_id=run_id,
            status="completed",
            prediction_count=len(predictions),
            source_data_revision=source_revision,
        )

    def _finish_without_predictions(
        self, run_id: UUID, status: str, message: str, started: float
    ) -> None:
        with self.engine.begin() as connection:
            connection.execute(
                update(prediction_runs)
                .where(prediction_runs.c.id == run_id)
                .values(
                    status=status,
                    completed_at=func.now(),
                    duration_ms=_duration_ms(started),
                    error_message=message,
                )
            )

    def _prediction_count(self, run_id: UUID) -> int:
        with self.engine.connect() as connection:
            return int(
                connection.scalar(
                    select(func.count())
                    .select_from(campaign_predictions)
                    .where(campaign_predictions.c.prediction_run_id == run_id)
                )
                or 0
            )


def prepare_prediction_data(facts: list[dict[str, object]], campaign_count: int) -> PreparedData:
    if not facts:
        raise InsufficientPredictionData("At least 90 days of campaign history are required")
    frame = pd.DataFrame(facts)
    frame["date"] = pd.to_datetime(frame["date"])
    for column in ["impressions", "clicks", "conversions", "spend", "revenue"]:
        frame[column] = pd.to_numeric(frame[column])
    first_date = cast(pd.Timestamp, frame["date"].min())
    data_as_of_timestamp = cast(pd.Timestamp, frame["date"].max())
    organization_days = (data_as_of_timestamp - first_date).days + 1
    if organization_days < MIN_ORGANIZATION_DAYS:
        raise InsufficientPredictionData("At least 90 days of campaign history are required")

    samples: list[dict[str, object]] = []
    current: list[dict[str, object]] = []
    eligible = 0
    for campaign_id, group in frame.groupby("campaign_id"):
        if group["date"].nunique() < MIN_CAMPAIGN_OBSERVATIONS:
            continue
        eligible += 1
        group = group.sort_values("date")
        channel = str(group.iloc[-1]["channel"])
        campaign_start = cast(pd.Timestamp, group["date"].min())
        index = pd.date_range(campaign_start, data_as_of_timestamp, freq="D")
        daily = (
            group.set_index("date")[["impressions", "clicks", "conversions", "spend", "revenue"]]
            .reindex(index, fill_value=0)
            .astype(float)
        )
        first_cutoff = campaign_start + timedelta(days=LOOKBACK_DAYS - 1)
        last_labeled_cutoff = data_as_of_timestamp - timedelta(days=HORIZON_DAYS)
        for cutoff in pd.date_range(first_cutoff, last_labeled_cutoff, freq="D"):
            features = _features(daily, cutoff)
            target = float(
                daily.loc[
                    cutoff + timedelta(days=1) : cutoff + timedelta(days=HORIZON_DAYS),
                    "revenue",
                ].sum()
            )
            samples.append(
                {
                    **features,
                    "campaign_id": str(campaign_id),
                    "channel": channel,
                    "cutoff_date": cutoff,
                    "target": target,
                    "baseline": features["revenue_last_7d"],
                }
            )
        current.append(
            {
                **_features(daily, data_as_of_timestamp),
                "campaign_id": str(campaign_id),
                "channel": channel,
                "cutoff_date": data_as_of_timestamp,
            }
        )

    if not current or not samples:
        raise InsufficientPredictionData("No campaigns have enough history for prediction")
    samples_frame = pd.DataFrame(samples)
    if samples_frame["cutoff_date"].nunique() < HOLDOUT_DAYS + HORIZON_DAYS + 1:
        raise InsufficientPredictionData("Not enough history for the purged holdout split")
    return PreparedData(
        samples=samples_frame,
        current=pd.DataFrame(current),
        data_as_of=data_as_of_timestamp.date(),
        training_start_date=first_date.date(),
        training_end_date=data_as_of_timestamp.date(),
        eligible_campaigns=eligible,
        excluded_campaigns=max(campaign_count - eligible, 0),
    )


def _features(daily: pd.DataFrame, cutoff: pd.Timestamp) -> dict[str, float]:
    last_7 = daily.loc[cutoff - timedelta(days=6) : cutoff]
    previous_7 = daily.loc[cutoff - timedelta(days=13) : cutoff - timedelta(days=7)]
    last_28 = daily.loc[cutoff - timedelta(days=27) : cutoff]
    revenue_last_7 = float(last_7["revenue"].sum())
    revenue_previous_7 = float(previous_7["revenue"].sum())
    spend_28 = float(last_28["spend"].sum())
    revenue_28 = float(last_28["revenue"].sum())
    return {
        "revenue_last_7d": revenue_last_7,
        "revenue_previous_7d": revenue_previous_7,
        "revenue_last_28d_avg": revenue_28 / LOOKBACK_DAYS,
        "spend_last_7d": float(last_7["spend"].sum()),
        "impressions_last_7d": float(last_7["impressions"].sum()),
        "clicks_last_7d": float(last_7["clicks"].sum()),
        "conversions_last_7d": float(last_7["conversions"].sum()),
        "roas_last_28d": revenue_28 / spend_28 if spend_28 else 0.0,
        "revenue_trend": (
            (revenue_last_7 - revenue_previous_7) / revenue_previous_7
            if revenue_previous_7
            else 0.0
        ),
    }


def _build_model() -> Pipeline:
    transformer = ColumnTransformer(
        [
            ("numeric", StandardScaler(), NUMERIC_FEATURES),
            (
                "categorical",
                OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                CATEGORICAL_FEATURES,
            ),
        ]
    )
    return Pipeline([("features", transformer), ("regression", Ridge(alpha=RIDGE_ALPHA))])


def _coefficient_metadata(model: Pipeline) -> dict[str, float]:
    transformer = cast(ColumnTransformer, model.named_steps["features"])
    regression = cast(Ridge, model.named_steps["regression"])
    names = transformer.get_feature_names_out()
    values = np.asarray(regression.coef_, dtype=float)
    return {str(name): round(float(value), 6) for name, value in zip(names, values, strict=True)}


def _prediction_drivers(model: Pipeline, row: pd.Series[Any]) -> list[Driver]:
    transformer = cast(ColumnTransformer, model.named_steps["features"])
    regression = cast(Ridge, model.named_steps["regression"])
    scaler = cast(StandardScaler, transformer.named_transformers_["numeric"])
    numeric_values = row[NUMERIC_FEATURES].to_numpy(dtype=float)
    standardized = (numeric_values - scaler.mean_) / scaler.scale_
    coefficients = np.asarray(regression.coef_, dtype=float)[: len(NUMERIC_FEATURES)]
    contributions = standardized * coefficients
    ranked = sorted(
        zip(NUMERIC_FEATURES, contributions, strict=True),
        key=lambda item: abs(float(item[1])),
        reverse=True,
    )[:3]
    return [
        {
            "feature": feature,
            "label": FEATURE_LABELS[feature],
            "direction": "positive" if float(contribution) >= 0 else "negative",
            "contribution": str(_signed_money(float(contribution))),
        }
        for feature, contribution in ranked
    ]


def _wape(actual: np.ndarray[Any, Any], predicted: np.ndarray[Any, Any]) -> float:
    denominator = float(np.abs(actual).sum())
    if denominator == 0:
        return 0.0
    return float(np.abs(actual - predicted).sum() / denominator * 100)


def _money(value: float) -> Decimal:
    return Decimal(str(max(value, 0.0))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _signed_money(value: float) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _metric(value: float) -> Decimal:
    return Decimal(str(max(value, 0.0))).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def _duration_ms(started: float) -> int:
    return max(0, round((monotonic() - started) * 1000))


def _sanitize_error(error: Exception) -> str:
    return str(error).splitlines()[0][:1000] or error.__class__.__name__
