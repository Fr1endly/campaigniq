import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type {
  InsightsResponse,
  PredictionDriver,
} from '@campaign-iq/contracts';
import { InjectDatabase, type Database } from '../database/database.module.js';

type AttemptRow = {
  id: string;
  status: 'running' | 'completed' | 'insufficient_data' | 'failed';
  startedAt: Date | string;
  completedAt: Date | string | null;
  errorMessage: string | null;
};

type ModelRow = {
  id: string;
  target: 'campaign_revenue_7d';
  algorithm: 'ridge_regression';
  version: string;
  dataAsOf: string;
  trainingStartDate: string;
  trainingEndDate: string;
  forecastStartDate: string;
  forecastEndDate: string;
  trainingRows: number;
  eligibleCampaigns: number;
  excludedCampaigns: number;
  sourceImportId: string | null;
  latestImportId: string | null;
  quality: 'beats_baseline' | 'below_baseline';
  mae: string;
  wape: string;
  baselineMae: string;
  baselineWape: string;
  intervalLevel: number;
  intervalCoverage: string;
  trainedAt: Date | string;
};

type PredictionRow = {
  id: string;
  externalId: string;
  name: string;
  channel: string;
  previousRevenue: string;
  predictedRevenue: string;
  lowerBound: string;
  upperBound: string;
  drivers: PredictionDriver[];
};

type SummaryRow = {
  previousRevenue: string;
  predictedRevenue: string;
  lowerBound: string;
  upperBound: string;
};

@Injectable()
export class InsightsService {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async getInsights(organizationId: string): Promise<InsightsResponse> {
    const [attemptResult, modelResult] = await Promise.all([
      this.db.execute<AttemptRow>(sql`
        select
          id,
          status,
          started_at as "startedAt",
          completed_at as "completedAt",
          error_message as "errorMessage"
        from prediction_runs
        where organization_id = ${organizationId}
          and target = 'campaign_revenue_7d'
        order by started_at desc, id desc
        limit 1
      `),
      this.db.execute<ModelRow>(sql`
        select
          pr.id,
          pr.target,
          pr.algorithm,
          pr.model_version as version,
          pr.data_as_of as "dataAsOf",
          pr.training_start_date as "trainingStartDate",
          pr.training_end_date as "trainingEndDate",
          pr.forecast_start_date as "forecastStartDate",
          pr.forecast_end_date as "forecastEndDate",
          pr.training_rows as "trainingRows",
          pr.eligible_campaigns as "eligibleCampaigns",
          pr.excluded_campaigns as "excludedCampaigns",
          pr.source_import_run_id as "sourceImportId",
          (
            select ir.id
            from import_runs ir
            where ir.organization_id = pr.organization_id
              and ir.status = 'completed'
            order by ir.completed_at desc, ir.id desc
            limit 1
          ) as "latestImportId",
          pr.quality,
          pr.mae::text as mae,
          pr.wape::text as wape,
          pr.baseline_mae::text as "baselineMae",
          pr.baseline_wape::text as "baselineWape",
          pr.interval_level as "intervalLevel",
          pr.interval_coverage::text as "intervalCoverage",
          pr.completed_at as "trainedAt"
        from prediction_runs pr
        where pr.organization_id = ${organizationId}
          and pr.target = 'campaign_revenue_7d'
          and pr.status = 'completed'
        order by pr.completed_at desc, pr.id desc
        limit 1
      `),
    ]);

    const latestAttempt = attemptResult.rows[0];
    const modelRow = modelResult.rows[0];
    if (!modelRow) {
      return {
        state: latestAttempt?.status === 'running' ? 'training' : 'unavailable',
        latestAttempt: latestAttempt ? mapAttempt(latestAttempt) : null,
        model: null,
        summary: null,
        predictions: [],
      };
    }

    const [predictionResult, summaryResult] = await Promise.all([
      this.db.execute<PredictionRow>(sql`
        select
          c.id,
          c.external_id as "externalId",
          c.name,
          c.channel,
          cp.previous_revenue::text as "previousRevenue",
          cp.predicted_revenue::text as "predictedRevenue",
          cp.lower_bound::text as "lowerBound",
          cp.upper_bound::text as "upperBound",
          cp.drivers
        from campaign_predictions cp
        inner join campaigns c
          on c.id = cp.campaign_id
          and c.organization_id = cp.organization_id
        where cp.organization_id = ${organizationId}
          and cp.prediction_run_id = ${modelRow.id}
        order by cp.predicted_revenue desc, c.name
      `),
      this.db.execute<SummaryRow>(sql`
        select
          coalesce(sum(previous_revenue), 0)::numeric(18,2)::text as "previousRevenue",
          coalesce(sum(predicted_revenue), 0)::numeric(18,2)::text as "predictedRevenue",
          coalesce(sum(lower_bound), 0)::numeric(18,2)::text as "lowerBound",
          coalesce(sum(upper_bound), 0)::numeric(18,2)::text as "upperBound"
        from campaign_predictions
        where organization_id = ${organizationId}
          and prediction_run_id = ${modelRow.id}
      `),
    ]);
    const summary = summaryResult.rows[0];
    const state =
      latestAttempt?.status === 'running'
        ? 'training'
        : modelRow.sourceImportId === modelRow.latestImportId
          ? 'current'
          : 'stale';

    return {
      state,
      latestAttempt: latestAttempt ? mapAttempt(latestAttempt) : null,
      model: {
        id: modelRow.id,
        target: modelRow.target,
        algorithm: modelRow.algorithm,
        version: modelRow.version,
        dataAsOf: modelRow.dataAsOf,
        trainingStartDate: modelRow.trainingStartDate,
        trainingEndDate: modelRow.trainingEndDate,
        forecastStartDate: modelRow.forecastStartDate,
        forecastEndDate: modelRow.forecastEndDate,
        trainingRows: modelRow.trainingRows,
        eligibleCampaigns: modelRow.eligibleCampaigns,
        excludedCampaigns: modelRow.excludedCampaigns,
        quality: modelRow.quality,
        evaluation: {
          mae: modelRow.mae,
          wape: Number(modelRow.wape),
          baselineMae: modelRow.baselineMae,
          baselineWape: Number(modelRow.baselineWape),
          intervalLevel: modelRow.intervalLevel,
          intervalCoverage: Number(modelRow.intervalCoverage),
        },
        trainedAt: toIso(modelRow.trainedAt),
      },
      summary: {
        ...summary,
        change: percentageChange(
          summary.predictedRevenue,
          summary.previousRevenue,
        ),
      },
      predictions: predictionResult.rows.map((row) => ({
        campaign: {
          id: row.id,
          externalId: row.externalId,
          name: row.name,
          channel: row.channel,
        },
        previousRevenue: row.previousRevenue,
        predictedRevenue: row.predictedRevenue,
        lowerBound: row.lowerBound,
        upperBound: row.upperBound,
        change: percentageChange(row.predictedRevenue, row.previousRevenue),
        drivers: row.drivers,
      })),
    };
  }
}

function mapAttempt(row: AttemptRow) {
  return {
    id: row.id,
    status: row.status,
    startedAt: toIso(row.startedAt),
    completedAt: row.completedAt === null ? null : toIso(row.completedAt),
    errorMessage: row.errorMessage,
  };
}

function toIso(value: Date | string) {
  return new Date(value).toISOString();
}

function percentageChange(current: string, previous: string) {
  const previousValue = Number(previous);
  if (previousValue === 0) return null;
  return ((Number(current) - previousValue) / previousValue) * 100;
}
