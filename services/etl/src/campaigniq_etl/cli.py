import argparse
import json
import sys
from pathlib import Path
from uuid import UUID

from campaigniq_etl.config import ConfigurationError, get_database_url
from campaigniq_etl.database import create_etl_engine
from campaigniq_etl.pipeline import ImportProcessor, ImportSetupError


def _positive_integer(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return parsed


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="campaigniq-etl")
    commands = parser.add_subparsers(dest="command", required=True)
    load = commands.add_parser("load", help="validate and load a canonical CampaignIQ CSV")
    load.add_argument("--file", required=True, type=Path)
    load.add_argument("--organization-id", required=True, type=UUID)
    load.add_argument("--import-run-id", type=UUID)
    load.add_argument("--chunk-size", type=_positive_integer, default=10_000)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        engine = create_etl_engine(get_database_url())
        try:
            result = ImportProcessor(engine, chunk_size=args.chunk_size).process(
                file_path=args.file,
                organization_id=args.organization_id,
                import_run_id=args.import_run_id,
            )
        finally:
            engine.dispose()
    except (ConfigurationError, ImportSetupError, ValueError) as error:
        print(json.dumps({"status": "failed", "error_message": str(error)}), file=sys.stderr)
        return 1

    print(json.dumps(result.to_dict(), sort_keys=True))
    return 0 if result.status == "completed" else 1
