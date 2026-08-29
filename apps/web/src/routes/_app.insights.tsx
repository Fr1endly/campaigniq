import { useEffect, useMemo, useState } from 'react'
import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { AlertTriangle, ArrowUpDown, RefreshCw, TrendingUp } from 'lucide-react'
import { z } from 'zod'
import type { CampaignPrediction } from '@campaign-iq/contracts'
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
import { PageError, PageLoading } from '@/components/page-states'
import { PredictionChart } from '@/components/prediction-chart'
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatPercent,
} from '@/lib/formatters'
import { getInsightsFn } from '@/lib/server-functions'

const insightsSearchSchema = z.object({
  sort: z.enum(['forecast', 'change']).default('forecast'),
  order: z.enum(['asc', 'desc']).default('desc'),
})

export const Route = createFileRoute('/_app/insights')({
  validateSearch: (search) => insightsSearchSchema.parse(search),
  loader: () => getInsightsFn(),
  head: () => ({ meta: [{ title: 'Insights | CampaignIQ' }] }),
  pendingComponent: PageLoading,
  errorComponent: ({ error, reset }) => (
    <PageError error={error} reset={reset} />
  ),
  component: InsightsPage,
})

function InsightsPage() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const { session } = Route.useRouteContext()
  const navigate = useNavigate({ from: Route.fullPath })
  const router = useRouter()
  const [generationBusy, setGenerationBusy] = useState(false)
  const [generationError, setGenerationError] = useState('')
  const canGenerate = ['owner', 'admin'].includes(session.organization.role)
  const model = data.model

  useEffect(() => {
    if (data.state !== 'training') return
    const timer = window.setInterval(() => void router.invalidate(), 1_500)
    return () => window.clearInterval(timer)
  }, [data.state, router])

  const predictions = useMemo(() => {
    const direction = search.order === 'asc' ? 1 : -1
    return [...data.predictions].sort((left, right) => {
      const leftValue =
        search.sort === 'forecast'
          ? Number(left.predictedRevenue)
          : (left.change ?? Number.NEGATIVE_INFINITY)
      const rightValue =
        search.sort === 'forecast'
          ? Number(right.predictedRevenue)
          : (right.change ?? Number.NEGATIVE_INFINITY)
      return (leftValue - rightValue) * direction
    })
  }, [data.predictions, search.order, search.sort])

  function changeSort(sort: 'forecast' | 'change') {
    void navigate({
      search: (previous) => ({
        ...previous,
        sort,
        order:
          previous.sort === sort && previous.order === 'desc' ? 'asc' : 'desc',
      }),
    })
  }

  async function generatePredictions() {
    setGenerationBusy(true)
    setGenerationError('')
    try {
      const response = await fetch('/api/predictions', { method: 'POST' })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string
        } | null
        throw new Error(body?.message ?? `Request failed (${response.status})`)
      }
      await router.invalidate()
    } catch (error) {
      setGenerationError(
        error instanceof Error ? error.message : 'Prediction generation failed',
      )
    } finally {
      setGenerationBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] p-4 sm:p-7 lg:p-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">Insights</h1>
            <StateBadge state={data.state} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {model
              ? `${formatDate(model.forecastStartDate, { year: 'numeric' })} – ${formatDate(model.forecastEndDate, { year: 'numeric' })}`
              : 'Seven-day campaign revenue outlook'}
          </p>
        </div>
        {canGenerate && data.state !== 'current' && (
          <Button
            variant="outline"
            onClick={generatePredictions}
            disabled={generationBusy || data.state === 'training'}
          >
            <RefreshCw
              className={
                generationBusy || data.state === 'training'
                  ? 'animate-spin'
                  : undefined
              }
            />
            {data.state === 'training' ? 'Generating' : 'Generate forecast'}
          </Button>
        )}
      </div>

      {generationError && (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {generationError}
        </p>
      )}

      {(data.state === 'stale' || data.latestAttempt?.status === 'failed') && (
        <div className="mt-5 flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            The latest successful forecast is stale.
            {data.latestAttempt?.status === 'failed' &&
            data.latestAttempt.errorMessage
              ? ` The latest generation failed: ${data.latestAttempt.errorMessage}`
              : ' New warehouse data is not included yet.'}
          </p>
        </div>
      )}

      {model?.quality === 'below_baseline' && (
        <div className="mt-5 flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            This model performed worse than the previous-week baseline in the
            holdout period. Treat the forecast as directional evidence only.
          </p>
        </div>
      )}

      {!model || !data.summary ? (
        <EmptyInsights
          state={data.state}
          message={data.latestAttempt?.errorMessage ?? null}
        />
      ) : (
        <>
          <section
            className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            aria-label="Forecast summary"
          >
            <SummaryMetric
              label="Forecast revenue"
              value={formatCurrency(data.summary.predictedRevenue)}
              detail={`${formatCurrency(data.summary.lowerBound)} – ${formatCurrency(data.summary.upperBound)}`}
            />
            <SummaryMetric
              label="Previous 7 days"
              value={formatCurrency(data.summary.previousRevenue)}
              detail={`Through ${formatDate(model.dataAsOf)}`}
            />
            <SummaryMetric
              label="Expected change"
              value={formatPercent(data.summary.change, 1)}
              detail="Versus previous 7 days"
            />
            <SummaryMetric
              label="Backtest WAPE"
              value={formatPercent(model.evaluation.wape, 1)}
              detail={`${formatPercent(model.evaluation.baselineWape, 1)} previous-week baseline`}
            />
          </section>

          <section
            className="mt-6 rounded-lg border bg-card p-4 sm:p-6"
            aria-labelledby="forecast-chart-heading"
          >
            <div>
              <h2
                id="forecast-chart-heading"
                className="text-base font-semibold"
              >
                Campaign revenue outlook
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Highest forecast campaigns compared with their previous seven
                days
              </p>
            </div>
            <div className="mt-4">
              <PredictionChart data={predictions} />
            </div>
          </section>

          <section
            className="mt-6 overflow-hidden rounded-lg border bg-card"
            aria-labelledby="forecast-table-heading"
          >
            <div className="border-b px-4 py-4 sm:px-6">
              <h2
                id="forecast-table-heading"
                className="text-base font-semibold"
              >
                Campaign forecasts
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Estimated ranges and strongest model signals
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-52 pl-4 sm:pl-6">
                    Campaign
                  </TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1"
                      onClick={() => changeSort('forecast')}
                    >
                      Forecast <ArrowUpDown className="size-3.5" />
                    </button>
                  </TableHead>
                  <TableHead>Range</TableHead>
                  <TableHead>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1"
                      onClick={() => changeSort('change')}
                    >
                      Change <ArrowUpDown className="size-3.5" />
                    </button>
                  </TableHead>
                  <TableHead className="min-w-56 pr-4 sm:pr-6">
                    Model signals
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {predictions.map((prediction) => (
                  <PredictionRow
                    key={prediction.campaign.id}
                    prediction={prediction}
                  />
                ))}
              </TableBody>
            </Table>
          </section>

          <section
            className="mt-6 border-t pt-6"
            aria-labelledby="evidence-heading"
          >
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-muted-foreground" />
              <h2 id="evidence-heading" className="text-base font-semibold">
                Model evidence
              </h2>
            </div>
            <div className="mt-4 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Evidence
                label="Holdout MAE"
                value={formatCurrency(model.evaluation.mae)}
                detail={`${formatCurrency(model.evaluation.baselineMae)} baseline`}
              />
              <Evidence
                label={`${model.evaluation.intervalLevel}% range coverage`}
                value={formatPercent(model.evaluation.intervalCoverage, 1)}
                detail="Observed in the holdout period"
              />
              <Evidence
                label="Training window"
                value={`${formatDate(model.trainingStartDate)} – ${formatDate(model.trainingEndDate)}`}
                detail={`${model.trainingRows.toLocaleString()} campaign-day samples`}
              />
              <Evidence
                label="Generated"
                value={formatDateTime(model.trainedAt)}
                detail={`${model.eligibleCampaigns} campaigns included${model.excludedCampaigns ? `, ${model.excludedCampaigns} excluded` : ''}`}
              />
            </div>
            <p className="mt-5 max-w-4xl text-xs leading-5 text-muted-foreground">
              Forecasts are associations based on recent campaign history.
              Ranges reflect historical holdout errors, not guarantees, and
              model signals are not causal recommendations.
            </p>
          </section>
        </>
      )}
    </div>
  )
}

function StateBadge({
  state,
}: {
  state: 'current' | 'stale' | 'training' | 'unavailable'
}) {
  const variant =
    state === 'current'
      ? 'secondary'
      : state === 'unavailable'
        ? 'outline'
        : 'destructive'
  return (
    <Badge variant={variant}>
      {state === 'current'
        ? 'Current'
        : state === 'training'
          ? 'Generating'
          : state === 'stale'
            ? 'Stale'
            : 'Unavailable'}
    </Badge>
  )
}

function SummaryMetric({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function PredictionRow({ prediction }: { prediction: CampaignPrediction }) {
  return (
    <TableRow>
      <TableCell className="pl-4 sm:pl-6">
        <Link
          to="/campaigns/$campaignId"
          params={{ campaignId: prediction.campaign.id }}
          search={{ range: '30d' }}
          className="font-medium hover:underline"
        >
          {prediction.campaign.name}
        </Link>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {prediction.campaign.externalId}
        </span>
      </TableCell>
      <TableCell>{prediction.campaign.channel}</TableCell>
      <TableCell className="font-medium tabular-nums">
        {formatCurrency(prediction.predictedRevenue)}
      </TableCell>
      <TableCell className="tabular-nums text-muted-foreground">
        {formatCurrency(prediction.lowerBound)} –{' '}
        {formatCurrency(prediction.upperBound)}
      </TableCell>
      <TableCell className="tabular-nums">
        {formatPercent(prediction.change, 1)}
      </TableCell>
      <TableCell className="pr-4 sm:pr-6">
        <div className="space-y-1">
          {prediction.drivers.map((driver) => (
            <span
              key={driver.feature}
              className="block text-xs text-muted-foreground"
            >
              {driver.label}{' '}
              <span
                className={
                  driver.direction === 'positive'
                    ? 'text-emerald-700'
                    : 'text-destructive'
                }
              >
                {Number(driver.contribution) >= 0 ? '+' : ''}
                {formatCurrency(driver.contribution)}
              </span>
            </span>
          ))}
        </div>
      </TableCell>
    </TableRow>
  )
}

function Evidence({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function EmptyInsights({
  state,
  message,
}: {
  state: string
  message: string | null
}) {
  return (
    <section
      className="mt-6 rounded-lg border bg-card px-6 py-14 text-center"
      aria-label="Prediction status"
    >
      <TrendingUp className="mx-auto size-6 text-muted-foreground" />
      <h2 className="mt-3 text-base font-semibold">
        {state === 'training' ? 'Generating forecast' : 'No forecast available'}
      </h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
        {message ??
          'CampaignIQ needs at least 90 days of organization history and 56 observed campaign days before it can evaluate a forecast.'}
      </p>
    </section>
  )
}
