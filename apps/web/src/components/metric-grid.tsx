import type { DashboardSummary } from '@campaign-iq/contracts'
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  Banknote,
  CircleDollarSign,
  MousePointerClick,
  Percent,
  Target,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatRatio,
} from '@/lib/formatters'

type MetricName = keyof DashboardSummary['metrics']

const metricConfig: Record<
  MetricName,
  {
    label: string
    icon: typeof Banknote
    format: (value: string | number | null) => string
  }
> = {
  revenue: {
    label: 'Revenue',
    icon: CircleDollarSign,
    format: (value) => formatCurrency(value ?? 0, true),
  },
  spend: {
    label: 'Ad spend',
    icon: BadgeDollarSign,
    format: (value) => formatCurrency(value ?? 0, true),
  },
  clicks: {
    label: 'Clicks',
    icon: MousePointerClick,
    format: (value) => formatNumber(Number(value ?? 0), true),
  },
  conversions: {
    label: 'Conversions',
    icon: Target,
    format: (value) => formatNumber(Number(value ?? 0), true),
  },
  ctr: {
    label: 'CTR',
    icon: Percent,
    format: (value) => formatPercent(value === null ? null : Number(value)),
  },
  roas: {
    label: 'ROAS',
    icon: Banknote,
    format: (value) => formatRatio(value === null ? null : Number(value)),
  },
}

export function MetricGrid({
  metrics,
}: {
  metrics: DashboardSummary['metrics']
}) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border lg:grid-cols-3 xl:grid-cols-6">
      {(Object.keys(metricConfig) as MetricName[]).map((name) => {
        const config = metricConfig[name]
        const metric = metrics[name]
        const Icon = config.icon
        const positive = (metric.change ?? 0) >= 0
        const ChangeIcon = positive ? ArrowUpRight : ArrowDownRight
        return (
          <div key={name} className="min-h-32 bg-card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-muted-foreground">
                {config.label}
              </span>
              <Icon
                className="size-4 text-muted-foreground"
                strokeWidth={1.8}
              />
            </div>
            <div className="mt-4 text-[25px] font-semibold leading-none tabular-nums sm:text-[28px]">
              {config.format(metric.value)}
            </div>
            <div
              className={cn(
                'mt-3 flex items-center gap-1 text-xs font-medium',
                metric.change === null
                  ? 'text-muted-foreground'
                  : positive
                    ? 'text-emerald-700'
                    : 'text-red-600',
                name === 'spend' &&
                  metric.change !== null &&
                  'text-muted-foreground',
              )}
            >
              {metric.change === null ? (
                'No prior data'
              ) : (
                <>
                  <ChangeIcon className="size-3.5" />
                  {Math.abs(metric.change).toFixed(2)}
                  {metric.changeType === 'percentagePoint' ? ' pts' : '%'}
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
