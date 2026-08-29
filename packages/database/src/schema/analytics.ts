import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgMaterializedView,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { organization } from "./auth.js";

export const importStatus = pgEnum("import_status", [
  "received",
  "uploading",
  "processing",
  "completed",
  "failed",
]);

export const warehouseRefreshStatus = pgEnum("warehouse_refresh_status", [
  "current",
  "stale",
  "refreshing",
  "failed",
]);

export const predictionRunStatus = pgEnum("prediction_run_status", [
  "running",
  "completed",
  "insufficient_data",
  "failed",
]);

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    channel: text("channel").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("campaigns_org_external_channel_uq").on(
      table.organizationId,
      table.externalId,
      table.channel,
    ),
    unique("campaigns_id_org_uq").on(table.id, table.organizationId),
    index("campaigns_org_name_idx").on(table.organizationId, table.name),
  ],
);

export const importRuns = pgTable(
  "import_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    status: importStatus("status").notNull(),
    receivedRows: bigint("received_rows", { mode: "number" })
      .default(0)
      .notNull(),
    loadedRows: bigint("loaded_rows", { mode: "number" }).default(0).notNull(),
    rejectedRows: bigint("rejected_rows", { mode: "number" })
      .default(0)
      .notNull(),
    insertedRows: bigint("inserted_rows", { mode: "number" }),
    updatedRows: bigint("updated_rows", { mode: "number" }),
    unchangedRows: bigint("unchanged_rows", { mode: "number" }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    s3Key: text("s3_key"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("import_runs_id_org_uq").on(table.id, table.organizationId),
    index("import_runs_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    check(
      "import_runs_counts_nonnegative",
      sql`${table.receivedRows} >= 0 and ${table.loadedRows} >= 0 and ${table.rejectedRows} >= 0`,
    ),
    check(
      "import_runs_outcome_counts_valid",
      sql`(
        ${table.insertedRows} is null
        and ${table.updatedRows} is null
        and ${table.unchangedRows} is null
      ) or (
        ${table.insertedRows} >= 0
        and ${table.updatedRows} >= 0
        and ${table.unchangedRows} >= 0
        and ${table.insertedRows} + ${table.updatedRows} + ${table.unchangedRows} = ${table.loadedRows}
      )`,
    ),
  ],
);

export const marketingPerformance = pgTable(
  "marketing_performance",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    campaignId: uuid("campaign_id").notNull(),
    importRunId: uuid("import_run_id"),
    performanceDate: date("date", { mode: "string" }).notNull(),
    impressions: bigint("impressions", { mode: "number" }).notNull(),
    clicks: bigint("clicks", { mode: "number" }).notNull(),
    conversions: bigint("conversions", { mode: "number" }).notNull(),
    spend: numeric("spend", { precision: 14, scale: 2 }).notNull(),
    revenue: numeric("revenue", { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.campaignId, table.organizationId],
      foreignColumns: [campaigns.id, campaigns.organizationId],
      name: "performance_campaign_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.importRunId, table.organizationId],
      foreignColumns: [importRuns.id, importRuns.organizationId],
      name: "performance_import_org_fk",
    }),
    unique("performance_org_campaign_date_uq").on(
      table.organizationId,
      table.campaignId,
      table.performanceDate,
    ),
    index("performance_org_date_idx").on(
      table.organizationId,
      table.performanceDate,
    ),
    index("performance_org_campaign_date_idx").on(
      table.organizationId,
      table.campaignId,
      table.performanceDate,
    ),
    check(
      "performance_impressions_nonnegative",
      sql`${table.impressions} >= 0`,
    ),
    check("performance_clicks_nonnegative", sql`${table.clicks} >= 0`),
    check(
      "performance_conversions_nonnegative",
      sql`${table.conversions} >= 0`,
    ),
    check(
      "performance_clicks_lte_impressions",
      sql`${table.clicks} <= ${table.impressions}`,
    ),
    check(
      "performance_conversions_lte_clicks",
      sql`${table.conversions} <= ${table.clicks}`,
    ),
    check("performance_spend_nonnegative", sql`${table.spend} >= 0`),
    check("performance_revenue_nonnegative", sql`${table.revenue} >= 0`),
  ],
);

export const dataQualityIssues = pgTable(
  "data_quality_issues",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    importRunId: uuid("import_run_id")
      .notNull()
      .references(() => importRuns.id, { onDelete: "cascade" }),
    issueType: text("issue_type").notNull(),
    field: text("field"),
    count: bigint("count", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("data_quality_issues_import_idx").on(table.importRunId),
    check("data_quality_issues_count_positive", sql`${table.count} > 0`),
  ],
);

export const warehouseRefreshState = pgTable(
  "warehouse_refresh_state",
  {
    aggregateKey: text("aggregate_key").primaryKey(),
    status: warehouseRefreshStatus("status").notNull(),
    dataRevision: bigint("data_revision", { mode: "number" })
      .default(0)
      .notNull(),
    refreshedRevision: bigint("refreshed_revision", { mode: "number" })
      .default(0)
      .notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorMessage: text("error_message"),
  },
  (table) => [
    check(
      "warehouse_refresh_revisions_nonnegative",
      sql`${table.dataRevision} >= 0 and ${table.refreshedRevision} >= 0`,
    ),
    check(
      "warehouse_refresh_revision_order",
      sql`${table.refreshedRevision} <= ${table.dataRevision}`,
    ),
  ],
);

export const predictionRuns = pgTable(
  "prediction_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    status: predictionRunStatus("status").notNull(),
    target: text("target").notNull(),
    modelVersion: text("model_version").notNull(),
    algorithm: text("algorithm").notNull(),
    sourceDataRevision: bigint("source_data_revision", {
      mode: "number",
    }).notNull(),
    sourceImportRunId: uuid("source_import_run_id"),
    dataAsOf: date("data_as_of", { mode: "string" }),
    trainingStartDate: date("training_start_date", { mode: "string" }),
    trainingEndDate: date("training_end_date", { mode: "string" }),
    forecastStartDate: date("forecast_start_date", { mode: "string" }),
    forecastEndDate: date("forecast_end_date", { mode: "string" }),
    trainingRows: integer("training_rows"),
    eligibleCampaigns: integer("eligible_campaigns"),
    excludedCampaigns: integer("excluded_campaigns"),
    mae: numeric("mae", { precision: 18, scale: 2 }),
    wape: numeric("wape", { precision: 8, scale: 4 }),
    baselineMae: numeric("baseline_mae", { precision: 18, scale: 2 }),
    baselineWape: numeric("baseline_wape", { precision: 8, scale: 4 }),
    intervalLevel: integer("interval_level"),
    intervalCoverage: numeric("interval_coverage", { precision: 8, scale: 4 }),
    quality: text("quality"),
    parameters: jsonb("parameters"),
    coefficients: jsonb("coefficients"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    errorMessage: text("error_message"),
  },
  (table) => [
    unique("prediction_runs_id_org_uq").on(table.id, table.organizationId),
    foreignKey({
      columns: [table.sourceImportRunId, table.organizationId],
      foreignColumns: [importRuns.id, importRuns.organizationId],
      name: "prediction_runs_source_import_org_fk",
    }),
    index("prediction_runs_org_started_idx").on(
      table.organizationId,
      table.startedAt,
    ),
    check(
      "prediction_runs_source_revision_nonnegative",
      sql`${table.sourceDataRevision} >= 0`,
    ),
    check(
      "prediction_runs_counts_nonnegative",
      sql`coalesce(${table.trainingRows}, 0) >= 0
        and coalesce(${table.eligibleCampaigns}, 0) >= 0
        and coalesce(${table.excludedCampaigns}, 0) >= 0`,
    ),
    check(
      "prediction_runs_metrics_nonnegative",
      sql`coalesce(${table.mae}, 0) >= 0
        and coalesce(${table.wape}, 0) >= 0
        and coalesce(${table.baselineMae}, 0) >= 0
        and coalesce(${table.baselineWape}, 0) >= 0`,
    ),
    check(
      "prediction_runs_interval_valid",
      sql`${table.intervalLevel} is null or ${table.intervalLevel} between 1 and 99`,
    ),
    check(
      "prediction_runs_coverage_valid",
      sql`${table.intervalCoverage} is null or ${table.intervalCoverage} between 0 and 100`,
    ),
    check(
      "prediction_runs_quality_valid",
      sql`${table.quality} is null or ${table.quality} in ('beats_baseline', 'below_baseline')`,
    ),
  ],
);

export const campaignPredictions = pgTable(
  "campaign_predictions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    predictionRunId: uuid("prediction_run_id").notNull(),
    campaignId: uuid("campaign_id").notNull(),
    forecastStartDate: date("forecast_start_date", {
      mode: "string",
    }).notNull(),
    forecastEndDate: date("forecast_end_date", { mode: "string" }).notNull(),
    previousRevenue: numeric("previous_revenue", {
      precision: 18,
      scale: 2,
    }).notNull(),
    predictedRevenue: numeric("predicted_revenue", {
      precision: 18,
      scale: 2,
    }).notNull(),
    lowerBound: numeric("lower_bound", { precision: 18, scale: 2 }).notNull(),
    upperBound: numeric("upper_bound", { precision: 18, scale: 2 }).notNull(),
    drivers: jsonb("drivers").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.predictionRunId, table.organizationId],
      foreignColumns: [predictionRuns.id, predictionRuns.organizationId],
      name: "campaign_predictions_run_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.campaignId, table.organizationId],
      foreignColumns: [campaigns.id, campaigns.organizationId],
      name: "campaign_predictions_campaign_org_fk",
    }).onDelete("cascade"),
    unique("campaign_predictions_run_campaign_uq").on(
      table.predictionRunId,
      table.campaignId,
    ),
    index("campaign_predictions_org_campaign_idx").on(
      table.organizationId,
      table.campaignId,
    ),
    check(
      "campaign_predictions_dates_valid",
      sql`${table.forecastEndDate} >= ${table.forecastStartDate}`,
    ),
    check(
      "campaign_predictions_values_valid",
      sql`${table.previousRevenue} >= 0
        and ${table.lowerBound} >= 0
        and ${table.predictedRevenue} >= ${table.lowerBound}
        and ${table.upperBound} >= ${table.predictedRevenue}`,
    ),
  ],
);

export const organizationDailyPerformance = pgMaterializedView(
  "organization_daily_performance",
  {
    organizationId: uuid("organization_id").notNull(),
    performanceDate: date("date", { mode: "string" }).notNull(),
    impressions: bigint("impressions", { mode: "number" }).notNull(),
    clicks: bigint("clicks", { mode: "number" }).notNull(),
    conversions: bigint("conversions", { mode: "number" }).notNull(),
    spend: numeric("spend", { precision: 18, scale: 2 }).notNull(),
    revenue: numeric("revenue", { precision: 18, scale: 2 }).notNull(),
  },
).as(sql`
  select
    organization_id,
    date,
    sum(impressions)::bigint as impressions,
    sum(clicks)::bigint as clicks,
    sum(conversions)::bigint as conversions,
    sum(spend)::numeric(18,2) as spend,
    sum(revenue)::numeric(18,2) as revenue
  from marketing_performance
  group by organization_id, date
`);
