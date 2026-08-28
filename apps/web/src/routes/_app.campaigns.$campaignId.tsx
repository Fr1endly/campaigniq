import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, CalendarDays } from 'lucide-react'
import { dashboardQuerySchema } from '@campaign-iq/contracts'
import { MetricGrid } from '@/components/metric-grid'
import { PageError, PageLoading } from '@/components/page-states'
import { PerformanceChart } from '@/components/performance-chart'
import { RangeSelector } from '@/components/range-selector'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  formatRatio,
} from '@/lib/formatters'
import { getCampaignDetailFn } from '@/lib/server-functions'

export const Route = createFileRoute('/_app/campaigns/$campaignId')({
  validateSearch: (search) => dashboardQuerySchema.parse(search),
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: ({ params, deps }) =>
    getCampaignDetailFn({ data: { id: params.campaignId, range: deps.range } }),
  pendingComponent: PageLoading,
  errorComponent: ({ error, reset }) => (
    <PageError error={error} reset={reset} />
  ),
  component: CampaignDetailPage,
})

function CampaignDetailPage() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  return (
    <div className="mx-auto w-full max-w-[1440px] p-4 sm:p-7 lg:p-8">
      <Button variant="ghost" size="sm" className="-ml-2 mb-4" asChild>
        <Link
          to="/campaigns"
          search={{
            range: search.range,
            search: '',
            channel: '',
            sort: 'revenue',
            order: 'desc',
            page: 1,
            pageSize: 10,
          }}
        >
          <ArrowLeft />
          Campaigns
        </Link>
      </Button>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold">
              {data.campaign.name}
            </h1>
            <Badge variant="outline" className="rounded-md">
              {data.campaign.channel}
            </Badge>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="size-3.5" />
            {data.campaign.externalId} · {formatDate(data.range.startDate)} –{' '}
            {formatDate(data.range.endDate, { year: 'numeric' })}
          </p>
        </div>
        <RangeSelector
          value={search.range}
          onChange={(range) => navigate({ search: { range } })}
        />
      </div>

      <div className="mt-6">
        <MetricGrid metrics={data.metrics} />
      </div>

      <section className="mt-6 rounded-lg border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Campaign trend</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Daily revenue and media spend
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-chart-1" />
              Revenue
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-chart-2" />
              Spend
            </span>
          </div>
        </div>
        <div className="mt-4">
          <PerformanceChart data={data.trend} />
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-lg border bg-card">
        <div className="border-b px-4 py-4 sm:px-6">
          <h2 className="text-base font-semibold">Daily performance</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Warehouse totals by reporting date
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Impressions</TableHead>
              <TableHead className="text-right">Clicks</TableHead>
              <TableHead className="text-right">Conversions</TableHead>
              <TableHead className="text-right">Spend</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">CTR</TableHead>
              <TableHead className="text-right">ROAS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.daily.map((day) => (
              <TableRow key={day.date}>
                <TableCell className="font-medium">
                  {formatDate(day.date, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(day.impressions)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(day.clicks)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(day.conversions)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(day.spend)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatCurrency(day.revenue)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPercent(day.ctr)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatRatio(day.roas)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  )
}
