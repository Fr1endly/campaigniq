export function formatCurrency(value: string | number, compact = false) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : 2,
  }).format(Number(value))
}

export function formatNumber(value: number, compact = false) {
  return new Intl.NumberFormat('en-US', {
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : 0,
  }).format(value)
}

export function formatPercent(value: number | null, digits = 2) {
  return value === null ? '—' : `${value.toFixed(digits)}%`
}

export function formatRatio(value: number | null) {
  return value === null ? '—' : `${value.toFixed(2)}x`
}

export function formatDate(
  value: string,
  options?: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
    ...options,
  }).format(new Date(`${value}T00:00:00.000Z`))
}
