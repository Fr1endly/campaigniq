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
});
