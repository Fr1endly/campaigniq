import 'dotenv/config';
import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    'postgresql://campaign_iq:campaign_iq@localhost:5432/campaign_iq',
});

describe('warehouse constraints', () => {
  afterAll(async () => pool.end());

  it('rejects clicks greater than impressions', async () => {
    await expect(
      pool.query(
        `insert into marketing_performance
          (organization_id, campaign_id, date, impressions, clicks, conversions, spend, revenue)
         values
          ('10000000-0000-4000-8000-000000000001',
           '30000000-0000-4000-8000-000000000001',
           '2025-01-01', 100, 101, 5, 10, 20)`,
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('contains the deterministic 180-day campaign seed', async () => {
    const result = await pool.query<{ campaigns: string; rows: string }>(`
      select count(distinct campaign_id)::text as campaigns, count(*)::text as rows
      from marketing_performance
      where organization_id = '10000000-0000-4000-8000-000000000001'
    `);
    expect(result.rows[0]).toEqual({ campaigns: '12', rows: '2160' });
  });

  it('rejects cross-organization campaign predictions', async () => {
    await expect(
      pool.query(`
        with new_run as (
          insert into prediction_runs
            (organization_id, status, target, model_version, algorithm,
             source_data_revision)
          values
            ('10000000-0000-4000-8000-000000000001', 'running',
             'campaign_revenue_7d', 'constraint-test', 'ridge_regression', 0)
          returning id
        )
        insert into campaign_predictions
          (organization_id, prediction_run_id, campaign_id,
           forecast_start_date, forecast_end_date, previous_revenue,
           predicted_revenue, lower_bound, upper_bound, drivers)
        select
          '90000000-0000-4000-8000-000000000099', nr.id, c.id,
          '2026-08-28', '2026-09-03', 100, 110, 90, 120, '[]'::jsonb
        from new_run nr
        cross join campaigns c
        where c.organization_id = '10000000-0000-4000-8000-000000000001'
        limit 1
      `),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('rejects an invalid prediction range', async () => {
    await expect(
      pool.query(`
        insert into campaign_predictions
          (organization_id, prediction_run_id, campaign_id,
           forecast_start_date, forecast_end_date, previous_revenue,
           predicted_revenue, lower_bound, upper_bound, drivers)
        select
          pr.organization_id, pr.id, c.id,
          '2026-08-28', '2026-09-03', 100, 80, 90, 120, '[]'::jsonb
        from prediction_runs pr
        inner join campaigns c on c.organization_id = pr.organization_id
        where pr.organization_id = '10000000-0000-4000-8000-000000000001'
          and pr.status = 'completed'
        limit 1
      `),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
