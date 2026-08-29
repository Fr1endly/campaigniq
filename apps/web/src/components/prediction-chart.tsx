import { useEffect, useRef, useState } from 'react'
import type { CampaignPrediction } from '@campaign-iq/contracts'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCurrency } from '@/lib/formatters'

function ForecastTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ dataKey?: string; value?: number; color?: string }>
  label?: string
}) {
  if (!active || !payload?.length || !label) return null
  return (
    <div className="min-w-44 rounded-md border bg-popover p-3 text-xs shadow-md">
      <p className="mb-2 font-medium">{label}</p>
      {payload.map((entry) => (
        <div
          key={entry.dataKey}
          className="mt-1 flex items-center justify-between gap-5"
        >
          <span className="flex items-center gap-2 text-muted-foreground">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            {entry.dataKey === 'forecast' ? 'Forecast' : 'Previous 7 days'}
          </span>
          <span className="font-medium tabular-nums">
            {formatCurrency(entry.value ?? 0)}
          </span>
        </div>
      ))}
    </div>
  )
}

export function PredictionChart({ data }: { data: CampaignPrediction[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const compact = width > 0 && width < 640
  const chartData = data.slice(0, compact ? 4 : 8).map((prediction) => ({
    name: prediction.campaign.name,
    forecast: Number(prediction.predictedRevenue),
    previous: Number(prediction.previousRevenue),
  }))

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const updateWidth = () => setWidth(element.clientWidth)
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={containerRef} className="h-[330px] w-full">
      {width > 0 && (
        <BarChart
          width={width}
          height={320}
          data={chartData}
          margin={{ top: 8, right: 8, left: 0, bottom: 48 }}
          data-testid="prediction-chart"
        >
          <CartesianGrid
            vertical={false}
            strokeDasharray="3 4"
            className="chart-grid"
          />
          <XAxis
            dataKey="name"
            axisLine={false}
            tickLine={false}
            interval={0}
            height={68}
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            angle={-28}
            textAnchor="end"
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            width={58}
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            tickFormatter={(value: number) => formatCurrency(value, true)}
          />
          <Tooltip
            content={<ForecastTooltip />}
            cursor={{ fill: 'var(--muted)' }}
          />
          <Legend verticalAlign="top" height={30} />
          <Bar
            dataKey="previous"
            name={compact ? 'Previous' : 'Previous 7 days'}
            fill="var(--chart-3)"
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
          />
          <Bar
            dataKey="forecast"
            name="Forecast"
            fill="var(--chart-1)"
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      )}
    </div>
  )
}
