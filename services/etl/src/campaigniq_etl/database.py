from sqlalchemy import (
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


def create_etl_engine(database_url: str) -> Engine:
    if database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    return create_engine(database_url, pool_pre_ping=True)
