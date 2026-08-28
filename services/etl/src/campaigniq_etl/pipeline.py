from collections import Counter
from datetime import date
from pathlib import Path
from time import monotonic
from uuid import UUID

import pandas as pd
from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.engine import Connection, Engine

from campaigniq_etl.database import (
    campaigns,
    data_quality_issues,
    import_runs,
    marketing_performance,
    organizations,
)
from campaigniq_etl.models import CanonicalRecord, ImportResult, RowIssue
from campaigniq_etl.validation import read_csv_chunks, validate_record

IssueKey = tuple[str, str | None]


class ImportSetupError(RuntimeError):
    pass


class ImportProcessor:
    def __init__(self, engine: Engine, chunk_size: int = 10_000) -> None:
        if chunk_size <= 0:
            raise ValueError("chunk_size must be positive")
        self.engine = engine
        self.chunk_size = chunk_size

    def process(
        self,
        file_path: Path,
        organization_id: UUID,
        import_run_id: UUID | None = None,
    ) -> ImportResult:
        path = file_path.expanduser().resolve()
        if not path.is_file():
            raise ImportSetupError(f"CSV file does not exist: {path}")

        run_id, completed_result = self._prepare_run(path, organization_id, import_run_id)
        if completed_result is not None:
            return completed_result
        started = monotonic()
        received_rows = 0
        loaded_rows = 0
        rejected_rows = 0

        try:
            reader = read_csv_chunks(path, self.chunk_size)
            seen_keys: set[tuple[date, str, str]] = set()
            issue_counts: Counter[IssueKey] = Counter()

            with self.engine.begin() as connection:
                for chunk in reader:
                    received_rows += len(chunk.index)
                    records, issues = self._validate_chunk(chunk, seen_keys)
                    issue_counts.update((issue.issue_type, issue.field) for issue in issues)
                    rejected_rows += len(issues)
                    loaded_rows += len(records)
                    self._upsert_records(connection, organization_id, run_id, records)

                if received_rows != loaded_rows + rejected_rows:
                    raise RuntimeError("import row counts did not reconcile")

                duration_ms = _duration_ms(started)
                self._replace_issues(connection, run_id, issue_counts)
                connection.execute(
                    update(import_runs)
                    .where(
                        import_runs.c.id == run_id,
                        import_runs.c.organization_id == organization_id,
                    )
                    .values(
                        status="completed",
                        received_rows=received_rows,
                        loaded_rows=loaded_rows,
                        rejected_rows=rejected_rows,
                        completed_at=func.now(),
                        duration_ms=duration_ms,
                        error_message=None,
                    )
                )

            return ImportResult(
                import_run_id=run_id,
                status="completed",
                received_rows=received_rows,
                loaded_rows=loaded_rows,
                rejected_rows=rejected_rows,
                duration_ms=duration_ms,
            )
        except Exception as error:
            duration_ms = _duration_ms(started)
            message = _sanitize_error(error)
            self._mark_failed(run_id, organization_id, received_rows, duration_ms, message)
            return ImportResult(
                import_run_id=run_id,
                status="failed",
                received_rows=received_rows,
                loaded_rows=0,
                rejected_rows=0,
                duration_ms=duration_ms,
                error_message=message,
            )

    def _prepare_run(
        self, path: Path, organization_id: UUID, run_id: UUID | None
    ) -> tuple[UUID, ImportResult | None]:
        with self.engine.begin() as connection:
            organization_exists = connection.scalar(
                select(organizations.c.id).where(organizations.c.id == organization_id)
            )
            if organization_exists is None:
                raise ImportSetupError("organization does not exist")

            if run_id is None:
                created_run = connection.scalar(
                    insert(import_runs)
                    .values(
                        organization_id=organization_id,
                        filename=path.name,
                        status="received",
                        received_rows=0,
                        loaded_rows=0,
                        rejected_rows=0,
                    )
                    .returning(import_runs.c.id)
                )
                assert isinstance(created_run, UUID)
                run_id = created_run
            else:
                existing_run = connection.execute(
                    select(import_runs)
                    .where(
                        import_runs.c.id == run_id,
                        import_runs.c.organization_id == organization_id,
                    )
                    .with_for_update()
                ).one_or_none()
                if existing_run is None:
                    raise ImportSetupError("import run does not exist for this organization")
                if existing_run.status == "processing":
                    raise ImportSetupError("import run is already processing")
                if existing_run.status == "completed":
                    return run_id, ImportResult(
                        import_run_id=run_id,
                        status="completed",
                        received_rows=existing_run.received_rows,
                        loaded_rows=existing_run.loaded_rows,
                        rejected_rows=existing_run.rejected_rows,
                        duration_ms=existing_run.duration_ms or 0,
                    )

            connection.execute(
                delete(data_quality_issues).where(data_quality_issues.c.import_run_id == run_id)
            )
            connection.execute(
                update(import_runs)
                .where(
                    import_runs.c.id == run_id,
                    import_runs.c.organization_id == organization_id,
                )
                .values(
                    status="processing",
                    received_rows=0,
                    loaded_rows=0,
                    rejected_rows=0,
                    started_at=func.now(),
                    completed_at=None,
                    duration_ms=None,
                    error_message=None,
                )
            )
        return run_id, None

    @staticmethod
    def _validate_chunk(
        chunk: pd.DataFrame,
        seen_keys: set[tuple[date, str, str]],
    ) -> tuple[list[CanonicalRecord], list[RowIssue]]:
        records: list[CanonicalRecord] = []
        issues: list[RowIssue] = []
        for row in chunk.to_dict(orient="records"):
            record, issue = validate_record({str(key): value for key, value in row.items()})
            if issue is not None:
                issues.append(issue)
                continue
            assert record is not None
            if record.input_key in seen_keys:
                issues.append(RowIssue("duplicate_record", None))
                continue
            seen_keys.add(record.input_key)
            records.append(record)
        return records, issues

    def _upsert_records(
        self,
        connection: Connection,
        organization_id: UUID,
        run_id: UUID,
        records: list[CanonicalRecord],
    ) -> None:
        if not records:
            return

        campaign_rows: dict[tuple[str, str], dict[str, object]] = {}
        for record in records:
            campaign_rows[record.campaign_key] = {
                "organization_id": organization_id,
                "external_id": record.campaign_external_id,
                "name": record.campaign_name,
                "channel": record.channel,
            }

        campaign_insert = pg_insert(campaigns).values(list(campaign_rows.values()))
        campaign_result = connection.execute(
            campaign_insert.on_conflict_do_update(
                index_elements=[
                    campaigns.c.organization_id,
                    campaigns.c.external_id,
                    campaigns.c.channel,
                ],
                set_={"name": campaign_insert.excluded.name, "updated_at": func.now()},
            ).returning(campaigns.c.id, campaigns.c.external_id, campaigns.c.channel)
        )
        campaign_ids = {
            (row.external_id, row.channel): row.id for row in campaign_result.fetchall()
        }

        fact_rows = [
            {
                "organization_id": organization_id,
                "campaign_id": campaign_ids[record.campaign_key],
                "import_run_id": run_id,
                "date": record.performance_date,
                "impressions": record.impressions,
                "clicks": record.clicks,
                "conversions": record.conversions,
                "spend": record.spend,
                "revenue": record.revenue,
            }
            for record in records
        ]
        fact_insert = pg_insert(marketing_performance).values(fact_rows)
        connection.execute(
            fact_insert.on_conflict_do_update(
                index_elements=[
                    marketing_performance.c.organization_id,
                    marketing_performance.c.campaign_id,
                    marketing_performance.c.date,
                ],
                set_={
                    "import_run_id": fact_insert.excluded.import_run_id,
                    "impressions": fact_insert.excluded.impressions,
                    "clicks": fact_insert.excluded.clicks,
                    "conversions": fact_insert.excluded.conversions,
                    "spend": fact_insert.excluded.spend,
                    "revenue": fact_insert.excluded.revenue,
                },
            )
        )

    def _replace_issues(
        self,
        connection: Connection,
        run_id: UUID,
        issue_counts: Counter[IssueKey],
    ) -> None:
        connection.execute(
            delete(data_quality_issues).where(data_quality_issues.c.import_run_id == run_id)
        )
        rows = [
            {
                "import_run_id": run_id,
                "issue_type": issue_type,
                "field": field,
                "count": count,
            }
            for (issue_type, field), count in sorted(
                issue_counts.items(), key=lambda item: (item[0][0], item[0][1] or "")
            )
        ]
        if rows:
            connection.execute(insert(data_quality_issues), rows)

    def _mark_failed(
        self,
        run_id: UUID,
        organization_id: UUID,
        received_rows: int,
        duration_ms: int,
        message: str,
    ) -> None:
        with self.engine.begin() as connection:
            connection.execute(
                update(import_runs)
                .where(
                    import_runs.c.id == run_id,
                    import_runs.c.organization_id == organization_id,
                )
                .values(
                    status="failed",
                    received_rows=received_rows,
                    loaded_rows=0,
                    rejected_rows=0,
                    completed_at=func.now(),
                    duration_ms=duration_ms,
                    error_message=message,
                )
            )


def _duration_ms(started: float) -> int:
    return min(round((monotonic() - started) * 1000), 2**31 - 1)


def _sanitize_error(error: Exception) -> str:
    message = str(error).strip().splitlines()[0] if str(error).strip() else type(error).__name__
    return message[:1000]
