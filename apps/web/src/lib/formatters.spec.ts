import { describe, expect, it } from 'vitest'
import {
  formatCurrency,
  formatDate,
  formatDuration,
  formatNumber,
  formatPercent,
  formatRatio,
} from './formatters'

describe('formatters', () => {
  it('formats exact and compact values for dashboard presentation', () => {
    expect(formatCurrency('124320.25')).toBe('$124,320.25')
    expect(formatCurrency('124320.25', true)).toBe('$124.3K')
    expect(formatNumber(19_827, true)).toBe('19.8K')
  })

  it('formats ratios, percentages, and UTC reporting dates', () => {
    expect(formatPercent(3.3265)).toBe('3.33%')
    expect(formatPercent(null)).toBe('—')
    expect(formatRatio(5.463)).toBe('5.46x')
    expect(formatDate('2026-08-27', { year: 'numeric' })).toBe('Aug 27, 2026')
  })

  it('formats ETL durations without losing short-run precision', () => {
    expect(formatDuration(null)).toBe('—')
    expect(formatDuration(420)).toBe('420 ms')
    expect(formatDuration(12_450)).toBe('12.4 s')
    expect(formatDuration(75_000)).toBe('1m 15s')
  })
})
