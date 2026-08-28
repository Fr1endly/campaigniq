import { z } from 'zod';

export const rangePresetSchema = z.enum(['7d', '30d', '90d']);
export type RangePreset = z.infer<typeof rangePresetSchema>;

export const dashboardQuerySchema = z.object({
  range: rangePresetSchema.default('30d'),
});

export const metricSchema = z.object({
  value: z.union([z.number(), z.string(), z.null()]),
  previousValue: z.union([z.number(), z.string(), z.null()]),
  change: z.number().nullable(),
  changeType: z.enum(['percent', 'percentagePoint']),
});

export const trendPointSchema = z.object({
  date: z.string(),
  revenue: z.string(),
  spend: z.string(),
});

export const campaignPerformanceSchema = z.object({
  id: z.string().uuid(),
  externalId: z.string(),
  name: z.string(),
  channel: z.string(),
  impressions: z.number(),
  clicks: z.number(),
  conversions: z.number(),
  spend: z.string(),
  revenue: z.string(),
  ctr: z.number().nullable(),
  conversionRate: z.number().nullable(),
  cpc: z.number().nullable(),
  cpa: z.number().nullable(),
  roas: z.number().nullable(),
});

export const dashboardSummarySchema = z.object({
  range: z.object({
    preset: rangePresetSchema,
    startDate: z.string(),
    endDate: z.string(),
    comparisonStartDate: z.string(),
    comparisonEndDate: z.string(),
    dataAsOf: z.string(),
  }),
  metrics: z.object({
    revenue: metricSchema,
    spend: metricSchema,
    clicks: metricSchema,
    conversions: metricSchema,
    ctr: metricSchema,
    roas: metricSchema,
  }),
  trend: z.array(trendPointSchema),
  topCampaigns: z.array(campaignPerformanceSchema),
});

export const campaignSortSchema = z.enum([
  'name',
  'channel',
  'spend',
  'revenue',
  'clicks',
  'conversions',
  'ctr',
  'roas',
]);

export const campaignListQuerySchema = z.object({
  range: rangePresetSchema.default('30d'),
  search: z.string().trim().max(100).default(''),
  channel: z.string().trim().max(50).default(''),
  sort: campaignSortSchema.default('revenue'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

export const campaignListResponseSchema = z.object({
  range: dashboardSummarySchema.shape.range,
  items: z.array(campaignPerformanceSchema),
  pagination: z.object({
    page: z.number(),
    pageSize: z.number(),
    totalItems: z.number(),
    totalPages: z.number(),
  }),
  channels: z.array(z.string()),
});

export const campaignDetailResponseSchema = z.object({
  campaign: campaignPerformanceSchema,
  range: dashboardSummarySchema.shape.range,
  metrics: dashboardSummarySchema.shape.metrics,
  trend: z.array(trendPointSchema),
  daily: z.array(
    trendPointSchema.extend({
      impressions: z.number(),
      clicks: z.number(),
      conversions: z.number(),
      ctr: z.number().nullable(),
      roas: z.number().nullable(),
    }),
  ),
});

export const sessionResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
  }),
  organization: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    role: z.string(),
  }),
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
export type CampaignPerformance = z.infer<typeof campaignPerformanceSchema>;
export type CampaignListQuery = z.infer<typeof campaignListQuerySchema>;
export type CampaignListResponse = z.infer<typeof campaignListResponseSchema>;
export type CampaignDetailResponse = z.infer<typeof campaignDetailResponseSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
