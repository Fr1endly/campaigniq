import { describe, expect, it } from 'vitest';
import {
  createDateRange,
  metricComparisons,
  performanceMetrics,
  safeRatio,
  type Totals,
} from './analytics.helpers.js';

describe('analytics helpers', () => {
  it('builds inclusive current and preceding date windows', () => {
    expect(createDateRange('2026-08-27', '30d')).toEqual({
      preset: '30d',
      dataAsOf: '2026-08-27',
      startDate: '2026-07-29',
      endDate: '2026-08-27',
      comparisonStartDate: '2026-06-29',
      comparisonEndDate: '2026-07-28',
    });
  });

  it('calculates weighted aggregate performance metrics', () => {
    expect(
      performanceMetrics({
        impressions: 10_000,
        clicks: 400,
        conversions: 40,
        spend: 800,
        revenue: 3_200,
      }),
    ).toEqual({
      ctr: 4,
      conversionRate: 10,
      cpc: 2,
      cpa: 20,
      roas: 4,
    });
  });

  it('returns null when a metric denominator is zero', () => {
    expect(safeRatio(12, 0)).toBeNull();
    expect(
      performanceMetrics({ impressions: 0, clicks: 0, conversions: 0, spend: 0, revenue: 0 }),
    ).toEqual({ ctr: null, conversionRate: null, cpc: null, cpa: null, roas: null });
  });

  it('uses percentage points for CTR and percentage change for totals', () => {
    const current: Totals = {
      impressions: 1_000,
      clicks: 50,
      conversions: 10,
      spend: 100,
      revenue: 400,
    };
    const previous: Totals = {
      impressions: 1_000,
      clicks: 40,
      conversions: 8,
      spend: 100,
      revenue: 200,
    };
    const metrics = metricComparisons(current, previous);
    expect(metrics.revenue.change).toBe(100);
    expect(metrics.ctr.change).toBe(1);
    expect(metrics.ctr.changeType).toBe('percentagePoint');
  });
});
