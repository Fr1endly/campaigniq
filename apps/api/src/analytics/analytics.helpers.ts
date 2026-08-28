import type { RangePreset } from '@campaign-iq/contracts';

export interface Totals {
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  revenue: number;
}

export interface DateRange {
  preset: RangePreset;
  startDate: string;
  endDate: string;
  comparisonStartDate: string;
  comparisonEndDate: string;
  dataAsOf: string;
}

const RANGE_DAYS: Record<RangePreset, number> = { '7d': 7, '30d': 30, '90d': 90 };

function shiftDate(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function createDateRange(dataAsOf: string, preset: RangePreset): DateRange {
  const days = RANGE_DAYS[preset];
  return {
    preset,
    dataAsOf,
    endDate: dataAsOf,
    startDate: shiftDate(dataAsOf, -(days - 1)),
    comparisonEndDate: shiftDate(dataAsOf, -days),
    comparisonStartDate: shiftDate(dataAsOf, -(days * 2 - 1)),
  };
}

export function safeRatio(numerator: number, denominator: number, scale = 1) {
  return denominator === 0 ? null : (numerator / denominator) * scale;
}

export function percentChange(current: number, previous: number) {
  return previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100;
}

export function performanceMetrics(totals: Totals) {
  return {
    ctr: safeRatio(totals.clicks, totals.impressions, 100),
    conversionRate: safeRatio(totals.conversions, totals.clicks, 100),
    cpc: safeRatio(totals.spend, totals.clicks),
    cpa: safeRatio(totals.spend, totals.conversions),
    roas: safeRatio(totals.revenue, totals.spend),
  };
}

export function metricComparisons(current: Totals, previous: Totals) {
  const currentRates = performanceMetrics(current);
  const previousRates = performanceMetrics(previous);

  return {
    revenue: {
      value: current.revenue.toFixed(2),
      previousValue: previous.revenue.toFixed(2),
      change: percentChange(current.revenue, previous.revenue),
      changeType: 'percent' as const,
    },
    spend: {
      value: current.spend.toFixed(2),
      previousValue: previous.spend.toFixed(2),
      change: percentChange(current.spend, previous.spend),
      changeType: 'percent' as const,
    },
    clicks: {
      value: current.clicks,
      previousValue: previous.clicks,
      change: percentChange(current.clicks, previous.clicks),
      changeType: 'percent' as const,
    },
    conversions: {
      value: current.conversions,
      previousValue: previous.conversions,
      change: percentChange(current.conversions, previous.conversions),
      changeType: 'percent' as const,
    },
    ctr: {
      value: currentRates.ctr,
      previousValue: previousRates.ctr,
      change:
        currentRates.ctr === null || previousRates.ctr === null
          ? null
          : currentRates.ctr - previousRates.ctr,
      changeType: 'percentagePoint' as const,
    },
    roas: {
      value: currentRates.roas,
      previousValue: previousRates.roas,
      change:
        currentRates.roas === null || previousRates.roas === null
          ? null
          : percentChange(currentRates.roas, previousRates.roas),
      changeType: 'percent' as const,
    },
  };
}
