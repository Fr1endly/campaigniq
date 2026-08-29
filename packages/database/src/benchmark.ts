import "dotenv/config";
import { arch, cpus, platform, totalmem } from "node:os";
import { performance } from "node:perf_hooks";
import { Client } from "pg";

type ExplainDocument = {
  "Execution Time": number;
  "Planning Time": number;
  Plan: { "Shared Hit Blocks"?: number; "Shared Read Blocks"?: number };
};

type QueryMetrics = {
  medianMs: number;
  p95Ms: number;
  planningMedianMs: number;
  sharedHitBlocks: number;
  sharedReadBlocks: number;
};

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://campaign_iq:campaign_iq@localhost:5432/campaign_iq";
const client = new Client({ connectionString: databaseUrl });

function percentile(values: number[], quantile: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[
    Math.min(Math.ceil(sorted.length * quantile) - 1, sorted.length - 1)
  ];
}

async function explain(query: string): Promise<ExplainDocument> {
  const result = await client.query(
    `explain (analyze, buffers, format json) ${query}`,
  );
  const raw = result.rows[0]["QUERY PLAN"] as ExplainDocument[] | string;
  return (
    typeof raw === "string" ? JSON.parse(raw) : raw
  )[0] as ExplainDocument;
}

async function measure(query: string): Promise<QueryMetrics> {
  await explain(query);
  const plans: ExplainDocument[] = [];
  for (let iteration = 0; iteration < 5; iteration += 1)
    plans.push(await explain(query));
  return {
    medianMs: percentile(
      plans.map((plan) => plan["Execution Time"]),
      0.5,
    ),
    p95Ms: percentile(
      plans.map((plan) => plan["Execution Time"]),
      0.95,
    ),
    planningMedianMs: percentile(
      plans.map((plan) => plan["Planning Time"]),
      0.5,
    ),
    sharedHitBlocks: Math.max(
      ...plans.map((plan) => plan.Plan["Shared Hit Blocks"] ?? 0),
    ),
    sharedReadBlocks: Math.max(
      ...plans.map((plan) => plan.Plan["Shared Read Blocks"] ?? 0),
    ),
  };
}

async function runSize(rowCount: number) {
  const campaignCount = rowCount === 100_000 ? 500 : 2_000;
  await client.query("drop schema if exists campaigniq_benchmark cascade");
  await client.query("create schema campaigniq_benchmark");
  await client.query(`
    create table campaigniq_benchmark.facts (
      organization_id integer not null,
      campaign_id integer not null,
      date date not null,
      impressions bigint not null,
      clicks bigint not null,
      conversions bigint not null,
      spend numeric(14,2) not null,
      revenue numeric(14,2) not null,
      primary key (organization_id, campaign_id, date)
    )
  `);
  await client.query(
    `
    insert into campaigniq_benchmark.facts
      (organization_id, campaign_id, date, impressions, clicks, conversions, spend, revenue)
    select
      1,
      ((value - 1) % $2 + 1)::int,
      date '2026-08-27' - ((value - 1) / $2)::int,
      10000 + (value % 5000),
      300 + (value % 200),
      20 + (value % 30),
      (500 + (value % 400))::numeric(14,2),
      (1600 + (value % 1200))::numeric(14,2)
    from generate_series(1, $1) as value
  `,
    [rowCount, campaignCount],
  );
  await client.query(`
    create index facts_org_date_idx
      on campaigniq_benchmark.facts (organization_id, date)
  `);
  await client.query("analyze campaigniq_benchmark.facts");
  await client.query(`
    create materialized view campaigniq_benchmark.organization_daily_performance as
    select
      organization_id,
      date,
      sum(impressions)::bigint as impressions,
      sum(clicks)::bigint as clicks,
      sum(conversions)::bigint as conversions,
      sum(spend)::numeric(18,2) as spend,
      sum(revenue)::numeric(18,2) as revenue
    from campaigniq_benchmark.facts
    group by organization_id, date
  `);
  await client.query(`
    create unique index organization_daily_performance_org_date_uq
      on campaigniq_benchmark.organization_daily_performance (organization_id, date)
  `);
  await client.query(
    "analyze campaigniq_benchmark.organization_daily_performance",
  );

  const liveQuery = `
    with daily as (
      select
        date,
        sum(impressions) as impressions,
        sum(clicks) as clicks,
        sum(conversions) as conversions,
        sum(spend) as spend,
        sum(revenue) as revenue
      from campaigniq_benchmark.facts
      where organization_id = 1
        and date between date '2026-05-30' and date '2026-08-27'
      group by date
    )
    select count(*), sum(impressions), sum(clicks), sum(conversions), sum(spend), sum(revenue)
    from daily
  `;
  const aggregateQuery = `
    select count(*), sum(impressions), sum(clicks), sum(conversions), sum(spend), sum(revenue)
    from campaigniq_benchmark.organization_daily_performance
    where organization_id = 1
      and date between date '2026-05-30' and date '2026-08-27'
  `;
  const rankingQuery = `
    with performance as (
      select
        campaign_id,
        sum(revenue) filter (
          where date between date '2026-05-30' and date '2026-08-27'
        ) as current_revenue,
        sum(revenue) filter (
          where date between date '2026-03-01' and date '2026-05-29'
        ) as previous_revenue
      from campaigniq_benchmark.facts
      where organization_id = 1
        and date between date '2026-03-01' and date '2026-08-27'
      group by campaign_id
    ), ranked as (
      select
        *,
        dense_rank() over (order by current_revenue desc) as current_rank,
        dense_rank() over (order by previous_revenue desc) as previous_rank
      from performance
    )
    select * from ranked order by current_rank, campaign_id limit 5
  `;

  const live = await measure(liveQuery);
  const aggregate = await measure(aggregateQuery);
  const ranking = await measure(rankingQuery);
  await client.query(`
    update campaigniq_benchmark.facts
    set revenue = revenue + 1
    where campaign_id % 100 = 0
  `);
  const refreshStarted = performance.now();
  await client.query(
    "refresh materialized view concurrently campaigniq_benchmark.organization_daily_performance",
  );
  const refreshMs = performance.now() - refreshStarted;

  return {
    rowCount,
    campaignCount,
    live,
    aggregate,
    ranking,
    refreshMs,
    speedup: live.p95Ms / aggregate.p95Ms,
  };
}

await client.connect();
try {
  const version = await client.query<{ server_version: string }>(
    "show server_version",
  );
  await client.query("begin");
  const results = [];
  for (const rowCount of [100_000, 1_000_000])
    results.push(await runSize(rowCount));
  const million = results[1];
  const adoptMaterializedView =
    million.live.p95Ms > 150 &&
    million.speedup >= 3 &&
    million.refreshMs <= 5_000;
  console.info(
    JSON.stringify(
      {
        environment: {
          postgres: version.rows[0].server_version,
          platform: `${platform()} ${arch()}`,
          cpu: cpus()[0]?.model ?? "unknown",
          cpuCount: cpus().length,
          memoryGb: Math.round((totalmem() / 1024 ** 3) * 10) / 10,
        },
        thresholds: {
          liveP95Ms: 150,
          minimumSpeedup: 3,
          maximumRefreshMs: 5_000,
        },
        results,
        decision: adoptMaterializedView ? "materialized" : "live",
      },
      null,
      2,
    ),
  );
} finally {
  await client.query("rollback").catch(() => undefined);
  await client.end();
}
