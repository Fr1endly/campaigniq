from dataclasses import asdict, dataclass
from datetime import date
from decimal import Decimal
from typing import Literal
from uuid import UUID


@dataclass(frozen=True, slots=True)
class CanonicalRecord:
    performance_date: date
    campaign_external_id: str
    campaign_name: str
    channel: str
    impressions: int
    clicks: int
    conversions: int
    spend: Decimal
    revenue: Decimal

    @property
    def input_key(self) -> tuple[date, str, str]:
        return (self.performance_date, self.campaign_external_id, self.channel)

    @property
    def campaign_key(self) -> tuple[str, str]:
        return (self.campaign_external_id, self.channel)


@dataclass(frozen=True, slots=True)
class RowIssue:
    issue_type: str
    field: str | None


@dataclass(frozen=True, slots=True)
class ImportResult:
    import_run_id: UUID
    status: Literal["completed", "failed"]
    received_rows: int
    loaded_rows: int
    rejected_rows: int
    duration_ms: int
    error_message: str | None = None

    def to_dict(self) -> dict[str, object]:
        result = asdict(self)
        result["import_run_id"] = str(self.import_run_id)
        return result
