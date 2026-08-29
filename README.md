# CampaignIQ

CampaignIQ is a marketing analytics SaaS demo built as a real product around a warehouse-oriented data model. The current product provides authenticated dashboards, direct CSV uploads to local S3-compatible storage, asynchronous Python ETL processing, observable incremental loads, data-quality reporting, rolling campaign analytics, and measured aggregate refresh operations.

## Project documentation

- [Approved project plan](./docs/PROJECT_PLAN.md)
- [Milestone 1 delivery summary](./docs/MILESTONE_1.md)
- [Milestone 2 delivery summary](./docs/MILESTONE_2.md)
- [Milestone 3 delivery summary](./docs/MILESTONE_3.md)
- [Milestone 5 delivery and benchmark summary](./docs/MILESTONE_5.md)
- [Repository agent guide](./AGENTS.md)

## Stack

- TanStack Start, React, TypeScript, Tailwind CSS, and shadcn/ui
- NestJS with Better Auth
- PostgreSQL with Drizzle ORM and committed SQL migrations
- MinIO for local S3-compatible direct uploads
- Python, Pandas, SQLAlchemy, and psycopg for local ETL
- npm workspaces and Turborepo
- Vitest, pytest, and Playwright

## Local setup

Requirements: Node.js 22.22.3 or newer, npm 10, Python 3.12 or newer, Docker, and Docker Compose.

```bash
cp .env.example .env
npm install
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e './services/etl[dev]'
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The MinIO console is
available at [http://localhost:9001](http://localhost:9001) for local inspection.

Demo credentials:

```text
Email:    demo@campaigniq.local
Password: CampaignIQ2026!
```

The database seed is idempotent and creates one owner, one organization, 12 campaigns, and 180 days of daily facts.

## Commands

```bash
npm run dev          # web on :3000 and API on :3001
npm run build        # build every workspace
npm run lint         # lint every workspace
npm run typecheck    # typecheck every workspace
npm test             # unit and database integration tests
npm run test:e2e     # Playwright desktop and mobile flows
npm run db:generate  # generate SQL after a Drizzle schema change
npm run db:migrate   # apply committed migrations
npm run db:seed      # seed or repair the deterministic demo data
npm run db:benchmark # benchmark live and materialized warehouse queries
npm run etl:load -- --file ./campaign.csv --organization-id <uuid>
npm run etl:test     # Python unit and PostgreSQL integration tests
```

The ETL command reads `DATABASE_URL` from the environment or repository `.env`,
emits a JSON import summary, and accepts `--import-run-id <uuid>` when processing
a run created by another service. Canonical CSVs use:

```text
date,campaign_id,campaign_name,channel,impressions,clicks,conversions,spend,revenue
```

## Architecture

```text
Browser
  └─ TanStack Start :3000
       ├─ SSR route loaders
       ├─ presigned PUT → MinIO :9000
       └─ same-origin /api proxy
            └─ NestJS :3001
                 ├─ Better Auth session + organization guard
                 ├─ analytics and import REST APIs
                 ├─ local ETL dispatch
                 └─ Drizzle → PostgreSQL

MinIO raw object → Python ETL → PostgreSQL warehouse and import metadata
```

TanStack Start owns presentation, routing, and SSR. NestJS owns authentication,
tenant resolution, analytics rules, and application-facing database access. The
Python ETL owns organization-scoped ingestion writes. The browser never supplies
an organization ID; protected endpoints derive it from the authenticated
membership.

## API

```text
GET /api/health
GET /api/health/ready
GET /api/session
GET /api/dashboard/summary?range=7d|30d|90d
GET /api/campaigns?range=&search=&channel=&sort=&order=&page=&pageSize=
GET /api/campaigns/:id?range=7d|30d|90d
POST /api/imports
GET /api/imports?status=&page=&pageSize=
GET /api/imports/:id
POST /api/imports/:id/process
POST /api/imports/:id/upload-failed
GET /api/imports/:id/issues
GET /api/warehouse/status
POST /api/warehouse/refresh
```

Authentication endpoints are mounted under `/api/auth/*`.

## Repository

```text
apps/
  api/        NestJS API, auth, analytics, and seed command
  web/        TanStack Start application
packages/
  contracts/  Shared Zod wire contracts
  database/   Drizzle schema and SQL migrations
services/
  etl/        Chunked Python CSV validation and warehouse loading
```

Phase 5 advanced SQL and warehouse operations is complete. Phase 4 AWS
infrastructure remains postponed and will later replace local MinIO and API
process dispatch with S3 event processing in Lambda. Phase 6 predictive insights
is next.
