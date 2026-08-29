import { z } from "zod";

export const rangePresetSchema = z.enum(["7d", "30d", "90d"]);
export type RangePreset = z.infer<typeof rangePresetSchema>;

export const dashboardQuerySchema = z.object({
  range: rangePresetSchema.default("30d"),
});

export const metricSchema = z.object({
  value: z.union([z.number(), z.string(), z.null()]),
  previousValue: z.union([z.number(), z.string(), z.null()]),
  change: z.number().nullable(),
  changeType: z.enum(["percent", "percentagePoint"]),
});

export const trendPointSchema = z.object({
  date: z.string(),
  revenue: z.string(),
  spend: z.string(),
  rollingRevenue: z.string(),
  rollingSpend: z.string(),
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

export const campaignMomentumSchema = campaignPerformanceSchema.extend({
  currentRank: z.number().int().positive(),
  previousRank: z.number().int().positive().nullable(),
  rankChange: z.number().int().nullable(),
  revenueChange: z.number().nullable(),
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
  topCampaigns: z.array(campaignMomentumSchema),
});

export const campaignSortSchema = z.enum([
  "name",
  "channel",
  "spend",
  "revenue",
  "clicks",
  "conversions",
  "ctr",
  "roas",
]);

export const campaignListQuerySchema = z.object({
  range: rangePresetSchema.default("30d"),
  search: z.string().trim().max(100).default(""),
  channel: z.string().trim().max(50).default(""),
  sort: campaignSortSchema.default("revenue"),
  order: z.enum(["asc", "desc"]).default("desc"),
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
    z.object({
      date: z.string(),
      revenue: z.string(),
      spend: z.string(),
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

export const importStatusSchema = z.enum([
  "received",
  "uploading",
  "processing",
  "completed",
  "failed",
]);

export const importRunSchema = z.object({
  id: z.string().uuid(),
  filename: z.string(),
  status: importStatusSchema,
  receivedRows: z.number().int().nonnegative(),
  loadedRows: z.number().int().nonnegative(),
  rejectedRows: z.number().int().nonnegative(),
  insertedRows: z.number().int().nonnegative().nullable(),
  updatedRows: z.number().int().nonnegative().nullable(),
  unchangedRows: z.number().int().nonnegative().nullable(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const createImportRequestSchema = z.object({
  filename: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine((value) => !/[\\/]/.test(value), "Filename must not contain a path")
    .refine(
      (value) => value.toLowerCase().endsWith(".csv"),
      "A CSV file is required",
    ),
  contentType: z
    .enum(["text/csv", "application/csv", "application/vnd.ms-excel"])
    .default("text/csv"),
  size: z
    .number()
    .int()
    .positive()
    .max(50 * 1024 * 1024),
});

export const createImportResponseSchema = z.object({
  import: importRunSchema,
  upload: z.object({
    url: z.url(),
    method: z.literal("PUT"),
    headers: z.record(z.string(), z.string()),
    expiresAt: z.string().datetime(),
  }),
});

export const importListQuerySchema = z.object({
  status: z.union([importStatusSchema, z.literal("")]).default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const importListResponseSchema = z.object({
  items: z.array(importRunSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});

export const dataQualityIssueSchema = z.object({
  id: z.string().uuid(),
  importRunId: z.string().uuid(),
  issueType: z.string(),
  field: z.string().nullable(),
  count: z.number().int().positive(),
  createdAt: z.string().datetime(),
});

export const importIssuesResponseSchema = z.object({
  import: importRunSchema,
  issues: z.array(dataQualityIssueSchema),
  summary: z.object({
    validPercentage: z.number().min(0).max(100).nullable(),
    totalIssues: z.number().int().nonnegative(),
  }),
});

export const warehouseStatusSchema = z.object({
  dataAsOf: z.string().nullable(),
  campaignCount: z.number().int().nonnegative(),
  factCount: z.number().int().nonnegative(),
  latestCompletedImportAt: z.string().datetime().nullable(),
  trailing30Days: z.object({
    completedRuns: z.number().int().nonnegative(),
    failedRuns: z.number().int().nonnegative(),
    successRate: z.number().min(0).max(100).nullable(),
    validRate: z.number().min(0).max(100).nullable(),
    loadedRows: z.number().int().nonnegative(),
    rejectedRows: z.number().int().nonnegative(),
    averageDurationMs: z.number().int().nonnegative().nullable(),
    rowsPerSecond: z.number().nonnegative().nullable(),
  }),
  reporting: z.discriminatedUnion("strategy", [
    z.object({
      strategy: z.literal("live"),
      status: z.literal("current"),
      dataRevision: z.number().int().nonnegative(),
      refreshedRevision: z.number().int().nonnegative(),
      refreshedAt: z.null(),
      errorMessage: z.null(),
    }),
    z.object({
      strategy: z.literal("materialized"),
      status: z.enum(["current", "stale", "refreshing", "failed"]),
      dataRevision: z.number().int().nonnegative(),
      refreshedRevision: z.number().int().nonnegative(),
      refreshedAt: z.string().datetime().nullable(),
      errorMessage: z.string().nullable(),
    }),
  ]),
});

export const predictionDriverSchema = z.object({
  feature: z.string(),
  label: z.string(),
  direction: z.enum(["positive", "negative"]),
  contribution: z.string(),
});

export const predictionAttemptSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["running", "completed", "insufficient_data", "failed"]),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  errorMessage: z.string().nullable(),
});

export const predictionModelSchema = z.object({
  id: z.string().uuid(),
  target: z.literal("campaign_revenue_7d"),
  algorithm: z.literal("ridge_regression"),
  version: z.string(),
  dataAsOf: z.string(),
  trainingStartDate: z.string(),
  trainingEndDate: z.string(),
  forecastStartDate: z.string(),
  forecastEndDate: z.string(),
  trainingRows: z.number().int().nonnegative(),
  eligibleCampaigns: z.number().int().nonnegative(),
  excludedCampaigns: z.number().int().nonnegative(),
  quality: z.enum(["beats_baseline", "below_baseline"]),
  evaluation: z.object({
    mae: z.string(),
    wape: z.number().nonnegative(),
    baselineMae: z.string(),
    baselineWape: z.number().nonnegative(),
    intervalLevel: z.number().int().min(1).max(99),
    intervalCoverage: z.number().min(0).max(100),
  }),
  trainedAt: z.string().datetime(),
});

export const campaignPredictionSchema = z.object({
  campaign: z.object({
    id: z.string().uuid(),
    externalId: z.string(),
    name: z.string(),
    channel: z.string(),
  }),
  previousRevenue: z.string(),
  predictedRevenue: z.string(),
  lowerBound: z.string(),
  upperBound: z.string(),
  change: z.number().nullable(),
  drivers: z.array(predictionDriverSchema),
});

export const insightsResponseSchema = z.object({
  state: z.enum(["current", "stale", "training", "unavailable"]),
  latestAttempt: predictionAttemptSchema.nullable(),
  model: predictionModelSchema.nullable(),
  summary: z
    .object({
      previousRevenue: z.string(),
      predictedRevenue: z.string(),
      lowerBound: z.string(),
      upperBound: z.string(),
      change: z.number().nullable(),
    })
    .nullable(),
  predictions: z.array(campaignPredictionSchema),
});

export const predictionGenerationResponseSchema = z.object({
  status: z.literal("accepted"),
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
export type CampaignPerformance = z.infer<typeof campaignPerformanceSchema>;
export type CampaignMomentum = z.infer<typeof campaignMomentumSchema>;
export type CampaignListQuery = z.infer<typeof campaignListQuerySchema>;
export type CampaignListResponse = z.infer<typeof campaignListResponseSchema>;
export type CampaignDetailResponse = z.infer<
  typeof campaignDetailResponseSchema
>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type ImportStatus = z.infer<typeof importStatusSchema>;
export type ImportRun = z.infer<typeof importRunSchema>;
export type CreateImportRequest = z.infer<typeof createImportRequestSchema>;
export type CreateImportResponse = z.infer<typeof createImportResponseSchema>;
export type ImportListQuery = z.infer<typeof importListQuerySchema>;
export type ImportListResponse = z.infer<typeof importListResponseSchema>;
export type DataQualityIssue = z.infer<typeof dataQualityIssueSchema>;
export type ImportIssuesResponse = z.infer<typeof importIssuesResponseSchema>;
export type WarehouseStatus = z.infer<typeof warehouseStatusSchema>;
export type PredictionDriver = z.infer<typeof predictionDriverSchema>;
export type PredictionAttempt = z.infer<typeof predictionAttemptSchema>;
export type PredictionModel = z.infer<typeof predictionModelSchema>;
export type CampaignPrediction = z.infer<typeof campaignPredictionSchema>;
export type InsightsResponse = z.infer<typeof insightsResponseSchema>;
export type PredictionGenerationResponse = z.infer<
  typeof predictionGenerationResponseSchema
>;
