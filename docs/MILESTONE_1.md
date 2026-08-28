# Milestone 1: Authenticated Local Analytics Dashboard

## Delivery Record

- Status: Complete
- Completed: August 28, 2026
- Core implementation commit: `a4f560e8f97a3a3a7a581e2c0dff9ae5b2ef2abf`
- Commit subject: `feat: build CampaignIQ analytics dashboard`

## Objective

Deliver a locally running full-stack marketing dashboard backed by PostgreSQL:

```text
TanStack Start -> NestJS -> PostgreSQL
```

The application needed seeded authentication, organization-safe analytics, and
working Revenue, Spend, Clicks, Conversions, CTR, and ROAS views before any ETL,
AWS, or ML work began.

## Delivered Scope

### Monorepo Foundation

- npm workspaces and Turborepo orchestration.
- Separate `apps/web` and `apps/api` applications.
- Shared `packages/contracts` and `packages/database` packages.
- Root commands for development, linting, typechecking, tests, builds, database
  migrations, and seeding.
- Docker Compose PostgreSQL 17 service with a health check and persistent volume.
- Environment template and repository ignore rules.

### Database and Warehouse

- Drizzle PostgreSQL client and schema modules.
- Committed SQL migration and Drizzle migration metadata.
- Better Auth tables for users, sessions, accounts, organizations, memberships,
  invitations, and verification records.
- Analytics tables:
  - `campaigns`
  - `marketing_performance`
  - `import_runs`
  - `data_quality_issues`
- Composite tenant-aware foreign keys and uniqueness constraints.
- Database checks for nonnegative metrics, clicks not exceeding impressions,
  conversions not exceeding clicks, and valid import/issue counts.

### Authentication and Tenant Isolation

- Better Auth email/password login mounted under `/api/auth/*`.
- Public sign-up disabled for the product surface.
- Seed-only user creation path.
- Global NestJS authentication guard for protected endpoints.
- Organization derived from the authenticated session and membership.
- Analytics endpoints never accept a client-selected organization ID.
- Health endpoint remains public.

### Analytics API

Implemented endpoints:

```http
GET /api/health
GET /api/session
GET /api/dashboard/summary?range=7d|30d|90d
GET /api/campaigns?range=&search=&channel=&sort=&order=&page=&pageSize=
GET /api/campaigns/:id?range=7d|30d|90d
```

API behavior includes:

- Current and previous-period metric aggregation.
- Revenue and spend daily trends.
- Top-campaign ranking.
- Campaign search, channel filtering, sorting, and pagination.
- Campaign detail metrics and daily facts.
- Null-safe derived calculations for CTR, conversion rate, CPC, CPA, and ROAS.
- Decimal-string money values and shared Zod response validation.
- UUID route validation and tenant-scoped not-found behavior.

### TanStack Start Product UI

- Seeded-user login with invalid-credential feedback.
- Protected routes with unauthenticated redirection.
- Responsive operational shell with desktop sidebar and mobile navigation sheet.
- User menu and sign-out flow.
- Overview page with:
  - Six KPI cells.
  - 7/30/90-day URL-backed range selector.
  - Revenue/spend trend chart.
  - Top campaigns table.
- Campaigns page with:
  - Search.
  - Channel filter.
  - Sortable columns.
  - Pagination.
- Campaign detail page with:
  - Campaign identity and channel.
  - KPI comparisons.
  - Trend chart.
  - Daily performance table.
- Same-origin TanStack Start proxy for NestJS API and authentication requests.
- SSR server functions that forward sessions and validate responses using shared
  Zod contracts.
- Explicit loading, error, empty, 404, and responsive navigation states.

### Deterministic Demo Data

The idempotent seed creates:

- User: Alex Morgan (`demo@campaigniq.local`).
- Organization: Northstar Growth.
- One owner membership.
- 12 campaigns across Google, Meta, LinkedIn, and TikTok.
- 180 days per campaign ending August 27, 2026.
- 2,160 daily performance facts.
- One completed import run:
  - 2,198 received rows.
  - 2,160 loaded rows.
  - 38 rejected rows.
  - 18.43-second recorded duration.
- Three aggregated quality issues totaling 38 rows:
  - 18 missing campaign IDs.
  - 12 duplicate records.
  - 8 rows where clicks exceeded impressions.

## Implemented Architecture

```text
Browser
  -> TanStack Start :3000
       -> protected SSR loaders/server functions
       -> same-origin /api proxy
            -> NestJS :3001
                 -> Better Auth session and organization guard
                 -> analytics services and parameterized SQL
                 -> Drizzle/PostgreSQL :5432
```

The frontend does not connect to PostgreSQL. NestJS owns all analytics access,
and tenant identity is resolved server-side.

## Quality and Verification

The completed milestone passed:

```text
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm audit --omit=dev
```

Results at delivery:

- All four workspaces linted successfully.
- All four workspaces typechecked successfully.
- NestJS and TanStack Start production builds succeeded.
- Eight unit/database integration tests passed:
  - Four analytics helper tests.
  - Two PostgreSQL constraint tests.
  - Two formatter tests.
- Six Playwright journeys passed across desktop and mobile:
  - Protected endpoint and invalid-login behavior.
  - Seeded overview and reporting-range behavior.
  - Campaign search and detail navigation.
- Dashboard charts were checked for rendered SVG paths.
- Desktop and mobile screenshots were visually inspected.
- Document-level horizontal overflow was checked.
- Authenticated API smoke tests verified session context and dashboard data.
- Malformed campaign UUIDs returned HTTP 400.
- Production dependency audit reported zero vulnerabilities.

## Key Decisions

- TanStack Start replaced Next.js before implementation.
- NestJS remains a real backend boundary rather than frontend API routes.
- Better Auth supports seeded login only for this milestone.
- Drizzle owns schema definitions and committed migrations.
- Reporting periods are 7, 30, and 90 days and remain visible in the URL.
- PostgreSQL is the source of truth for derived dashboard data.
- Money remains decimal through storage and API serialization.
- AWS and ML were deliberately deferred.

## Deferred Work

Milestone 1 does not include:

- CSV extraction, validation, transformation, or loading.
- Upload APIs or object storage.
- Imports or Data Quality pages.
- Background job orchestration.
- S3, Lambda, RDS, IAM, or CloudFormation.
- Materialized views or scheduled aggregate refreshes.
- Predictive models or Insights UI.

These omissions are intentional. The next milestone is the tested local Python
ETL and import workflow described in [PROJECT_PLAN.md](./PROJECT_PLAN.md).

## Running the Milestone

```bash
cp .env.example .env
npm install
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3000` and sign in with:

```text
Email:    demo@campaigniq.local
Password: CampaignIQ2026!
```
