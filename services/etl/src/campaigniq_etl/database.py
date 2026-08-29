from sqlalchemy import (
    JSON,
    BigInteger,
    Column,
    Date,
    DateTime,
    Integer,
    MetaData,
    Numeric,
    Table,
    Text,
    create_engine,
)
from sqlalchemy import text as sql_text
from sqlalchemy.dialects.postgresql import ENUM, UUID
from sqlalchemy.engine import Engine

metadata = MetaData()

warehouse_refresh_status = ENUM(
    "current",
    "stale",
    "refreshing",
    "failed",
    name="warehouse_refresh_status",
    create_type=False,
)

warehouse_refresh_state = Table(
    "warehouse_refresh_state",
    metadata,
    Column("aggregate_key", Text, primary_key=True),
    Column("status", warehouse_refresh_status, nullable=False),
    Column("data_revision", BigInteger, nullable=False),
    Column("refreshed_revision", BigInteger, nullable=False),
    Column("started_at", DateTime(timezone=True)),
    Column("completed_at", DateTime(timezone=True)),
    Column("error_message", Text),
)

import_status = ENUM(
    "received",
    "uploading",
    "processing",
    "completed",
    "failed",
    name="import_status",
    create_type=False,
)

organizations = Table(
    "organization",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
)

campaigns = Table(
    "campaigns",
    metadata,
    Column(
        "id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=sql_text("gen_random_uuid()"),
    ),
    Column("organization_id", UUID(as_uuid=True), nullable=False),
    Column("external_id", Text, nullable=False),
    Column("name", Text, nullable=False),
    Column("channel", Text, nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
)

import_runs = Table(
    "import_runs",
    metadata,
    Column(
        "id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=sql_text("gen_random_uuid()"),
    ),
    Column("organization_id", UUID(as_uuid=True), nullable=False),
    Column("filename", Text, nullable=False),
    Column("status", import_status, nullable=False),
    Column("received_rows", BigInteger, nullable=False),
    Column("loaded_rows", BigInteger, nullable=False),
    Column("rejected_rows", BigInteger, nullable=False),
    Column("inserted_rows", BigInteger),
    Column("updated_rows", BigInteger),
    Column("unchanged_rows", BigInteger),
    Column("started_at", DateTime(timezone=True)),
    Column("completed_at", DateTime(timezone=True)),
    Column("duration_ms", Integer),
    Column("error_message", Text),
)

marketing_performance = Table(
    "marketing_performance",
    metadata,
    Column(
        "id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=sql_text("gen_random_uuid()"),
    ),
    Column("organization_id", UUID(as_uuid=True), nullable=False),
    Column("campaign_id", UUID(as_uuid=True), nullable=False),
    Column("import_run_id", UUID(as_uuid=True)),
    Column("date", Date, nullable=False),
    Column("impressions", BigInteger, nullable=False),
    Column("clicks", BigInteger, nullable=False),
    Column("conversions", BigInteger, nullable=False),
    Column("spend", Numeric(14, 2), nullable=False),
    Column("revenue", Numeric(14, 2), nullable=False),
)

data_quality_issues = Table(
    "data_quality_issues",
    metadata,
    Column(
        "id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=sql_text("gen_random_uuid()"),
    ),
    Column("import_run_id", UUID(as_uuid=True), nullable=False),
    Column("issue_type", Text, nullable=False),
    Column("field", Text),
    Column("count", BigInteger, nullable=False),
)

prediction_run_status = ENUM(
    "running",
    "completed",
    "insufficient_data",
    "failed",
    name="prediction_run_status",
    create_type=False,
)

prediction_runs = Table(
    "prediction_runs",
    metadata,
    Column(
        "id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=sql_text("gen_random_uuid()"),
    ),
    Column("organization_id", UUID(as_uuid=True), nullable=False),
    Column("status", prediction_run_status, nullable=False),
    Column("target", Text, nullable=False),
    Column("model_version", Text, nullable=False),
    Column("algorithm", Text, nullable=False),
    Column("source_data_revision", BigInteger, nullable=False),
    Column("source_import_run_id", UUID(as_uuid=True)),
    Column("data_as_of", Date),
    Column("training_start_date", Date),
    Column("training_end_date", Date),
    Column("forecast_start_date", Date),
    Column("forecast_end_date", Date),
    Column("training_rows", Integer),
    Column("eligible_campaigns", Integer),
    Column("excluded_campaigns", Integer),
    Column("mae", Numeric(18, 2)),
    Column("wape", Numeric(8, 4)),
    Column("baseline_mae", Numeric(18, 2)),
    Column("baseline_wape", Numeric(8, 4)),
    Column("interval_level", Integer),
    Column("interval_coverage", Numeric(8, 4)),
    Column("quality", Text),
    Column("parameters", JSON),
    Column("coefficients", JSON),
    Column("started_at", DateTime(timezone=True), nullable=False),
    Column("completed_at", DateTime(timezone=True)),
    Column("duration_ms", Integer),
    Column("error_message", Text),
)

campaign_predictions = Table(
    "campaign_predictions",
    metadata,
    Column(
        "id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=sql_text("gen_random_uuid()"),
    ),
    Column("organization_id", UUID(as_uuid=True), nullable=False),
    Column("prediction_run_id", UUID(as_uuid=True), nullable=False),
    Column("campaign_id", UUID(as_uuid=True), nullable=False),
    Column("forecast_start_date", Date, nullable=False),
    Column("forecast_end_date", Date, nullable=False),
    Column("previous_revenue", Numeric(18, 2), nullable=False),
    Column("predicted_revenue", Numeric(18, 2), nullable=False),
    Column("lower_bound", Numeric(18, 2), nullable=False),
    Column("upper_bound", Numeric(18, 2), nullable=False),
    Column("drivers", JSON, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
)


def create_etl_engine(database_url: str) -> Engine:
    if database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    return create_engine(database_url, pool_pre_ping=True)
