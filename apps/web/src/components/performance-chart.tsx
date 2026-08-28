import { useEffect, useRef, useState } from 'react'
import type { DashboardSummary } from '@campaign-iq/contracts'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCurrency, formatDate } from '@/lib/formatters'

type TrendPoint = DashboardSummary['trend'][number]

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ dataKey?: string; value?: string | number; color?: string }>
  label?: string
}) {
  if (!active || !payload?.length || !label) return null
  return (
    <div className="min-w-40 rounded-md border bg-popover p-3 text-xs shadow-md">
      <p className="mb-2 font-medium">
        {formatDate(label, { month: 'short', day: 'numeric', year: 'numeric' })}
      </p>
      {payload.map((entry) => (
        <div
          key={entry.dataKey}
          className="mt-1 flex items-center justify-between gap-5"
        >
          <span className="flex items-center gap-2 capitalize text-muted-foreground">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            {entry.dataKey}
          </span>
          <span className="font-medium tabular-nums">
            {formatCurrency(entry.value ?? 0)}
          </span>
        </div>
      ))}
    </div>
  )
}

export function PerformanceChart({ data }: { data: TrendPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const chartData = data.map((point) => ({
    ...point,
    revenue: Number(point.revenue),
    spend: Number(point.spend),
  }))

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const updateSize = () => {
      const rect = element.getBoundingClientRect()
      setSize({
        width: Math.floor(rect.width),
        height: Math.floor(rect.height),
      })
    }
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      className="h-[300px] w-full sm:h-[340px]"
      data-testid="performance-chart"
    >
      {size.width > 0 && size.height > 0 && (
        <ComposedChart
          width={size.width}
          height={size.height}
          data={chartData}
          margin={{ top: 12, right: 8, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            strokeDasharray="3 4"
            className="chart-grid"
          />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            minTickGap={32}
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            tickFormatter={(value: string) => formatDate(value)}
          />
          <YAxis
            yAxisId="revenue"
            axisLine={false}
            tickLine={false}
            width={58}
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            tickFormatter={(value: number) => formatCurrency(value, true)}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: 'var(--border)' }}
          />
          <Area
            yAxisId="revenue"
            type="monotone"
            dataKey="revenue"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="url(#revenueFill)"
            isAnimationActive={false}
          />
          <Line
            yAxisId="revenue"
            type="monotone"
            dataKey="spend"
            stroke="var(--chart-2)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      )}
    </div>
  )
}
