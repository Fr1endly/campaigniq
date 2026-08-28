import type { RangePreset } from '@campaign-iq/contracts'
import { cn } from '@/lib/utils'

const ranges: Array<{ value: RangePreset; label: string }> = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
]

export function RangeSelector({
  value,
  onChange,
}: {
  value: RangePreset
  onChange: (range: RangePreset) => void
}) {
  return (
    <div
      className="inline-flex h-8 shrink-0 items-center rounded-md border bg-card p-0.5"
      role="radiogroup"
      aria-label="Reporting period"
    >
      {ranges.map((range) => (
        <button
          key={range.value}
          type="button"
          role="radio"
          aria-checked={value === range.value}
          onClick={() => onChange(range.value)}
          className={cn(
            'h-6 rounded px-2.5 text-xs font-medium text-muted-foreground transition-colors',
            value === range.value &&
              'bg-primary text-primary-foreground shadow-sm',
          )}
        >
          {range.label}
        </button>
      ))}
    </div>
  )
}
