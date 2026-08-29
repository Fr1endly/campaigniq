import json
import os
from collections.abc import Iterator
from datetime import date
from decimal import Decimal
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from dotenv import load_dotenv
from sqlalchemy import delete, func, insert, select, text
from sqlalchemy.engine import Connection, Engine

from campaigniq_etl.cli import main as cli_main
from campaigniq_etl.database import (
    campaigns,
    create_etl_engine,
    data_quality_issues,
    import_runs,
    marketing_performance,
    organizations,
    warehouse_refresh_state,
)
from campaigniq_etl.models import CanonicalRecord
from campaigniq_etl.pipeline import ImportProcessor, ImportSetupError

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="module")
def engine() -> Iterator[Engine]:
    load_dotenv()
    database_url = os.getenv(
        "DATABASE_URL", "postgresql://campaign_iq:campaign_iq@localhost:5432/campaign_iq"
    )
    etl_engine = create_etl_engine(database_url)
    with etl_engine.connect() as connection:
        connection.execute(select(1))
    yield etl_engine
    etl_engine.dispose()


@pytest.fixture
def organization_id(engine: Engine) -> Iterator[UUID]:
    organization_id = uuid4()
    with engine.begin() as connection:
        connection.execute(
            text(
                'insert into "organization" (id, name, slug, created_at) '
                "values (:id, :name, :slug, now())"
            ),
            {
                "id": organization_id,
                "name": "ETL Test Organization",
                "slug": f"etl-test-{organization_id}",
            },
        )
    yield organization_id
    with engine.begin() as connection:
        connection.execute(delete(organizations).where(organizations.c.id == organization_id))


@pytest.mark.integration
def test_loads_duplicates_and_retries_idempotently(engine: Engine, organization_id: UUID) -> None:
    processor = ImportProcessor(engine, chunk_size=1)
    result = processor.process(FIXTURES / "duplicate.csv", organization_id)

    assert result.status == "completed"
    assert (result.received_rows, result.loaded_rows, result.rejected_rows) == (3, 2, 1)
    assert (result.inserted_rows, result.updated_rows, result.unchanged_rows) == (2, 0, 0)

    with engine.connect() as connection:
        run = connection.execute(
            select(import_runs).where(import_runs.c.id == result.import_run_id)
        ).one()
        issue = connection.execute(
            select(data_quality_issues).where(
                data_quality_issues.c.import_run_id == result.import_run_id
            )
        ).one()
        campaign = connection.execute(
            select(campaigns).where(campaigns.c.organization_id == organization_id)
        ).one()
        facts = connection.execute(
            select(marketing_performance).where(
                marketing_performance.c.organization_id == organization_id
            )
        ).all()

    assert run.status == "completed"
    assert (run.received_rows, run.loaded_rows, run.rejected_rows) == (3, 2, 1)
    assert (issue.issue_type, issue.field, issue.count) == ("duplicate_record", None, 1)
    assert campaign.name == "Summer Sale Updated"
    assert len(facts) == 2

    retry = processor.process(
        FIXTURES / "duplicate.csv", organization_id, import_run_id=result.import_run_id
    )
    assert retry.status == "completed"
    with engine.connect() as connection:
        fact_count = connection.scalar(
            select(func.count())
            .select_from(marketing_performance)
            .where(marketing_performance.c.organization_id == organization_id)
        )
        issue_count = connection.scalar(
            select(func.sum(data_quality_issues.c.count)).where(
                data_quality_issues.c.import_run_id == result.import_run_id
            )
        )
    assert fact_count == 2
    assert issue_count == 1


@pytest.mark.integration
def test_incremental_import_overwrites_facts_and_provenance(
    engine: Engine, organization_id: UUID
) -> None:
    processor = ImportProcessor(engine, chunk_size=1)
    first = processor.process(FIXTURES / "duplicate.csv", organization_id)
    second = processor.process(FIXTURES / "incremental.csv", organization_id)

    assert first.status == second.status == "completed"
    assert (second.received_rows, second.loaded_rows, second.rejected_rows) == (3, 3, 0)
    assert (second.inserted_rows, second.updated_rows, second.unchanged_rows) == (1, 1, 1)
    with engine.connect() as connection:
        campaign = connection.execute(
            select(campaigns).where(campaigns.c.organization_id == organization_id)
        ).one()
        updated_fact = connection.execute(
            select(marketing_performance).where(
                marketing_performance.c.organization_id == organization_id,
                marketing_performance.c.date == date(2026, 8, 2),
            )
        ).one()
        unchanged_fact = connection.execute(
            select(marketing_performance).where(
                marketing_performance.c.organization_id == organization_id,
                marketing_performance.c.date == date(2026, 8, 1),
            )
        ).one()
        fact_count = connection.scalar(
            select(func.count())
            .select_from(marketing_performance)
            .where(marketing_performance.c.organization_id == organization_id)
        )

    assert campaign.name == "Summer Refresh"
    assert updated_fact.impressions == 900
    assert updated_fact.spend == Decimal("92.00")
    assert updated_fact.import_run_id == second.import_run_id
    assert unchanged_fact.import_run_id == first.import_run_id
    assert fact_count == 3
    with engine.connect() as connection:
        refresh_state = connection.execute(select(warehouse_refresh_state)).one()
    assert refresh_state.status == "current"
    assert refresh_state.data_revision == refresh_state.refreshed_revision


@pytest.mark.integration
def test_aggregates_one_issue_per_rejected_row(engine: Engine, organization_id: UUID) -> None:
    result = ImportProcessor(engine, chunk_size=3).process(
        FIXTURES / "malformed.csv", organization_id
    )

    assert result.status == "completed"
    assert (result.received_rows, result.loaded_rows, result.rejected_rows) == (8, 0, 8)
    with engine.connect() as connection:
        issues = connection.execute(
            select(
                data_quality_issues.c.issue_type,
                data_quality_issues.c.field,
                data_quality_issues.c.count,
            ).where(data_quality_issues.c.import_run_id == result.import_run_id)
        ).all()
    assert sum(issue._mapping["count"] for issue in issues) == result.rejected_rows
    assert ("negative_value", "impressions", 1) in {
        (issue.issue_type, issue.field, issue.count) for issue in issues
    }


@pytest.mark.integration
def test_processes_a_precreated_run_and_preserves_tenant_isolation(engine: Engine) -> None:
    first_org = uuid4()
    second_org = uuid4()
    run_id = uuid4()
    with engine.begin() as connection:
        for organization_id in (first_org, second_org):
            connection.execute(
                text(
                    'insert into "organization" (id, name, slug, created_at) '
                    "values (:id, :name, :slug, now())"
                ),
                {
                    "id": organization_id,
                    "name": "Tenant Test",
                    "slug": f"tenant-test-{organization_id}",
                },
            )
        connection.execute(
            insert(import_runs).values(
                id=run_id,
                organization_id=first_org,
                filename="valid.csv",
                status="received",
                received_rows=0,
                loaded_rows=0,
                rejected_rows=0,
            )
        )

    try:
        processor = ImportProcessor(engine)
        result = processor.process(FIXTURES / "valid.csv", first_org, import_run_id=run_id)
        second_result = processor.process(FIXTURES / "valid.csv", second_org)

        assert result.import_run_id == run_id
        assert result.status == second_result.status == "completed"
        with engine.connect() as connection:
            per_tenant = connection.execute(
                select(campaigns.c.organization_id, func.count().label("count"))
                .where(campaigns.c.organization_id.in_([first_org, second_org]))
                .group_by(campaigns.c.organization_id)
            ).all()
        assert {row.organization_id: row.count for row in per_tenant} == {
            first_org: 2,
            second_org: 2,
        }

        with pytest.raises(ImportSetupError, match="does not exist for this organization"):
            processor.process(FIXTURES / "valid.csv", second_org, import_run_id=run_id)
    finally:
        with engine.begin() as connection:
            connection.execute(
                delete(organizations).where(organizations.c.id.in_([first_org, second_org]))
            )


class FailingProcessor(ImportProcessor):
    def _upsert_records(
        self,
        connection: Connection,
        organization_id: UUID,
        run_id: UUID,
        records: list[CanonicalRecord],
    ) -> tuple[int, int, int]:
        super()._upsert_records(connection, organization_id, run_id, records)
        raise RuntimeError("forced load failure")


@pytest.mark.integration
def test_rolls_back_warehouse_writes_and_records_failure(
    engine: Engine, organization_id: UUID
) -> None:
    result = FailingProcessor(engine, chunk_size=1).process(FIXTURES / "valid.csv", organization_id)

    assert result.status == "failed"
    assert result.error_message == "forced load failure"
    with engine.connect() as connection:
        run = connection.execute(
            select(import_runs).where(import_runs.c.id == result.import_run_id)
        ).one()
        campaign_count = connection.scalar(
            select(func.count())
            .select_from(campaigns)
            .where(campaigns.c.organization_id == organization_id)
        )
        fact_count = connection.scalar(
            select(func.count())
            .select_from(marketing_performance)
            .where(marketing_performance.c.organization_id == organization_id)
        )

    assert run.status == "failed"
    assert run.loaded_rows == run.rejected_rows == 0
    assert run.error_message == "forced load failure"
    assert campaign_count == fact_count == 0


@pytest.mark.integration
def test_structural_file_error_marks_the_run_failed(engine: Engine, organization_id: UUID) -> None:
    result = ImportProcessor(engine).process(FIXTURES / "structural_invalid.csv", organization_id)

    assert result.status == "failed"
    assert result.received_rows == result.loaded_rows == result.rejected_rows == 0
    assert result.error_message == "missing required CSV columns: revenue"


@pytest.mark.integration
def test_completes_a_header_only_file(engine: Engine, organization_id: UUID) -> None:
    result = ImportProcessor(engine).process(FIXTURES / "header_only.csv", organization_id)

    assert result.status == "completed"
    assert result.received_rows == result.loaded_rows == result.rejected_rows == 0


@pytest.mark.integration
def test_rejects_a_run_that_is_already_processing(engine: Engine, organization_id: UUID) -> None:
    run_id = uuid4()
    with engine.begin() as connection:
        connection.execute(
            insert(import_runs).values(
                id=run_id,
                organization_id=organization_id,
                filename="valid.csv",
                status="processing",
                received_rows=0,
                loaded_rows=0,
                rejected_rows=0,
            )
        )

    with pytest.raises(ImportSetupError, match="already processing"):
        ImportProcessor(engine).process(
            FIXTURES / "valid.csv", organization_id, import_run_id=run_id
        )


@pytest.mark.integration
def test_cli_emits_a_json_summary(
    engine: Engine,
    organization_id: UUID,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setenv("DATABASE_URL", engine.url.render_as_string(hide_password=False))

    exit_code = cli_main(
        [
            "load",
            "--file",
            str(FIXTURES / "valid.csv"),
            "--organization-id",
            str(organization_id),
            "--chunk-size",
            "1",
        ]
    )
    payload = json.loads(capsys.readouterr().out)

    assert exit_code == 0
    assert payload["status"] == "completed"
    assert (payload["received_rows"], payload["loaded_rows"], payload["rejected_rows"]) == (
        3,
        3,
        0,
    )
