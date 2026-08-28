# CampaignIQ ETL

The CampaignIQ ETL package reads canonical marketing CSV files in bounded
chunks, validates and deduplicates rows, and transactionally upserts campaigns,
daily facts, import statistics, and aggregated data-quality issues into the
CampaignIQ PostgreSQL warehouse.

Install the package from the repository root and inspect the CLI:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e './services/etl[dev]'
campaigniq-etl load --help
```

`DATABASE_URL` is read from the environment or the repository `.env` file.
Passing the ID of a completed run returns its existing successful summary as an
idempotent no-op; failed and pending runs are processed again.
