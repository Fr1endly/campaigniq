# CampaignIQ Agent Guide

This file applies to the entire repository. Keep it current when architecture,
commands, or milestone priorities change.

## Product Intent

CampaignIQ is a marketing analytics SaaS demonstration built as a real product
first and a data-engineering showcase second. The product story is:

```text
Login -> dashboard -> upload CSV -> ETL processing -> load/reject summary
      -> dashboard refresh
```

The current repository implements the authenticated local analytics dashboard.
CSV ingestion, the Python ETL service, import screens, AWS infrastructure, and
ML are later milestones. Do not introduce AWS or ML before the local ingestion
workflow works end to end.

## Project Documents

- `docs/PROJECT_PLAN.md` is the approved product, architecture, and roadmap.
- `docs/MILESTONE_1.md` is the dated record of the completed dashboard milestone.
- `README.md` is the concise setup and repository entry point.

Keep implementation and these documents aligned when milestone scope or
architecture changes.

## Current Stack

- Monorepo: npm workspaces and Turborepo
- Web: TanStack Start, React 19, TypeScript, Tailwind CSS, shadcn/ui
- API: NestJS, TypeScript, Better Auth
- Database: PostgreSQL 17, Drizzle ORM, committed SQL migrations
- Validation/contracts: Zod
- Tests: Vitest and Playwright
- Local infrastructure: Docker Compose

TanStack Start is intentional. Do not replace it with Next.js or add Next.js
API routes.

## Repository Layout

```text
apps/web/           TanStack Start UI, SSR loaders, API proxy, Playwright tests
apps/api/           NestJS auth, analytics endpoints, seed, integration tests
packages/contracts/ Shared Zod request/response contracts and TypeScript types
packages/database/  Drizzle client, schemas, migrations, and migration runner
services/etl/       Reserved for the future Python ETL service
```

## Local Setup

Requirements:

- Node.js 22.22.3 or newer
- npm 10
- Docker with Docker Compose

```bash
cp .env.example .env
npm install
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

Services:

- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- API health: `http://localhost:3001/api/health`
- PostgreSQL: `localhost:5432`

Seeded demo login:

```text
demo@campaigniq.local
CampaignIQ2026!
```

Never commit `.env` or real credentials. `.env.example` contains local-only
defaults and must remain safe to publish.

## Commands

Run commands from the repository root unless a task requires a workspace-local
command.

```bash
npm run dev          # start web and API in watch mode
npm run lint         # lint all workspaces
npm run typecheck    # typecheck all workspaces
npm test             # unit and PostgreSQL integration tests
npm run test:e2e     # Playwright desktop and mobile journeys
npm run build        # production builds for all workspaces
npm run db:generate  # generate a migration after a Drizzle schema change
npm run db:migrate   # apply committed migrations
npm run db:seed      # create deterministic demo data
```

Database integration tests require the local PostgreSQL service. Playwright
requires PostgreSQL, seeded data, and the API/web services; its configuration
can start or reuse the application servers.

## Architecture Boundaries

- The web app owns presentation, routing, URL search state, and SSR data loading.
- NestJS owns authentication, organization resolution, analytics rules, and all
  database access.
- The browser uses the TanStack Start same-origin `/api` proxy. Do not connect
  browser components directly to PostgreSQL or trust client-supplied tenant IDs.
- Shared wire formats belong in `packages/contracts` and must be validated at
  service boundaries.
- Better Auth handlers are mounted under `/api/auth/*`; public sign-up is
  disabled. Preserve the raw auth handler ordering in `apps/api/src/main.ts`.

## Multi-Tenancy Invariants

- Every protected request derives the organization from the authenticated
  Better Auth session and membership.
- Never accept `organizationId` from an analytics request body, route parameter,
  or query string.
- Every analytics query and mutation must filter by the resolved organization.
- Cross-organization foreign keys and uniqueness constraints in the Drizzle
  schema are deliberate. Preserve them when evolving tables.

## Data Model Invariants

- A campaign is unique by organization, external ID, and channel.
- A performance fact is unique by organization, campaign, and date.
- Impressions, clicks, conversions, spend, and revenue are nonnegative.
- Clicks cannot exceed impressions; conversions cannot exceed clicks.
- Monetary values remain PostgreSQL numeric/decimal values across database and
  API boundaries. Do not introduce binary floating-point storage for money.
- Import runs record status, received/loaded/rejected counts, timing, and errors.
- Data-quality issues store aggregated issue type, field, and count per import.
- Schema changes require both Drizzle source changes and a committed generated
  SQL migration including `packages/database/drizzle/meta` updates.

## Frontend Conventions

- Treat this as a quiet, work-focused analytics product, not a marketing site.
- Follow existing shadcn/ui, Tailwind, spacing, color, and maximum 8px radius
  conventions.
- Use Lucide icons for familiar actions and include accessible names/tooltips.
- Keep reporting state in validated URL search parameters.
- Load protected data through TanStack Start server functions and validate API
  responses with shared Zod contracts.
- Preserve responsive behavior at desktop and mobile widths. Wide tables must
  scroll inside their own container without causing document-level overflow.
- Mobile navigation must close after selecting a destination.

## Generated and Ignored Files

- Do not edit `apps/web/src/routeTree.gen.ts`; TanStack generates it.
- Do not commit `.env`, `node_modules`, build output, Turbo caches, Playwright
  reports/results, coverage, logs, or `*.tsbuildinfo`.
- Do commit Drizzle SQL migrations and migration metadata.
- Do not hand-edit `package-lock.json`; update it with npm commands.

## Change Discipline

- Read the relevant module and existing tests before editing.
- Prefer established repository patterns over new abstractions.
- Keep changes scoped; do not combine feature work with unrelated refactors.
- Do not weaken database constraints or authentication checks to make tests pass.
- Add focused unit tests for calculations/validation and integration tests for
  database or tenant behavior.
- For user-facing workflows, add or update Playwright coverage and verify both
  desktop and mobile layouts.
- Before handing off a completed change, run the applicable subset and normally
  finish with lint, typecheck, tests, and a production build.

## Next Approved Milestone

Build the local ETL and import workflow before AWS:

```text
CSV -> extract -> validate -> transform -> deduplicate -> transactional load
    -> import statistics and data-quality issues -> dashboard refresh
```

Use Python, Pandas, SQLAlchemy/psycopg, and pytest under `services/etl`. The
canonical CSV columns are:

```text
date,campaign_id,campaign_name,channel,impressions,clicks,conversions,spend,revenue
```

Validation must cover missing campaign IDs, invalid dates, negative metrics,
clicks greater than impressions, conversions greater than clicks, and duplicate
`date + campaign_id + channel` records. Duplicate rows within an input are
rejected; warehouse loads should be idempotent through the existing natural
keys/upsert strategy.

After the ETL core and fixtures are tested, add import API endpoints and the
Imports/Data Quality UI. Use local S3-compatible object storage for presigned
uploads before swapping it for AWS S3 and Lambda. ML remains last.

## Git

- Primary branch: `main`
- Remote: `https://github.com/Fr1endly/campaigniq.git`
- Use concise conventional commit messages such as `feat:`, `fix:`, `test:`,
  `docs:`, and `ci:`.
