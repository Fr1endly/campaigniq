# CampaignIQ Project Plan

## Status

This document preserves the approved CampaignIQ product and engineering plan.
TanStack Start is the frontend framework; references to Next.js in the earliest
design draft were superseded before implementation.

Milestones 1 through 3 are complete: the repository provides the authenticated
analytics dashboard, local CSV ETL pipeline, direct object-storage upload flow,
import operations, and data-quality reporting. AWS deployment is the next
approved milestone.

## Product Vision

CampaignIQ is a marketing analytics SaaS where users upload advertising data,
an ETL pipeline validates and transforms it, and the application presents
performance dashboards, data-quality reports, and eventually predictive
insights.

The target demonstration flow is:

```text
Login
  -> Dashboard
  -> Upload CSV
  -> Processing
  -> ETL validates and transforms data
  -> 98,723 rows loaded / 1,277 rejected
  -> Dashboard automatically updates
```

The project must feel like a useful operational product first. Its architecture,
data model, validation, observability, and SQL should then make it a credible
data-engineering and full-stack portfolio project.

## Technology Stack

```text
Frontend
  TanStack Start
  React and TypeScript
  Tailwind CSS
  shadcn/ui

Backend
  NestJS and TypeScript
  Better Auth
  Zod contracts

Database
  PostgreSQL
  Drizzle ORM and SQL migrations

ETL
  Python
  Pandas
  SQLAlchemy / psycopg
  pytest

Infrastructure
  AWS S3
  AWS Lambda
  AWS RDS PostgreSQL
  CloudFormation

ML
  Python
  scikit-learn

Local Development
  npm workspaces and Turborepo
  Docker Compose
  Local S3-compatible object storage for upload development
```

NestJS remains an explicit backend rather than placing business logic in the
frontend framework. TanStack Start owns routing, rendering, and presentation;
NestJS owns authentication, tenant resolution, analytics rules, and
application-facing database access. The Python ETL owns organization-scoped
warehouse ingestion writes.

## Target Architecture

```text
Browser
  |
  | TanStack Start UI and same-origin API proxy
  v
NestJS API
  |                     \
  |                      \ create import + presigned upload
  v                       v
PostgreSQL             Object storage (local, then S3 raw/)
  ^                       |
  |                       | object-created event
  |                       v
  +------------------- Python ETL (local, then Lambda)
                            |
                            | validate, transform, deduplicate, load
                            v
                        PostgreSQL warehouse

PostgreSQL -> NestJS analytics API -> TanStack Start dashboards
PostgreSQL -> future model training/inference -> Insights UI
```

The browser must not stream large CSV files through NestJS. The final upload
flow creates an import run, returns a presigned object-storage URL, and uploads
the file directly from the browser.

## Canonical Marketing Schema

CampaignIQ owns a stable canonical input format rather than coupling the
warehouse to one public dataset:

| Column          | Type    | Meaning                              |
| --------------- | ------- | ------------------------------------ |
| `date`          | date    | Performance date                     |
| `campaign_id`   | string  | Source campaign identifier           |
| `campaign_name` | string  | Display name                         |
| `channel`       | string  | Google, Meta, LinkedIn, TikTok, etc. |
| `impressions`   | integer | Ad impressions                       |
| `clicks`        | integer | Ad clicks                            |
| `conversions`   | integer | Attributed conversions               |
| `spend`         | decimal | Advertising cost                     |
| `revenue`       | decimal | Attributed revenue                   |

Example:

```csv
date,campaign_id,campaign_name,channel,impressions,clicks,conversions,spend,revenue
2026-08-01,CAMP001,Summer Sale,Google,15400,423,38,812.50,2940.00
2026-08-01,CAMP002,Retargeting,Meta,9800,281,31,540.12,2210.00
2026-08-02,CAMP001,Summer Sale,Google,16120,451,42,840.20,3150.00
```

Public datasets can be supported later through source-specific adapters:

```text
Source format -> source transformation -> canonical schema -> warehouse
```

## Analytics Metrics

```text
CTR             = clicks / impressions
Conversion Rate = conversions / clicks
CPC             = spend / clicks
CPA             = spend / conversions
ROAS            = revenue / spend
```

Division by zero must produce a null/unavailable metric rather than an invalid
number. Money is stored as PostgreSQL numeric values and represented as decimal
strings at API boundaries.

## Warehouse Model

### `campaigns`

Campaign dimension containing tenant ownership, external ID, name, channel, and
timestamps. The business key is organization + external ID + channel.

### `marketing_performance`

Daily fact table containing campaign, date, impressions, clicks, conversions,
spend, revenue, source import, and timestamps. The natural fact key is
organization + campaign + date.

### `import_runs`

Operational ETL metadata:

```text
id
organization_id
filename
status
received_rows
loaded_rows
rejected_rows
started_at
completed_at
duration_ms
s3_key
error_message
created_at
```

### `data_quality_issues`

Aggregated issue metadata per import:

```text
id
import_run_id
issue_type
field
count
created_at
```

This operational metadata is a first-class product surface, not only pipeline
logging. It powers the Imports and Data Quality pages.

## Validation Rules

Reject a row when:

- `campaign_id` is missing.
- `date` is invalid.
- Impressions, clicks, conversions, spend, or revenue is negative.
- Clicks exceed impressions.
- Conversions exceed clicks.
- A required canonical column is missing or cannot be coerced safely.
- The natural input key `date + campaign_id + channel` duplicates an earlier row
  in the same import.

Rejected rows must not prevent valid rows in the same well-formed file from
loading. Issue counts must reconcile with the import run's rejected-row count.
Schema-level PostgreSQL checks remain the last line of defense.

## Deduplication and Incremental Loads

- Detect duplicate natural keys before loading.
- Reject duplicate occurrences within an input and aggregate their issue count.
- Upsert campaign dimensions using organization + external ID + channel.
- Upsert performance facts using organization + campaign + date.
- Make retries idempotent and prevent duplicate warehouse facts.
- Perform fact loading and import metadata updates transactionally where
  practical; failed runs must retain a useful error message.

## Product Navigation

The full information architecture is:

```text
CampaignIQ
  Overview
  Campaigns
  Imports
  Data Quality
  Insights
```

### Overview

- Revenue, spend, clicks, conversions, CTR, and ROAS.
- Current-period comparison for 7, 30, and 90 days.
- Revenue/spend trend.
- Top campaigns.

### Campaigns

- Search, channel filtering, sortable metrics, and pagination.
- Campaign detail with KPIs, trend, and daily facts.

### Imports

- CSV upload.
- Processing state.
- Import history.
- Received, loaded, and rejected counts.
- Duration and failure details.

### Data Quality

- Valid-record percentage.
- Issue breakdown by rule and field.
- Import-level inspection and representative rejected-row information where
  useful and safe.

### Insights

- Added only after ingestion and operational reporting are reliable.
- Initial model should be explainable regression for campaign performance, not
  an exotic model without a product use case.

## API Plan

Implemented analytics endpoints:

```http
GET /api/health
GET /api/session
GET /api/dashboard/summary
GET /api/campaigns
GET /api/campaigns/:id
```

Planned import endpoints:

```http
POST /api/imports
GET  /api/imports
GET  /api/imports/:id
POST /api/imports/:id/process
POST /api/imports/:id/upload-failed
GET  /api/imports/:id/issues
```

Later insight endpoints:

```http
GET  /api/insights
POST /api/predictions
```

All protected endpoints resolve organization ownership from the authenticated
session. Client-provided organization IDs are never trusted.

## Repository Direction

```text
campaign-iq/
  apps/
    web/                 TanStack Start application
    api/                 NestJS API
  packages/
    contracts/           Shared Zod contracts
    database/            Drizzle schema and migrations
  services/
    etl/                  Python ETL package
  infrastructure/
    cloudformation/       AWS templates
  docker-compose.yml
  AGENTS.md
  README.md
```

## Roadmap

### Phase 1: Foundation and Local Dashboard - Complete

- npm/Turborepo monorepo.
- TanStack Start frontend.
- NestJS backend.
- PostgreSQL via Docker Compose.
- Drizzle schemas and committed migration.
- Better Auth seeded login and organization isolation.
- Deterministic marketing seed data.
- Overview, Campaigns, and Campaign Details.

See [MILESTONE_1.md](./MILESTONE_1.md) for the delivery record.

### Phase 2: Local ETL - Complete

- Scaffold `services/etl` as a tested Python package.
- Extract canonical CSVs in bounded chunks.
- Validate types and business rules.
- Transform normalized records.
- Deduplicate natural keys.
- Transactionally upsert dimensions and facts.
- Record import statistics and data-quality issues.
- Provide valid, malformed, duplicate, and incremental-load fixtures.

See [MILESTONE_2.md](./MILESTONE_2.md) for the delivery record.

### Phase 3: Import Product Experience - Complete

- Create import APIs.
- Add direct presigned uploads against local object storage.
- Build Imports and Data Quality pages.
- Poll or stream processing status.
- Refresh analytics after successful completion.

See [MILESTONE_3.md](./MILESTONE_3.md) for the delivery record.

### Phase 4: AWS Deployment - Next

- Replace local object storage with S3.
- Trigger Python ETL through Lambda.
- Move PostgreSQL to RDS.
- Add CloudFormation for reproducible infrastructure.
- Add deployment configuration, least-privilege IAM, monitoring, and failure
  handling.

### Phase 5: Advanced SQL and Warehouse Operations

- Add explicit incremental-loading demonstrations.
- Use CTEs and window functions for useful product queries.
- Evaluate materialized views for expensive aggregates.
- Add refresh and observability strategies based on measured need.

### Phase 6: Predictive Insights

- Establish a defensible prediction target and evaluation metric.
- Train a baseline regression model.
- Persist model metadata and predictions.
- Expose interpretable insights through the API and UI.
- Document limitations and avoid presenting predictions as certainty.

## Delivery Standard

Each milestone should remain locally reproducible, tested, documented, and
demonstrable. A milestone is complete when its user workflow works end to end,
failure states are visible, tenant isolation remains intact, and lint,
typechecking, tests, and production builds pass.
