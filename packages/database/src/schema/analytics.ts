import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { organization } from './auth.js';

export const importStatus = pgEnum('import_status', [
  'received',
  'uploading',
  'processing',
  'completed',
  'failed',
]);

export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
    channel: text('channel').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique('campaigns_org_external_channel_uq').on(
      table.organizationId,
      table.externalId,
      table.channel,
    ),
    unique('campaigns_id_org_uq').on(table.id, table.organizationId),
    index('campaigns_org_name_idx').on(table.organizationId, table.name),
  ],
);

export const importRuns = pgTable(
  'import_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    status: importStatus('status').notNull(),
    receivedRows: bigint('received_rows', { mode: 'number' }).default(0).notNull(),
    loadedRows: bigint('loaded_rows', { mode: 'number' }).default(0).notNull(),
    rejectedRows: bigint('rejected_rows', { mode: 'number' }).default(0).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),
    s3Key: text('s3_key'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('import_runs_id_org_uq').on(table.id, table.organizationId),
    index('import_runs_org_created_idx').on(table.organizationId, table.createdAt),
    check(
      'import_runs_counts_nonnegative',
      sql`${table.receivedRows} >= 0 and ${table.loadedRows} >= 0 and ${table.rejectedRows} >= 0`,
    ),
  ],
);

export const marketingPerformance = pgTable(
  'marketing_performance',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    campaignId: uuid('campaign_id').notNull(),
    importRunId: uuid('import_run_id'),
    performanceDate: date('date', { mode: 'string' }).notNull(),
    impressions: bigint('impressions', { mode: 'number' }).notNull(),
    clicks: bigint('clicks', { mode: 'number' }).notNull(),
    conversions: bigint('conversions', { mode: 'number' }).notNull(),
    spend: numeric('spend', { precision: 14, scale: 2 }).notNull(),
    revenue: numeric('revenue', { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.campaignId, table.organizationId],
      foreignColumns: [campaigns.id, campaigns.organizationId],
      name: 'performance_campaign_org_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.importRunId, table.organizationId],
      foreignColumns: [importRuns.id, importRuns.organizationId],
      name: 'performance_import_org_fk',
    }),
    unique('performance_org_campaign_date_uq').on(
      table.organizationId,
      table.campaignId,
      table.performanceDate,
    ),
    index('performance_org_date_idx').on(table.organizationId, table.performanceDate),
    index('performance_org_campaign_date_idx').on(
      table.organizationId,
      table.campaignId,
      table.performanceDate,
    ),
    check('performance_impressions_nonnegative', sql`${table.impressions} >= 0`),
    check('performance_clicks_nonnegative', sql`${table.clicks} >= 0`),
    check('performance_conversions_nonnegative', sql`${table.conversions} >= 0`),
    check('performance_clicks_lte_impressions', sql`${table.clicks} <= ${table.impressions}`),
    check('performance_conversions_lte_clicks', sql`${table.conversions} <= ${table.clicks}`),
    check('performance_spend_nonnegative', sql`${table.spend} >= 0`),
    check('performance_revenue_nonnegative', sql`${table.revenue} >= 0`),
  ],
);

export const dataQualityIssues = pgTable(
  'data_quality_issues',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    importRunId: uuid('import_run_id')
      .notNull()
      .references(() => importRuns.id, { onDelete: 'cascade' }),
    issueType: text('issue_type').notNull(),
    field: text('field'),
    count: bigint('count', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('data_quality_issues_import_idx').on(table.importRunId),
    check('data_quality_issues_count_positive', sql`${table.count} > 0`),
  ],
);
