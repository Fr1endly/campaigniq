# CampaignIQ

CampaignIQ is a marketing analytics SaaS demo built as a real product around a warehouse-oriented data model. The current milestone provides authenticated, organization-isolated dashboards backed by deterministic PostgreSQL data.

## Project documentation

- [Approved project plan](./docs/PROJECT_PLAN.md)
- [Milestone 1 delivery summary](./docs/MILESTONE_1.md)
- [Repository agent guide](./AGENTS.md)

## Stack

- TanStack Start, React, TypeScript, Tailwind CSS, and shadcn/ui
- NestJS with Better Auth
- PostgreSQL with Drizzle ORM and committed SQL migrations
- npm workspaces and Turborepo
- Vitest and Playwright

## Local setup

Requirements: Node.js 22.22.3 or newer, npm 10, Docker, and Docker Compose.

```bash
cp .env.example .env
npm install
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

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
```

## Architecture

```text
Browser
  └─ TanStack Start :3000
       ├─ SSR route loaders
       └─ same-origin /api proxy
            └─ NestJS :3001
                 ├─ Better Auth session + organization guard
                 ├─ analytics REST API
                 └─ Drizzle → PostgreSQL
```

TanStack Start owns presentation, routing, and SSR. NestJS owns authentication, tenant resolution, analytics rules, and all database access. The browser never supplies an organization ID; protected endpoints derive it from the authenticated membership.

## API

```text
GET /api/health
GET /api/session
GET /api/dashboard/summary?range=7d|30d|90d
GET /api/campaigns?range=&search=&channel=&sort=&order=&page=&pageSize=
GET /api/campaigns/:id?range=7d|30d|90d
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
```

Python ETL, import pages, AWS infrastructure, data-quality reporting, and predictive insights are intentionally deferred to later milestones.
