import 'dotenv/config';
import { and, eq, sql } from 'drizzle-orm';
import {
  campaigns,
  dataQualityIssues,
  importRuns,
  marketingPerformance,
  member,
  organization,
  session,
  user,
  warehouseRefreshState,
} from '@campaign-iq/database/schema';
import { databaseConnection } from './database.js';
import { createCampaignIqAuth } from '../auth/auth.js';

const DEMO_EMAIL = process.env.DEMO_USER_EMAIL ?? 'demo@campaigniq.local';
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD ?? 'CampaignIQ2026!';
const ORGANIZATION_ID = '10000000-0000-4000-8000-000000000001';
const IMPORT_RUN_ID = '20000000-0000-4000-8000-000000000001';
const DATA_END_DATE = '2026-08-27';

const campaignSeed = [
  ['CAMP001', 'Summer Search', 'Google', 17800, 0.039, 0.115, 1.86, 86],
  ['CAMP002', 'Always-on Retargeting', 'Meta', 14200, 0.031, 0.138, 1.61, 79],
  ['CAMP003', 'Enterprise Pipeline', 'LinkedIn', 5200, 0.018, 0.091, 5.42, 214],
  ['CAMP004', 'Creator Launch', 'TikTok', 23100, 0.026, 0.074, 1.14, 63],
  ['CAMP005', 'Brand Defense', 'Google', 11100, 0.052, 0.142, 1.38, 72],
  ['CAMP006', 'Lookalike Growth', 'Meta', 16700, 0.028, 0.102, 1.52, 81],
  ['CAMP007', 'Q3 Decision Makers', 'LinkedIn', 4300, 0.016, 0.084, 6.18, 246],
  ['CAMP008', 'Product Demo Video', 'TikTok', 20600, 0.024, 0.068, 1.09, 58],
  ['CAMP009', 'Competitor Search', 'Google', 9200, 0.043, 0.108, 2.12, 94],
  ['CAMP010', 'Cart Recovery', 'Meta', 12400, 0.036, 0.157, 1.72, 83],
  ['CAMP011', 'Webinar Leads', 'LinkedIn', 3900, 0.021, 0.097, 5.84, 229],
  ['CAMP012', 'Customer Stories', 'TikTok', 18800, 0.029, 0.079, 1.21, 66],
] as const;

function dateAtOffset(offset: number) {
  const date = new Date(`${DATA_END_DATE}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

async function seedAuth() {
  const auth = createCampaignIqAuth(true);
  const [existingUser] = await databaseConnection.db
    .select()
    .from(user)
    .where(eq(user.email, DEMO_EMAIL))
    .limit(1);

  let userId = existingUser?.id;
  if (!userId) {
    const result = await auth.api.signUpEmail({
      body: { email: DEMO_EMAIL, password: DEMO_PASSWORD, name: 'Alex Morgan' },
    });
    userId = result.user.id;
  }

  await databaseConnection.db
    .insert(organization)
    .values({
      id: ORGANIZATION_ID,
      name: 'Northstar Growth',
      slug: 'northstar-growth',
      createdAt: new Date('2026-01-05T14:00:00.000Z'),
    })
    .onConflictDoUpdate({
      target: organization.slug,
      set: { name: 'Northstar Growth' },
    });

  const [existingMembership] = await databaseConnection.db
    .select()
    .from(member)
    .where(
      and(
        eq(member.userId, userId),
        eq(member.organizationId, ORGANIZATION_ID),
      ),
    )
    .limit(1);
  if (!existingMembership) {
    await databaseConnection.db.insert(member).values({
      id: crypto.randomUUID(),
      userId,
      organizationId: ORGANIZATION_ID,
      role: 'owner',
      createdAt: new Date('2026-01-05T14:00:00.000Z'),
    });
  }

  await databaseConnection.db.delete(session).where(eq(session.userId, userId));
  return { id: userId, email: DEMO_EMAIL };
}

async function seedAnalytics() {
  await databaseConnection.db
    .insert(importRuns)
    .values({
      id: IMPORT_RUN_ID,
      organizationId: ORGANIZATION_ID,
      filename: 'campaign_history_seed.csv',
      status: 'completed',
      receivedRows: 2198,
      loadedRows: 2160,
      rejectedRows: 38,
      insertedRows: 2160,
      updatedRows: 0,
      unchangedRows: 0,
      startedAt: new Date('2026-08-27T12:00:00.000Z'),
      completedAt: new Date('2026-08-27T12:00:18.430Z'),
      durationMs: 18430,
      createdAt: new Date('2026-08-27T12:00:00.000Z'),
    })
    .onConflictDoUpdate({
      target: importRuns.id,
      set: {
        loadedRows: 2160,
        rejectedRows: 38,
        insertedRows: 2160,
        updatedRows: 0,
        unchangedRows: 0,
        status: 'completed',
      },
    });

  const campaignRows = campaignSeed.map(
    ([externalId, name, channel], index) => ({
      id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      organizationId: ORGANIZATION_ID,
      externalId,
      name,
      channel,
      createdAt: new Date('2026-03-01T12:00:00.000Z'),
      updatedAt: new Date('2026-08-27T12:00:00.000Z'),
    }),
  );

  for (const row of campaignRows) {
    await databaseConnection.db
      .insert(campaigns)
      .values(row)
      .onConflictDoUpdate({
        target: [
          campaigns.organizationId,
          campaigns.externalId,
          campaigns.channel,
        ],
        set: { name: row.name, updatedAt: row.updatedAt },
      });
  }

  const performanceRows = campaignSeed.flatMap((campaign, campaignIndex) => {
    const [, , , baseImpressions, baseCtr, baseCvr, baseCpc, baseOrderValue] =
      campaign;
    return Array.from({ length: 180 }, (_, dayIndex) => {
      const growth = 0.88 + dayIndex * 0.00145;
      const weekly = 1 + Math.sin((dayIndex + campaignIndex * 2) / 7) * 0.09;
      const monthly = 1 + Math.cos((dayIndex + campaignIndex) / 22) * 0.055;
      const impressions = Math.round(
        baseImpressions * growth * weekly * monthly,
      );
      const ctr =
        baseCtr * (0.94 + dayIndex * 0.0007 + Math.sin(dayIndex / 11) * 0.025);
      const clicks = Math.min(impressions, Math.round(impressions * ctr));
      const conversions = Math.min(
        clicks,
        Math.round(clicks * baseCvr * (0.91 + dayIndex * 0.00085)),
      );
      const spend = clicks * baseCpc * (0.96 + Math.cos(dayIndex / 9) * 0.035);
      const revenue =
        conversions * baseOrderValue * (0.97 + Math.sin(dayIndex / 13) * 0.045);

      return {
        organizationId: ORGANIZATION_ID,
        campaignId: campaignRows[campaignIndex].id,
        importRunId: IMPORT_RUN_ID,
        performanceDate: dateAtOffset(dayIndex - 179),
        impressions,
        clicks,
        conversions,
        spend: spend.toFixed(2),
        revenue: revenue.toFixed(2),
      };
    });
  });

  for (let index = 0; index < performanceRows.length; index += 250) {
    const batch = performanceRows.slice(index, index + 250);
    await databaseConnection.db
      .insert(marketingPerformance)
      .values(batch)
      .onConflictDoNothing({
        target: [
          marketingPerformance.organizationId,
          marketingPerformance.campaignId,
          marketingPerformance.performanceDate,
        ],
      });
  }

  await databaseConnection.db
    .delete(dataQualityIssues)
    .where(eq(dataQualityIssues.importRunId, IMPORT_RUN_ID));
  await databaseConnection.db.insert(dataQualityIssues).values([
    {
      importRunId: IMPORT_RUN_ID,
      issueType: 'missing_required_value',
      field: 'campaign_id',
      count: 18,
    },
    {
      importRunId: IMPORT_RUN_ID,
      issueType: 'duplicate_record',
      field: null,
      count: 12,
    },
    {
      importRunId: IMPORT_RUN_ID,
      issueType: 'clicks_exceed_impressions',
      field: 'clicks',
      count: 8,
    },
  ]);

  const [staleState] = await databaseConnection.db
    .update(warehouseRefreshState)
    .set({
      status: 'stale',
      dataRevision: sql`${warehouseRefreshState.dataRevision} + 1`,
      errorMessage: null,
    })
    .where(
      eq(warehouseRefreshState.aggregateKey, 'organization_daily_performance'),
    )
    .returning();
  await databaseConnection.db.execute(
    sql`refresh materialized view organization_daily_performance`,
  );
  await databaseConnection.db
    .update(warehouseRefreshState)
    .set({
      status: 'current',
      refreshedRevision: staleState.dataRevision,
      completedAt: new Date(),
      errorMessage: null,
    })
    .where(
      eq(warehouseRefreshState.aggregateKey, 'organization_daily_performance'),
    );
}

try {
  const demoUser = await seedAuth();
  await seedAnalytics();
  console.info(`Seeded CampaignIQ demo for ${demoUser.email}.`);
} finally {
  await databaseConnection.pool.end();
}
