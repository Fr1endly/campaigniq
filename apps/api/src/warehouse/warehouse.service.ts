import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { WarehouseStatus } from '@campaign-iq/contracts';
import { InjectDatabase, type Database } from '../database/database.module.js';
import { env } from '../config/env.js';

const execFileAsync = promisify(execFile);

type WarehouseStatusRow = {
  dataAsOf: string | null;
  campaignCount: number;
  factCount: number;
  latestCompletedImportAt: Date | string | null;
  completedRuns: number;
  failedRuns: number;
  successRate: string | null;
  validRate: string | null;
  loadedRows: string;
  rejectedRows: string;
  averageDurationMs: number | null;
  rowsPerSecond: string | null;
  refreshStatus: 'current' | 'stale' | 'refreshing' | 'failed';
  dataRevision: string;
  refreshedRevision: string;
  refreshedAt: Date | string | null;
  refreshErrorMessage: string | null;
};

@Injectable()
export class WarehouseService {
  private refreshActive = false;
  private readonly logger = new Logger(WarehouseService.name);

  constructor(@InjectDatabase() private readonly db: Database) {}

  async getStatus(organizationId: string): Promise<WarehouseStatus> {
    const result = await this.db.execute<WarehouseStatusRow>(sql`
      with fact_summary as (
        select
          max(date)::text as "dataAsOf",
          count(*)::int as "factCount"
        from marketing_performance
        where organization_id = ${organizationId}
      ), campaign_summary as (
        select count(*)::int as "campaignCount"
        from campaigns
        where organization_id = ${organizationId}
      ), import_summary as (
        select
          max(completed_at) filter (where status = 'completed') as "latestCompletedImportAt",
          count(*) filter (
            where status = 'completed' and created_at >= now() - interval '30 days'
          )::int as "completedRuns",
          count(*) filter (
            where status = 'failed' and created_at >= now() - interval '30 days'
          )::int as "failedRuns",
          case
            when count(*) filter (
              where status in ('completed', 'failed')
                and created_at >= now() - interval '30 days'
            ) = 0 then null
            else 100.0 * count(*) filter (
              where status = 'completed' and created_at >= now() - interval '30 days'
            ) / count(*) filter (
              where status in ('completed', 'failed')
                and created_at >= now() - interval '30 days'
            )
          end as "successRate",
          case
            when coalesce(sum(received_rows) filter (
              where status = 'completed' and created_at >= now() - interval '30 days'
            ), 0) = 0 then null
            else 100.0 * sum(loaded_rows) filter (
              where status = 'completed' and created_at >= now() - interval '30 days'
            ) / sum(received_rows) filter (
              where status = 'completed' and created_at >= now() - interval '30 days'
            )
          end as "validRate",
          coalesce(sum(loaded_rows) filter (
            where status = 'completed' and created_at >= now() - interval '30 days'
          ), 0)::text as "loadedRows",
          coalesce(sum(rejected_rows) filter (
            where status = 'completed' and created_at >= now() - interval '30 days'
          ), 0)::text as "rejectedRows",
          round(avg(duration_ms) filter (
            where status = 'completed'
              and duration_ms is not null
              and created_at >= now() - interval '30 days'
          ))::int as "averageDurationMs",
          case
            when coalesce(sum(duration_ms) filter (
              where status = 'completed'
                and duration_ms > 0
                and created_at >= now() - interval '30 days'
            ), 0) = 0 then null
            else 1000.0 * sum(loaded_rows) filter (
              where status = 'completed'
                and duration_ms > 0
                and created_at >= now() - interval '30 days'
            ) / sum(duration_ms) filter (
              where status = 'completed'
                and duration_ms > 0
                and created_at >= now() - interval '30 days'
            )
          end as "rowsPerSecond"
        from import_runs
        where organization_id = ${organizationId}
      ), refresh_summary as (
        select
          status as "refreshStatus",
          data_revision::text as "dataRevision",
          refreshed_revision::text as "refreshedRevision",
          completed_at as "refreshedAt",
          error_message as "refreshErrorMessage"
        from warehouse_refresh_state
        where aggregate_key = 'organization_daily_performance'
      )
      select *
      from fact_summary, campaign_summary, import_summary, refresh_summary
    `);
    const row = result.rows[0];
    return {
      dataAsOf: row.dataAsOf,
      campaignCount: row.campaignCount,
      factCount: row.factCount,
      latestCompletedImportAt:
        row.latestCompletedImportAt === null
          ? null
          : new Date(row.latestCompletedImportAt).toISOString(),
      trailing30Days: {
        completedRuns: row.completedRuns,
        failedRuns: row.failedRuns,
        successRate: row.successRate === null ? null : Number(row.successRate),
        validRate: row.validRate === null ? null : Number(row.validRate),
        loadedRows: Number(row.loadedRows),
        rejectedRows: Number(row.rejectedRows),
        averageDurationMs: row.averageDurationMs,
        rowsPerSecond:
          row.rowsPerSecond === null ? null : Number(row.rowsPerSecond),
      },
      reporting: {
        strategy: 'materialized',
        status: row.refreshStatus,
        dataRevision: Number(row.dataRevision),
        refreshedRevision: Number(row.refreshedRevision),
        refreshedAt:
          row.refreshedAt === null
            ? null
            : new Date(row.refreshedAt).toISOString(),
        errorMessage: row.refreshErrorMessage,
      },
    };
  }

  startRefresh() {
    if (this.refreshActive)
      throw new ConflictException('Aggregate refresh is already running');
    this.refreshActive = true;
    void this.executeRefresh();
    return { status: 'accepted' as const };
  }

  private async executeRefresh() {
    try {
      await execFileAsync(
        env.ETL_PYTHON_BIN,
        ['-m', 'campaigniq_etl', 'refresh-aggregates'],
        {
          env: { ...process.env, DATABASE_URL: env.DATABASE_URL },
          maxBuffer: 1024 * 1024,
        },
      );
    } catch (error) {
      this.logger.error('Reporting aggregate refresh failed', error);
    } finally {
      this.refreshActive = false;
    }
  }
}
