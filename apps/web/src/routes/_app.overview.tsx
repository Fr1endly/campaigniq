import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { CalendarDays } from 'lucide-react'
import { dashboardQuerySchema } from '@campaign-iq/contracts'
import { z } from 'zod'
import { CampaignMomentumTable } from '@/components/campaign-momentum-table'
import { MetricGrid } from '@/components/metric-grid'
import { PageError, PageLoading } from '@/components/page-states'
import { PerformanceChart } from '@/components/performance-chart'
import { RangeSelector } from '@/components/range-selector'
import { getDashboardFn } from '@/lib/server-functions'
import { formatDate } from '@/lib/formatters'

const overviewSearchSchema = dashboardQuerySchema.extend({
  trend: z.enum(['daily', 'rolling7']).default('daily'),
})

export const Route = createFileRoute('/_app/overview')({
  validateSearch: (search) => overviewSearchSchema.parse(search),
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: ({ deps }) => getDashboardFn({ data: deps }),
  head: () => ({ meta: [{ title: 'Overview | CampaignIQ' }] }),
  pendingComponent: PageLoading,
  errorComponent: ({ error, reset }) => (
    <PageError error={error} reset={reset} />
  ),
  component: OverviewPage,
})

function OverviewPage() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  return (
    <div className="mx-auto w-full max-w-[1440px] p-4 sm:p-7 lg:p-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold">Overview</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="size-3.5" />
            {formatDate(data.range.startDate, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}{' '}
            –{' '}
            {formatDate(data.range.endDate, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        </div>
        <RangeSelector
          value={search.range}
          onChange={(range) =>
            navigate({ search: (previous) => ({ ...previous, range }) })
          }
        />
      </div>

      <div className="mt-6">
        <MetricGrid metrics={data.metrics} />
      </div>

      <section
        className="mt-6 rounded-lg border bg-card p-4 sm:p-6"
        aria-labelledby="performance-heading"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="performance-heading" className="text-base font-semibold">
              Performance trend
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Daily revenue and media spend
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-4">
            <div
              className="inline-flex h-8 items-center rounded-md border bg-card p-0.5"
              role="radiogroup"
              aria-label="Trend calculation"
            >
              {(
                [
                  ['daily', 'Daily'],
                  ['rolling7', '7-day avg'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={search.trend === value}
                  onClick={() =>
                    navigate({
                      search: (previous) => ({ ...previous, trend: value }),
                    })
                  }
                  className={`h-6 rounded px-2.5 text-xs font-medium transition-colors ${
                    search.trend === value
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
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
        </div>
        <div className="mt-4">
          <PerformanceChart data={data.trend} mode={search.trend} />
        </div>
      </section>

      <section
        className="mt-6 overflow-hidden rounded-lg border bg-card"
        aria-labelledby="top-campaigns-heading"
      >
        <div className="flex items-center justify-between border-b px-4 py-4 sm:px-6">
          <div>
            <h2 id="top-campaigns-heading" className="text-base font-semibold">
              Campaign momentum
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Revenue rank and movement versus the preceding period
            </p>
          </div>
        </div>
        <CampaignMomentumTable
          campaigns={data.topCampaigns}
          range={search.range}
        />
      </section>
    </div>
  )
}
