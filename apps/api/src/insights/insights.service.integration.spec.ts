import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  campaignPredictions,
  campaigns,
  createDatabase,
  importRuns,
  organization,
  predictionRuns,
  warehouseRefreshState,
} from '@campaign-iq/database';
import { InsightsService } from './insights.service.js';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://campaign_iq:campaign_iq@localhost:5432/campaign_iq';
const connection = createDatabase(databaseUrl);
const organizationId = randomUUID();
const otherOrganizationId = randomUUID();
const campaignId = randomUUID();
const otherCampaignId = randomUUID();
const completedRunId = randomUUID();
const otherRunId = randomUUID();
let originalRevision = 0;

describe.sequential('insights integration', () => {
  beforeAll(async () => {
    const [refreshState] = await connection.db
      .select()
      .from(warehouseRefreshState)
      .where(
        eq(
          warehouseRefreshState.aggregateKey,
          'organization_daily_performance',
        ),
      );
    originalRevision = refreshState.dataRevision;
    await connection.db.insert(organization).values([
      {
        id: organizationId,
        name: 'Insights Integration',
        slug: `insights-${organizationId}`,
        createdAt: new Date(),
      },
      {
        id: otherOrganizationId,
        name: 'Other Insights Tenant',
        slug: `insights-${otherOrganizationId}`,
        createdAt: new Date(),
      },
    ]);
    await connection.db.insert(campaigns).values([
      {
        id: campaignId,
        organizationId,
        externalId: 'INSIGHT-A',
        name: 'Visible Forecast',
        channel: 'Google',
      },
      {
        id: otherCampaignId,
        organizationId: otherOrganizationId,
        externalId: 'INSIGHT-B',
        name: 'Hidden Forecast',
        channel: 'Meta',
      },
    ]);
    const runValues = {
      status: 'completed' as const,
      target: 'campaign_revenue_7d',
      modelVersion: '1',
      algorithm: 'ridge_regression',
      sourceDataRevision: originalRevision,
      dataAsOf: '2026-08-27',
      trainingStartDate: '2026-03-01',
      trainingEndDate: '2026-08-27',
      forecastStartDate: '2026-08-28',
      forecastEndDate: '2026-09-03',
      trainingRows: 100,
      eligibleCampaigns: 1,
      excludedCampaigns: 0,
      mae: '25.00',
      wape: '8.5000',
      baselineMae: '40.00',
      baselineWape: '12.0000',
      intervalLevel: 80,
      intervalCoverage: '81.0000',
      quality: 'beats_baseline',
      completedAt: new Date('2026-08-27T14:00:00.000Z'),
      durationMs: 500,
    };
    await connection.db.insert(predictionRuns).values([
      { id: completedRunId, organizationId, ...runValues },
      {
        id: otherRunId,
        organizationId: otherOrganizationId,
        ...runValues,
      },
    ]);
    const drivers = [
      {
        feature: 'revenue_last_7d',
        label: 'Recent revenue',
        direction: 'positive',
        contribution: '50.00',
      },
    ];
    await connection.db.insert(campaignPredictions).values([
      {
        organizationId,
        predictionRunId: completedRunId,
        campaignId,
        forecastStartDate: '2026-08-28',
        forecastEndDate: '2026-09-03',
        previousRevenue: '1000.00',
        predictedRevenue: '1200.00',
        lowerBound: '1100.00',
        upperBound: '1300.00',
        drivers,
      },
      {
        organizationId: otherOrganizationId,
        predictionRunId: otherRunId,
        campaignId: otherCampaignId,
        forecastStartDate: '2026-08-28',
        forecastEndDate: '2026-09-03',
        previousRevenue: '9000.00',
        predictedRevenue: '10000.00',
        lowerBound: '9500.00',
        upperBound: '10500.00',
        drivers,
      },
    ]);
  });

  afterAll(async () => {
    await connection.db
      .delete(organization)
      .where(eq(organization.id, organizationId));
    await connection.db
      .delete(organization)
      .where(eq(organization.id, otherOrganizationId));
    await connection.pool.end();
  });

  it('returns only the authenticated organization forecast', async () => {
    const response = await new InsightsService(connection.db).getInsights(
      organizationId,
    );

    expect(response.summary).toMatchObject({
      previousRevenue: '1000.00',
      predictedRevenue: '1200.00',
      change: 20,
    });
    expect(response.predictions).toHaveLength(1);
    expect(response.predictions[0].campaign.name).toBe('Visible Forecast');
  });

  it('retains the successful forecast after a fresh generation failure', async () => {
    const freshImportId = randomUUID();
    await connection.db.insert(importRuns).values({
      id: freshImportId,
      organizationId,
      filename: 'fresh.csv',
      status: 'completed',
      receivedRows: 1,
      loadedRows: 1,
      rejectedRows: 0,
      insertedRows: 1,
      updatedRows: 0,
      unchangedRows: 0,
      completedAt: new Date('2026-08-27T14:30:00.000Z'),
      durationMs: 100,
    });
    await connection.db.insert(predictionRuns).values({
      organizationId,
      status: 'failed',
      target: 'campaign_revenue_7d',
      modelVersion: '1',
      algorithm: 'ridge_regression',
      sourceDataRevision: originalRevision,
      sourceImportRunId: freshImportId,
      completedAt: new Date('2026-08-27T15:00:00.000Z'),
      durationMs: 100,
      errorMessage: 'forced prediction failure',
    });

    const response = await new InsightsService(connection.db).getInsights(
      organizationId,
    );

    expect(response.state).toBe('stale');
    expect(response.latestAttempt).toMatchObject({
      status: 'failed',
      errorMessage: 'forced prediction failure',
    });
    expect(response.predictions[0].campaign.name).toBe('Visible Forecast');
  });
});
