import { describe, expect, it } from 'vitest'
import {
  formatCurrency,
  formatDate,
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
})
