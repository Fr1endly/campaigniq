# CampaignIQ ETL

The CampaignIQ ETL package reads canonical marketing CSV files in bounded
chunks, validates and deduplicates rows, and transactionally upserts campaigns,
daily facts, import statistics, and aggregated data-quality issues into the
CampaignIQ PostgreSQL warehouse. It also evaluates and persists organization-
scoped seven-day campaign revenue forecasts with scikit-learn Ridge regression.

Install the package from the repository root and inspect the CLI:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e './services/etl[dev]'
campaigniq-etl load --help
campaigniq-etl generate-predictions --help
```

`DATABASE_URL` is read from the environment or the repository `.env` file.
Passing the ID of a completed run returns its existing successful summary as an
idempotent no-op; failed and pending runs are processed again.

Prediction generation requires at least 90 days of organization history and 56
observed days for each included campaign. It uses a purged time holdout, compares
WAPE and MAE with a previous-seven-day baseline, and stores an empirical 80%
range. A failed generation attempt does not change a completed import or delete
the previous successful forecast.
