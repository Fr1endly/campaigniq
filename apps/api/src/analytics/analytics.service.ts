import { Injectable, NotFoundException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type {
  CampaignDetailResponse,
  CampaignListQuery,
  CampaignListResponse,
  CampaignMomentum,
  CampaignPerformance,
  DashboardSummary,
  RangePreset,
} from '@campaign-iq/contracts';
import { InjectDatabase, type Database } from '../database/database.module.js';
import {
  createDateRange,
  metricComparisons,
  performanceMetrics,
  type DateRange,
  type Totals,
} from './analytics.helpers.js';

type TotalsRow = Record<
  | 'currentImpressions'
  | 'currentClicks'
  | 'currentConversions'
  | 'currentSpend'
  | 'currentRevenue'
  | 'previousImpressions'
  | 'previousClicks'
  | 'previousConversions'
  | 'previousSpend'
  | 'previousRevenue',
  string
>;

type PerformanceRow = {
  id: string;
  externalId: string;
  name: string;
  channel: string;
  impressions: string;
  clicks: string;
  conversions: string;
  spend: string;
  revenue: string;
  totalCount?: string;
};

type MomentumRow = PerformanceRow & {
  currentRank: string;
  previousRank: string | null;
  previousRevenue: string;
};

@Injectable()
export class AnalyticsService {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async getDashboard(
    organizationId: string,
    preset: RangePreset,
  ): Promise<DashboardSummary> {
    const range = await this.getDateRange(organizationId, preset);
    const [totals, trend, topCampaigns] = await Promise.all([
      this.getTotals(organizationId, range),
      this.getTrend(organizationId, range),
      this.getTopCampaigns(organizationId, range),
    ]);

    return {
      range,
      metrics: metricComparisons(totals.current, totals.previous),
      trend,
      topCampaigns,
    };
  }

  async getCampaigns(
    organizationId: string,
    query: CampaignListQuery,
  ): Promise<CampaignListResponse> {
    const range = await this.getDateRange(organizationId, query.range);
    const sortColumns: Record<CampaignListQuery['sort'], string> = {
      name: 'name',
      channel: 'channel',
      spend: 'spend',
      revenue: 'revenue',
      clicks: 'clicks',
      conversions: 'conversions',
      ctr: 'ctr',
      roas: 'roas',
    };
    const offset = (query.page - 1) * query.pageSize;
    const search = `%${query.search}%`;

    const result = await this.db.execute<PerformanceRow>(sql`
      with performance as (
        select
          c.id,
          c.external_id as "externalId",
          c.name,
          c.channel,
          coalesce(sum(mp.impressions), 0)::bigint as impressions,
          coalesce(sum(mp.clicks), 0)::bigint as clicks,
          coalesce(sum(mp.conversions), 0)::bigint as conversions,
          coalesce(sum(mp.spend), 0)::numeric(14,2) as spend,
          coalesce(sum(mp.revenue), 0)::numeric(14,2) as revenue
        from campaigns c
        left join marketing_performance mp
          on mp.campaign_id = c.id
          and mp.organization_id = c.organization_id
          and mp.date between ${range.startDate}::date and ${range.endDate}::date
        where c.organization_id = ${organizationId}
          and (${query.search} = '' or c.name ilike ${search} or c.external_id ilike ${search})
          and (${query.channel} = '' or c.channel = ${query.channel})
        group by c.id
      ), calculated as (
        select *,
          case when impressions = 0 then null else clicks::numeric / impressions * 100 end as ctr,
          case when spend = 0 then null else revenue / spend end as roas
        from performance
      )
      select *, count(*) over()::text as "totalCount"
      from calculated
      order by ${sql.raw(sortColumns[query.sort])} ${sql.raw(query.order)}, name asc
      limit ${query.pageSize} offset ${offset}
    `);

    const channelsResult = await this.db.execute<{ channel: string }>(sql`
      select distinct channel
      from campaigns
      where organization_id = ${organizationId}
      order by channel
    `);
    const items = result.rows.map((row) => this.mapPerformanceRow(row));
    const totalItems = Number(result.rows[0]?.totalCount ?? 0);

    return {
      range,
      items,
      channels: channelsResult.rows.map((row) => row.channel),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize),
      },
    };
  }

  async getCampaign(
    organizationId: string,
    campaignId: string,
    preset: RangePreset,
  ): Promise<CampaignDetailResponse> {
    const range = await this.getDateRange(organizationId, preset);
    const campaignResult = await this.db.execute<PerformanceRow>(sql`
      select
        c.id,
        c.external_id as "externalId",
        c.name,
        c.channel,
        coalesce(sum(mp.impressions), 0)::bigint as impressions,
        coalesce(sum(mp.clicks), 0)::bigint as clicks,
        coalesce(sum(mp.conversions), 0)::bigint as conversions,
        coalesce(sum(mp.spend), 0)::numeric(14,2) as spend,
        coalesce(sum(mp.revenue), 0)::numeric(14,2) as revenue
      from campaigns c
      left join marketing_performance mp
        on mp.campaign_id = c.id
        and mp.organization_id = c.organization_id
        and mp.date between ${range.startDate}::date and ${range.endDate}::date
      where c.organization_id = ${organizationId} and c.id = ${campaignId}::uuid
      group by c.id
    `);
    const row = campaignResult.rows[0];
    if (!row) throw new NotFoundException('Campaign not found');

    const [totals, trend, daily] = await Promise.all([
      this.getTotals(organizationId, range, campaignId),
      this.getTrend(organizationId, range, campaignId),
      this.getDaily(organizationId, range, campaignId),
    ]);

    return {
      campaign: this.mapPerformanceRow(row),
      range,
      metrics: metricComparisons(totals.current, totals.previous),
      trend,
      daily,
    };
  }

  private async getDateRange(organizationId: string, preset: RangePreset) {
    const result = await this.db.execute<{ dataAsOf: string | null }>(sql`
      select max(date)::text as "dataAsOf"
      from marketing_performance
      where organization_id = ${organizationId}
    `);
    const dataAsOf = result.rows[0]?.dataAsOf;
    if (!dataAsOf)
      throw new NotFoundException('No performance data is available');
    return createDateRange(dataAsOf, preset);
  }

  private async getTotals(
    organizationId: string,
    range: DateRange,
    campaignId?: string,
  ) {
    const result = await this.db.execute<TotalsRow>(sql`
      with aggregate_current as (
        select exists (
          select 1
          from warehouse_refresh_state
          where aggregate_key = 'organization_daily_performance'
            and status = 'current'
            and data_revision = refreshed_revision
        ) as value
      ), source as (
        select date, impressions, clicks, conversions, spend, revenue
        from organization_daily_performance
        where organization_id = ${organizationId}
          and ${campaignId ?? ''} = ''
          and (select value from aggregate_current)
        union all
        select date, impressions, clicks, conversions, spend, revenue
        from marketing_performance
        where organization_id = ${organizationId}
          and (${campaignId ?? ''} = '' or campaign_id = nullif(${campaignId ?? ''}, '')::uuid)
          and (
            ${campaignId ?? ''} <> ''
            or not (select value from aggregate_current)
          )
      )
      select
        coalesce(sum(impressions) filter (where date between ${range.startDate}::date and ${range.endDate}::date), 0)::text as "currentImpressions",
        coalesce(sum(clicks) filter (where date between ${range.startDate}::date and ${range.endDate}::date), 0)::text as "currentClicks",
        coalesce(sum(conversions) filter (where date between ${range.startDate}::date and ${range.endDate}::date), 0)::text as "currentConversions",
        coalesce(sum(spend) filter (where date between ${range.startDate}::date and ${range.endDate}::date), 0)::text as "currentSpend",
        coalesce(sum(revenue) filter (where date between ${range.startDate}::date and ${range.endDate}::date), 0)::text as "currentRevenue",
        coalesce(sum(impressions) filter (where date between ${range.comparisonStartDate}::date and ${range.comparisonEndDate}::date), 0)::text as "previousImpressions",
        coalesce(sum(clicks) filter (where date between ${range.comparisonStartDate}::date and ${range.comparisonEndDate}::date), 0)::text as "previousClicks",
        coalesce(sum(conversions) filter (where date between ${range.comparisonStartDate}::date and ${range.comparisonEndDate}::date), 0)::text as "previousConversions",
        coalesce(sum(spend) filter (where date between ${range.comparisonStartDate}::date and ${range.comparisonEndDate}::date), 0)::text as "previousSpend",
        coalesce(sum(revenue) filter (where date between ${range.comparisonStartDate}::date and ${range.comparisonEndDate}::date), 0)::text as "previousRevenue"
      from source
      where date between ${range.comparisonStartDate}::date and ${range.endDate}::date
    `);
    const row = result.rows[0];
    return {
      current: this.totalsFromRow(row, 'current'),
      previous: this.totalsFromRow(row, 'previous'),
    };
  }

  private async getTrend(
    organizationId: string,
    range: DateRange,
    campaignId?: string,
  ) {
    const result = await this.db.execute<{
      date: string;
      revenue: string;
      spend: string;
      rollingRevenue: string;
      rollingSpend: string;
    }>(sql`
      with days as (
        select generate_series(
          ${range.startDate}::date - interval '6 days',
          ${range.endDate}::date,
          interval '1 day'
        )::date as day
      ), aggregate_current as (
        select exists (
          select 1
          from warehouse_refresh_state
          where aggregate_key = 'organization_daily_performance'
            and status = 'current'
            and data_revision = refreshed_revision
        ) as value
      ), source as (
        select date, spend, revenue
        from organization_daily_performance
        where organization_id = ${organizationId}
          and ${campaignId ?? ''} = ''
          and (select value from aggregate_current)
        union all
        select date, spend, revenue
        from marketing_performance
        where organization_id = ${organizationId}
          and (${campaignId ?? ''} = '' or campaign_id = nullif(${campaignId ?? ''}, '')::uuid)
          and (
            ${campaignId ?? ''} <> ''
            or not (select value from aggregate_current)
          )
      ), daily as (
        select
          days.day,
          coalesce(sum(mp.revenue), 0)::numeric as revenue,
          coalesce(sum(mp.spend), 0)::numeric as spend
        from days
        left join source mp
          on mp.date = days.day
        group by days.day
      ), rolling as (
        select
          day,
          revenue,
          spend,
          avg(revenue) over (
            order by day rows between 6 preceding and current row
          ) as "rollingRevenue",
          avg(spend) over (
            order by day rows between 6 preceding and current row
          ) as "rollingSpend"
        from daily
      )
      select
        day::text as date,
        revenue::numeric(14,2)::text as revenue,
        spend::numeric(14,2)::text as spend,
        "rollingRevenue"::numeric(14,2)::text as "rollingRevenue",
        "rollingSpend"::numeric(14,2)::text as "rollingSpend"
      from rolling
      where day between ${range.startDate}::date and ${range.endDate}::date
      order by day
    `);
    return result.rows;
  }

  private async getDaily(
    organizationId: string,
    range: DateRange,
    campaignId: string,
  ) {
    const result = await this.db.execute<{
      date: string;
      impressions: string;
      clicks: string;
      conversions: string;
      spend: string;
      revenue: string;
    }>(sql`
      with days as (
        select generate_series(${range.startDate}::date, ${range.endDate}::date, interval '1 day')::date as day
      )
      select
        days.day::text as date,
        coalesce(mp.impressions, 0)::text as impressions,
        coalesce(mp.clicks, 0)::text as clicks,
        coalesce(mp.conversions, 0)::text as conversions,
        coalesce(mp.spend, 0)::numeric(14,2)::text as spend,
        coalesce(mp.revenue, 0)::numeric(14,2)::text as revenue
      from days
      left join marketing_performance mp
        on mp.date = days.day
        and mp.organization_id = ${organizationId}
        and mp.campaign_id = ${campaignId}::uuid
      order by days.day desc
    `);

    return result.rows.map((row) => {
      const impressions = Number(row.impressions);
      const clicks = Number(row.clicks);
      const conversions = Number(row.conversions);
      const spend = Number(row.spend);
      const revenue = Number(row.revenue);
      return {
        date: row.date,
        impressions,
        clicks,
        conversions,
        spend: spend.toFixed(2),
        revenue: revenue.toFixed(2),
        ctr: impressions === 0 ? null : (clicks / impressions) * 100,
        roas: spend === 0 ? null : revenue / spend,
      };
    });
  }

  private async getTopCampaigns(organizationId: string, range: DateRange) {
    const result = await this.db.execute<MomentumRow>(sql`
      with performance as (
        select
          c.id,
          c.external_id as "externalId",
          c.name,
          c.channel,
          coalesce(sum(mp.impressions) filter (
            where mp.date between ${range.startDate}::date and ${range.endDate}::date
          ), 0)::bigint as impressions,
          coalesce(sum(mp.clicks) filter (
            where mp.date between ${range.startDate}::date and ${range.endDate}::date
          ), 0)::bigint as clicks,
          coalesce(sum(mp.conversions) filter (
            where mp.date between ${range.startDate}::date and ${range.endDate}::date
          ), 0)::bigint as conversions,
          coalesce(sum(mp.spend) filter (
            where mp.date between ${range.startDate}::date and ${range.endDate}::date
          ), 0)::numeric(14,2) as spend,
          coalesce(sum(mp.revenue) filter (
            where mp.date between ${range.startDate}::date and ${range.endDate}::date
          ), 0)::numeric(14,2) as revenue,
          coalesce(sum(mp.revenue) filter (
            where mp.date between ${range.comparisonStartDate}::date and ${range.comparisonEndDate}::date
          ), 0)::numeric(14,2) as "previousRevenue"
        from campaigns c
        left join marketing_performance mp
          on mp.campaign_id = c.id
          and mp.organization_id = c.organization_id
          and mp.date between ${range.comparisonStartDate}::date and ${range.endDate}::date
        where c.organization_id = ${organizationId}
        group by c.id
      ), ranked as (
        select
          *,
          dense_rank() over (order by revenue desc)::text as "currentRank",
          case
            when "previousRevenue" = 0 then null
            else dense_rank() over (order by "previousRevenue" desc)::text
          end as "previousRank"
        from performance
      )
      select *
      from ranked
      order by revenue desc, name asc
      limit 5
    `);
    return result.rows.map((row) => this.mapMomentumRow(row));
  }

  private totalsFromRow(
    row: TotalsRow,
    prefix: 'current' | 'previous',
  ): Totals {
    const key = (name: string) => `${prefix}${name}` as keyof TotalsRow;
    return {
      impressions: Number(row[key('Impressions')]),
      clicks: Number(row[key('Clicks')]),
      conversions: Number(row[key('Conversions')]),
      spend: Number(row[key('Spend')]),
      revenue: Number(row[key('Revenue')]),
    };
  }

  private mapPerformanceRow(row: PerformanceRow): CampaignPerformance {
    const totals: Totals = {
      impressions: Number(row.impressions),
      clicks: Number(row.clicks),
      conversions: Number(row.conversions),
      spend: Number(row.spend),
      revenue: Number(row.revenue),
    };
    const metrics = performanceMetrics(totals);
    return {
      id: row.id,
      externalId: row.externalId,
      name: row.name,
      channel: row.channel,
      impressions: totals.impressions,
      clicks: totals.clicks,
      conversions: totals.conversions,
      spend: totals.spend.toFixed(2),
      revenue: totals.revenue.toFixed(2),
      ...metrics,
    };
  }

  private mapMomentumRow(row: MomentumRow): CampaignMomentum {
    const performance = this.mapPerformanceRow(row);
    const currentRank = Number(row.currentRank);
    const previousRank =
      row.previousRank === null ? null : Number(row.previousRank);
    const currentRevenue = Number(row.revenue);
    const previousRevenue = Number(row.previousRevenue);
    return {
      ...performance,
      currentRank,
      previousRank,
      rankChange: previousRank === null ? null : previousRank - currentRank,
      revenueChange:
        previousRevenue === 0
          ? null
          : ((currentRevenue - previousRevenue) / previousRevenue) * 100,
    };
  }
}
