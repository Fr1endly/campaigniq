import csv
import re
from collections.abc import Iterator, Mapping
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path

import pandas as pd

from campaigniq_etl.models import CanonicalRecord, RowIssue

REQUIRED_COLUMNS = (
    "date",
    "campaign_id",
    "campaign_name",
    "channel",
    "impressions",
    "clicks",
    "conversions",
    "spend",
    "revenue",
)
INTEGER_FIELDS = ("impressions", "clicks", "conversions")
DECIMAL_FIELDS = ("spend", "revenue")
METRIC_FIELDS = (*INTEGER_FIELDS, *DECIMAL_FIELDS)

_DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_INTEGER_PATTERN = re.compile(r"^[+-]?\d+$")
_DECIMAL_PATTERN = re.compile(r"^[+-]?\d+(?:\.\d{1,2})?$")
_BIGINT_MIN = -(2**63)
_BIGINT_MAX = 2**63 - 1
_NUMERIC_MAX = Decimal("999999999999.99")


class StructuralCsvError(ValueError):
    pass


def read_csv_chunks(path: Path, chunk_size: int) -> Iterator[pd.DataFrame]:
    _validate_headers(_read_headers(path))
    try:
        reader = pd.read_csv(
            path,
            chunksize=chunk_size,
            dtype=str,
            encoding="utf-8-sig",
            keep_default_na=False,
            na_filter=False,
            on_bad_lines="error",
        )
    except (OSError, UnicodeError, pd.errors.ParserError, pd.errors.EmptyDataError) as error:
        raise StructuralCsvError(_structural_error_message(error)) from error

    try:
        yield from reader
    except (OSError, UnicodeError, pd.errors.ParserError) as error:
        raise StructuralCsvError(_structural_error_message(error)) from error


def _read_headers(path: Path) -> list[str]:
    try:
        with path.open(encoding="utf-8-sig", newline="") as csv_file:
            return next(csv.reader(csv_file, strict=True))
    except StopIteration as error:
        raise StructuralCsvError("CSV header is missing") from error
    except (OSError, UnicodeError, csv.Error) as error:
        raise StructuralCsvError(_structural_error_message(error)) from error


def _validate_headers(headers: list[str] | None) -> None:
    if not headers:
        raise StructuralCsvError("CSV header is missing")

    duplicates = sorted({header for header in headers if headers.count(header) > 1})
    if duplicates:
        raise StructuralCsvError(f"duplicate CSV header: {', '.join(duplicates)}")

    missing = [column for column in REQUIRED_COLUMNS if column not in headers]
    if missing:
        raise StructuralCsvError(f"missing required CSV columns: {', '.join(missing)}")


def validate_record(row: Mapping[str, object]) -> tuple[CanonicalRecord | None, RowIssue | None]:
    values = {column: str(row[column]).strip() for column in REQUIRED_COLUMNS}

    for field in REQUIRED_COLUMNS:
        if not values[field]:
            return None, RowIssue("missing_required_value", field)

    parsed_date = _parse_date(values["date"])
    if parsed_date is None:
        return None, RowIssue("invalid_date", "date")

    integers: dict[str, int] = {}
    for field in INTEGER_FIELDS:
        parsed_integer, issue_type = _parse_integer(values[field])
        if issue_type:
            return None, RowIssue(issue_type, field)
        assert parsed_integer is not None
        integers[field] = parsed_integer

    decimals: dict[str, Decimal] = {}
    for field in DECIMAL_FIELDS:
        parsed_decimal, issue_type = _parse_decimal(values[field])
        if issue_type:
            return None, RowIssue(issue_type, field)
        assert parsed_decimal is not None
        decimals[field] = parsed_decimal

    metrics: dict[str, int | Decimal] = {**integers, **decimals}
    for field in METRIC_FIELDS:
        if metrics[field] < 0:
            return None, RowIssue("negative_value", field)

    if integers["clicks"] > integers["impressions"]:
        return None, RowIssue("clicks_exceed_impressions", "clicks")
    if integers["conversions"] > integers["clicks"]:
        return None, RowIssue("conversions_exceed_clicks", "conversions")

    return (
        CanonicalRecord(
            performance_date=parsed_date,
            campaign_external_id=values["campaign_id"],
            campaign_name=values["campaign_name"],
            channel=values["channel"],
            impressions=integers["impressions"],
            clicks=integers["clicks"],
            conversions=integers["conversions"],
            spend=decimals["spend"],
            revenue=decimals["revenue"],
        ),
        None,
    )


def _parse_date(value: str) -> date | None:
    if not _DATE_PATTERN.fullmatch(value):
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _parse_integer(value: str) -> tuple[int | None, str | None]:
    if not _INTEGER_PATTERN.fullmatch(value):
        return None, "invalid_integer"
    parsed = int(value)
    if parsed < _BIGINT_MIN or parsed > _BIGINT_MAX:
        return None, "value_out_of_range"
    return parsed, None


def _parse_decimal(value: str) -> tuple[Decimal | None, str | None]:
    if not _DECIMAL_PATTERN.fullmatch(value):
        return None, "invalid_decimal"
    try:
        parsed = Decimal(value)
    except InvalidOperation:
        return None, "invalid_decimal"
    if abs(parsed) > _NUMERIC_MAX:
        return None, "value_out_of_range"
    return parsed, None


def _structural_error_message(error: Exception) -> str:
    if isinstance(error, pd.errors.EmptyDataError):
        return "CSV header is missing"
    if isinstance(error, UnicodeError):
        return "CSV must be UTF-8 encoded"
    if isinstance(error, OSError):
        return "CSV could not be read"
    return "CSV syntax is invalid"
