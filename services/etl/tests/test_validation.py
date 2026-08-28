from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest

from campaigniq_etl.validation import StructuralCsvError, read_csv_chunks, validate_record

FIXTURES = Path(__file__).parent / "fixtures"


def valid_row(**overrides: str) -> dict[str, str]:
    row = {
        "date": "2026-08-01",
        "campaign_id": "CAMP001",
        "campaign_name": "Summer Sale",
        "channel": "Google",
        "impressions": "100",
        "clicks": "10",
        "conversions": "1",
        "spend": "12.00",
        "revenue": "24.00",
    }
    return row | overrides


def test_normalizes_a_strict_canonical_record() -> None:
    record, issue = validate_record(
        valid_row(
            campaign_id="  CAMP001  ",
            campaign_name="  Summer Sale  ",
            spend="12.5",
        )
    )

    assert issue is None
    assert record is not None
    assert record.performance_date == date(2026, 8, 1)
    assert record.campaign_external_id == "CAMP001"
    assert record.campaign_name == "Summer Sale"
    assert record.spend == Decimal("12.5")


@pytest.mark.parametrize(
    ("overrides", "issue_type", "field"),
    [
        ({"campaign_id": " "}, "missing_required_value", "campaign_id"),
        ({"date": "08/01/2026"}, "invalid_date", "date"),
        ({"date": "2026-02-30"}, "invalid_date", "date"),
        ({"impressions": "100.0"}, "invalid_integer", "impressions"),
        ({"impressions": str(2**63)}, "value_out_of_range", "impressions"),
        ({"spend": "1e2"}, "invalid_decimal", "spend"),
        ({"spend": "12.345"}, "invalid_decimal", "spend"),
        ({"revenue": "1000000000000.00"}, "value_out_of_range", "revenue"),
        ({"clicks": "-1", "conversions": "-2"}, "negative_value", "clicks"),
        ({"clicks": "101"}, "clicks_exceed_impressions", "clicks"),
        ({"conversions": "11"}, "conversions_exceed_clicks", "conversions"),
    ],
)
def test_assigns_the_primary_validation_issue(
    overrides: dict[str, str], issue_type: str, field: str
) -> None:
    record, issue = validate_record(valid_row(**overrides))

    assert record is None
    assert issue is not None
    assert (issue.issue_type, issue.field) == (issue_type, field)


def test_missing_value_precedes_invalid_and_business_rules() -> None:
    record, issue = validate_record(
        valid_row(campaign_id="", date="not-a-date", impressions="-1")
    )

    assert record is None
    assert issue is not None
    assert (issue.issue_type, issue.field) == ("missing_required_value", "campaign_id")


def test_reads_extra_columns_in_bounded_chunks() -> None:
    chunks = list(read_csv_chunks(FIXTURES / "valid.csv", chunk_size=2))

    assert [len(chunk.index) for chunk in chunks] == [2, 1]
    assert "source_note" in chunks[0].columns


def test_rejects_a_structurally_invalid_file() -> None:
    with pytest.raises(StructuralCsvError, match="missing required CSV columns: revenue"):
        list(read_csv_chunks(FIXTURES / "structural_invalid.csv", chunk_size=10))
