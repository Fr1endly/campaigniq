# Milestone 2: Local ETL

**Completed:** August 28, 2026

**Scope:** Canonical CSV validation, transformation, deduplication, transactional
PostgreSQL loading, import metadata, and data-quality aggregation.

## Delivered

- A Python 3.12 package under `services/etl` using Pandas, SQLAlchemy, and
  psycopg.
- A `campaigniq-etl load` CLI that can create a local import run or process a
  pre-created run and emits a machine-readable JSON summary.
- Bounded CSV extraction with strict canonical headers and value coercion.
- Deterministic row validation with one primary issue per rejected row.
- Cross-chunk duplicate rejection for `date + campaign_id + channel` keys.
- Organization-scoped campaign and performance upserts using the warehouse's
  existing natural keys.
- Transactional warehouse writes and completion metadata, plus retained failed
  run metadata after rollback.
- Valid, malformed, duplicate, structural-error, and incremental-load fixtures.

## Data Behavior

Completed imports maintain:

```text
received_rows = loaded_rows + rejected_rows
sum(data_quality_issues.count) = rejected_rows
```

The first valid occurrence of an input key loads; later occurrences are
rejected. A later import overwrites an existing fact's metrics and source import
without creating a duplicate. Campaign names follow the last valid occurrence
in file order. Monetary values remain Python `Decimal` and PostgreSQL numeric
values throughout loading.

Reprocessing a completed import-run ID is an idempotent no-op. Pending and failed
runs can be processed or retried, while a run already marked processing is
rejected to avoid concurrent loads.

Structurally unusable files fail the run and do not create row-level issues.
Database failures roll back campaign, fact, issue, and completion changes before
the run is separately marked failed with a concise error.

## Verification

The milestone is covered by Ruff, strict mypy checks, pytest unit and PostgreSQL
integration tests, and the existing repository lint, typecheck, test, and build
commands.

## Deferred

Phase 3 owns import APIs, local object storage and presigned uploads, Imports and
Data Quality pages, processing-state polling, and dashboard refresh behavior.
AWS and ML remain later milestones.
