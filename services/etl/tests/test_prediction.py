import os
from collections.abc import Iterator
from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from dotenv import load_dotenv
from sqlalchemy import delete, insert, select, text, update
from sqlalchemy.engine import Engine

from campaigniq_etl.database import (
    campaign_predictions,
    campaigns,
    create_etl_engine,
    marketing_performance,
    organizations,
    prediction_runs,
    warehouse_refresh_state,
)
from campaigniq_etl.prediction import (
    InsufficientPredictionData,
    PredictionGenerator,
    prepare_prediction_data,
)
from campaigniq_etl.refresh import AGGREGATE_KEY


@pytest.fixture(scope="module")
def engine() -> Iterator[Engine]:
    load_dotenv()
    database_url = os.getenv(
        "DATABASE_URL", "postgresql://campaign_iq:campaign_iq@localhost:5432/campaign_iq"
    )
    prediction_engine = create_etl_engine(database_url)
    with prediction_engine.connect() as connection:
        connection.execute(select(1))
    yield prediction_engine
    prediction_engine.dispose()


def prediction_facts(
    days: int = 120, campaign_ids: list[UUID] | None = None
) -> list[dict[str, object]]:
    ids = campaign_ids or [uuid4(), uuid4()]
    start = date(2026, 1, 1)
    rows: list[dict[str, object]] = []
    for campaign_index, campaign_id in enumerate(ids):
        for day_index in range(days):
            weekly = (day_index % 7) * 3
            revenue = Decimal(100 + campaign_index * 40 + day_index + weekly)
            rows.append(
                {
                    "campaign_id": campaign_id,
                    "channel": "Google" if campaign_index == 0 else "Meta",
                    "date": start + timedelta(days=day_index),
                    "impressions": 1_000 + day_index * 2,
                    "clicks": 100 + day_index,
                    "conversions": 10 + day_index // 10,
                    "spend": Decimal(50 + day_index) / 2,
                    "revenue": revenue,
                }
            )
    return rows


def test_builds_seven_day_targets_without_future_features() -> None:
    facts = prediction_facts()
    prepared = prepare_prediction_data(facts, campaign_count=2)
    first = prepared.samples.iloc[0]
    campaign_rows = [row for row in facts if str(row["campaign_id"]) == first["campaign_id"]]
    cutoff = first["cutoff_date"].date()
    expected_target = sum(
        Decimal(str(row["revenue"]))
        for row in campaign_rows
        if cutoff < row["date"] <= cutoff + timedelta(days=7)  # type: ignore[operator]
    )

    assert prepared.eligible_campaigns == 2
    assert len(prepared.current.index) == 2
    assert Decimal(str(first["target"])) == expected_target
    assert first["revenue_last_7d"] != first["target"]
    assert prepared.data_as_of == date(2026, 4, 30)


def test_requires_enough_organization_history() -> None:
    with pytest.raises(InsufficientPredictionData, match="At least 90 days"):
        prepare_prediction_data(prediction_facts(days=40), campaign_count=2)


@pytest.mark.integration
def test_persists_revision_scoped_predictions_idempotently(engine: Engine) -> None:
    organization_id = uuid4()
    campaign_ids = [uuid4(), uuid4()]
    with engine.begin() as connection:
        connection.execute(
            text(
                'insert into "organization" (id, name, slug, created_at) '
                "values (:id, :name, :slug, now())"
            ),
            {
                "id": organization_id,
                "name": "Prediction Test Organization",
                "slug": f"prediction-test-{organization_id}",
            },
        )
        connection.execute(
            insert(campaigns),
            [
                {
                    "id": campaign_id,
                    "organization_id": organization_id,
                    "external_id": f"PRED-{index}",
                    "name": f"Prediction Campaign {index}",
                    "channel": "Google" if index == 0 else "Meta",
                }
                for index, campaign_id in enumerate(campaign_ids)
            ],
        )
        connection.execute(
            insert(marketing_performance),
            [
                {
                    "organization_id": organization_id,
                    "campaign_id": row["campaign_id"],
                    "date": row["date"],
                    "impressions": row["impressions"],
                    "clicks": row["clicks"],
                    "conversions": row["conversions"],
                    "spend": row["spend"],
                    "revenue": row["revenue"],
                }
                for row in prediction_facts(campaign_ids=campaign_ids)
            ],
        )
        connection.execute(
            update(warehouse_refresh_state)
            .where(warehouse_refresh_state.c.aggregate_key == AGGREGATE_KEY)
            .values(data_revision=warehouse_refresh_state.c.data_revision + 1)
        )

    try:
        generator = PredictionGenerator(engine)
        first = generator.generate(organization_id)
        second = generator.generate(organization_id)

        assert first.status == second.status == "completed"
        assert first.prediction_run_id == second.prediction_run_id
        assert first.prediction_count == second.prediction_count == 2
        with engine.connect() as connection:
            run = connection.execute(
                select(prediction_runs).where(prediction_runs.c.id == first.prediction_run_id)
            ).one()
            predictions = connection.execute(
                select(campaign_predictions).where(
                    campaign_predictions.c.organization_id == organization_id
                )
            ).all()
        assert run.quality in {"beats_baseline", "below_baseline"}
        assert run.training_rows > 0
        assert all(
            row.lower_bound <= row.predicted_revenue <= row.upper_bound for row in predictions
        )
    finally:
        with engine.begin() as connection:
            connection.execute(delete(organizations).where(organizations.c.id == organization_id))
