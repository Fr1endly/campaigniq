import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import {
  campaigns,
  importRuns,
  marketingPerformance,
  organization,
  warehouseRefreshState,
  createDatabase,
} from '@campaign-iq/database';
import { AnalyticsService } from './analytics.service.js';
import { WarehouseService } from '../warehouse/warehouse.service.js';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://campaign_iq:campaign_iq@localhost:5432/campaign_iq';
const connection = createDatabase(databaseUrl);
const organizationId = randomUUID();
const importRunId = randomUUID();
const firstCampaignId = randomUUID();
const secondCampaignId = randomUUID();

async function setAggregateCurrent() {
  await connection.db.execute(
    sql`refresh materialized view concurrently organization_daily_performance`,
  );
  await connection.db
    .update(warehouseRefreshState)
    .set({
      status: 'current',
      refreshedRevision: sql`${warehouseRefreshState.dataRevision}`,
      completedAt: new Date(),
      errorMessage: null,
    })
    .where(
      eq(warehouseRefreshState.aggregateKey, 'organization_daily_performance'),
    );
}

describe.sequential('analytics warehouse integration', () => {
  beforeAll(async () => {
    await connection.db.insert(organization).values({
      id: organizationId,
      name: 'Analytics Integration',
      slug: `analytics-${organizationId}`,
      createdAt: new Date(),
    });
    await connection.db.insert(importRuns).values({
      id: importRunId,
      organizationId,
      filename: 'analytics-integration.csv',
      status: 'completed',
      receivedRows: 30,
      loadedRows: 28,
      rejectedRows: 2,
      insertedRows: 28,
      updatedRows: 0,
      unchangedRows: 0,
      startedAt: new Date(Date.now() - 1_000),
      completedAt: new Date(),
      durationMs: 1_000,
    });
    await connection.db.insert(campaigns).values([
      {
        id: firstCampaignId,
        organizationId,
        externalId: 'RANK-A',
        name: 'Revenue Riser',
        channel: 'Google',
      },
      {
        id: secondCampaignId,
        organizationId,
        externalId: 'RANK-B',
        name: 'Prior Leader',
        channel: 'Meta',
      },
    ]);
    const facts = Array.from({ length: 14 }, (_, index) => {
      const performanceDate = new Date('2026-08-01T00:00:00.000Z');
      performanceDate.setUTCDate(performanceDate.getUTCDate() + index);
      const current = index >= 7;
      return [
        {
          organizationId,
          campaignId: firstCampaignId,
          importRunId,
          performanceDate: performanceDate.toISOString().slice(0, 10),
          impressions: 1_000,
          clicks: 100,
          conversions: 10,
          spend: '50.00',
          revenue: current ? '200.00' : '100.00',
        },
        {
          organizationId,
          campaignId: secondCampaignId,
          importRunId,
          performanceDate: performanceDate.toISOString().slice(0, 10),
          impressions: 1_000,
          clicks: 100,
          conversions: 10,
          spend: '60.00',
          revenue: current ? '100.00' : '150.00',
        },
      ];
    }).flat();
    await connection.db.insert(marketingPerformance).values(facts);
    await connection.db
      .update(warehouseRefreshState)
      .set({
        status: 'stale',
        dataRevision: sql`${warehouseRefreshState.dataRevision} + 1`,
      })
      .where(
        eq(
          warehouseRefreshState.aggregateKey,
          'organization_daily_performance',
        ),
      );
  });

  afterAll(async () => {
    await connection.db
      .delete(organization)
      .where(eq(organization.id, organizationId));
    await setAggregateCurrent();
    await connection.pool.end();
  });

  it('uses base facts while stale and calculates rolling revenue and rank movement', async () => {
    const dashboard = await new AnalyticsService(connection.db).getDashboard(
      organizationId,
      '7d',
    );

    expect(dashboard.trend).toHaveLength(7);
    expect(dashboard.trend.at(-1)).toMatchObject({
      date: '2026-08-14',
      revenue: '300.00',
      rollingRevenue: '300.00',
    });
    expect(dashboard.topCampaigns[0]).toMatchObject({
      name: 'Revenue Riser',
      currentRank: 1,
      previousRank: 2,
      rankChange: 1,
      revenueChange: 100,
    });
    expect(dashboard.topCampaigns[1]).toMatchObject({
      name: 'Prior Leader',
      currentRank: 2,
      previousRank: 1,
      rankChange: -1,
    });
  });

  it('returns the same dashboard after the aggregate becomes current', async () => {
    const analytics = new AnalyticsService(connection.db);
    const staleDashboard = await analytics.getDashboard(organizationId, '7d');
    await setAggregateCurrent();
    const currentDashboard = await analytics.getDashboard(organizationId, '7d');

    expect(currentDashboard.metrics).toEqual(staleDashboard.metrics);
    expect(currentDashboard.trend).toEqual(staleDashboard.trend);
  });

  it('reports tenant-scoped warehouse volume, quality, and throughput', async () => {
    const status = await new WarehouseService(connection.db).getStatus(
      organizationId,
    );

    expect(status).toMatchObject({
      dataAsOf: '2026-08-14',
      campaignCount: 2,
      factCount: 28,
      trailing30Days: {
        completedRuns: 1,
        failedRuns: 0,
        successRate: 100,
        loadedRows: 28,
        rejectedRows: 2,
        averageDurationMs: 1_000,
        rowsPerSecond: 28,
      },
      reporting: { strategy: 'materialized', status: 'current' },
    });
    expect(status.trailing30Days.validRate).toBeCloseTo(93.33, 2);
  });
});
