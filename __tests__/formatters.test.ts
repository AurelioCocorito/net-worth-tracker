import { describe, it, expect } from 'vitest'
import {
  formatCurrency,
  formatEuroMinus,
  formatPercentage,
  formatDate,
  formatDateTime,
  formatNumber,
  formatSignedPercentIt,
  formatSignedPoints,
  formatTimePeriodLabel,
  isPrintedZero,
  printedSign,
  withTypographicMinus,
} from '@/lib/utils/formatters'

/**
 * The sign and the tone of a figure follow its PRINTED value, on the Rendimenti tile too (the
 * printed-zero rule reaching the tile a strip cell repeats; owner, 2026-10-14): for +0,03 the hero
 * printed «+0,0%» in green and the gap chip «+0 pt» while the cell under the title said «0,0%» and
 * «0 pt». Seen red on 2026-10-14 with the sign taken from the raw value in the three helpers
 * («+0,0%», «+0 pt», 1).
 */
describe('printedSign / formatSignedPercentIt / formatSignedPoints', () => {
  it('a figure that rounds to zero has no sign; the others keep theirs', () => {
    expect(printedSign(0.03, 1)).toBe(0)
    expect(printedSign(-0.04, 1)).toBe(0)
    expect(printedSign(0.06, 1)).toBe(1)
    expect(printedSign(-0.06, 1)).toBe(-1)
    expect(printedSign(0, 1)).toBe(0)
  })

  it('prints the it-IT percent signed on the printed value, «−» typographic', () => {
    expect(formatSignedPercentIt(7.3)).toBe('+7,3%')
    expect(formatSignedPercentIt(-4.12)).toBe('−4,1%')
    expect(formatSignedPercentIt(0.03)).toBe('0,0%')
    expect(formatSignedPercentIt(-0.04)).toBe('0,0%')
  })

  it('prints a gap in points to one decimal, whole when it prints whole, unsigned when it prints zero', () => {
    expect(formatSignedPoints(0.4)).toBe('+0,4 pt')
    expect(formatSignedPoints(-9.26)).toBe('−9,3 pt')
    expect(formatSignedPoints(1)).toBe('+1 pt')
    expect(formatSignedPoints(0.03)).toBe('0 pt')
    expect(formatSignedPoints(-0.04)).toBe('0 pt')
  })
})

/**
 * The typographic minus on a printed MAGNITUDE (The Comma Rule), and none when the magnitude
 * prints as zero (the printed-zero rule, AGENTS.md § Layout and Color Tokens). Seen red on
 * 2026-10-12 with the zero clause removed from `withTypographicMinus` («−0 €» for −0,3, «−0%» for −0,4).
 */
describe('withTypographicMinus / formatEuroMinus / isPrintedZero', () => {
  /** Node's Intl writes a narrow no-break space before «€»: read it as a plain one. */
  const plain = (text: string) => text.replace(/[  ]/g, ' ')

  it('puts the U+2212 in front of a negative magnitude, nothing in front of a positive one', () => {
    expect(withTypographicMinus(-83, '83 €')).toBe('−83 €')
    expect(withTypographicMinus(1300, '1300 €')).toBe('1300 €')
    expect(plain(formatEuroMinus(-354))).toBe('−354 €')
    expect(plain(formatEuroMinus(1940))).toBe('1940 €')
  })

  it('leaves a magnitude that prints as zero unsigned, whatever the sign of the value', () => {
    expect(withTypographicMinus(-0.3, '0 €')).toBe('0 €')
    expect(withTypographicMinus(-0.4, '0%')).toBe('0%')
    expect(withTypographicMinus(0, '0 €')).toBe('0 €')
    expect(plain(formatEuroMinus(-0.3))).toBe('0 €')
    expect(plain(formatEuroMinus(0))).toBe('0 €')
    expect(isPrintedZero('0,00 €')).toBe(true)
    expect(isPrintedZero('−0,00%')).toBe(true)
    expect(isPrintedZero('0,01 €')).toBe(false)
  })
})

describe('formatCurrency', () => {
  it('should format EUR with default decimals', () => {
    const result = formatCurrency(1234.56)
    // Node.js ICU support varies — check value and currency symbol are present
    expect(result).toMatch(/1[.,]?234/)
    expect(result).toMatch(/56/)
    expect(result).toMatch(/€|EUR/)
  })

  it('should format zero', () => {
    const result = formatCurrency(0)
    expect(result).toContain('0')
  })

  it('should format negative amounts', () => {
    const result = formatCurrency(-500.5)
    expect(result).toContain('500')
  })

  it('should respect custom decimals', () => {
    const result = formatCurrency(100, 'EUR', 0)
    // With 0 decimals, should not have decimal separator for the fractional part
    expect(result).toContain('100')
  })

  it('should format USD', () => {
    const result = formatCurrency(1000, 'USD')
    expect(result).toMatch(/1[.,]?000/)
    expect(result).toMatch(/\$|USD/)
  })

  it('should handle 4-decimal precision', () => {
    const result = formatCurrency(50.1234, 'EUR', 4)
    expect(result).toContain('1234')
  })

  it('should handle large numbers', () => {
    const result = formatCurrency(1000000)
    expect(result).toMatch(/1[.,]?000[.,]?000/)
  })
})

describe('formatPercentage', () => {
  it('should format with default 2 decimals', () => {
    expect(formatPercentage(12.34)).toBe('12.34%')
  })

  it('should format with 0 decimals', () => {
    expect(formatPercentage(12.34, 0)).toBe('12%')
  })

  it('should format negative percentages', () => {
    expect(formatPercentage(-5.5, 1)).toBe('-5.5%')
  })

  it('should format zero', () => {
    expect(formatPercentage(0)).toBe('0.00%')
  })

  it('should format with custom decimals', () => {
    expect(formatPercentage(3.14159, 4)).toBe('3.1416%')
  })
})

describe('formatDate', () => {
  it('should format as DD/MM/YYYY', () => {
    const date = new Date(2025, 2, 15) // March 15, 2025
    expect(formatDate(date)).toBe('15/03/2025')
  })

  it('should format first day of year', () => {
    const date = new Date(2025, 0, 1)
    expect(formatDate(date)).toBe('01/01/2025')
  })

  it('should format last day of year', () => {
    const date = new Date(2025, 11, 31)
    expect(formatDate(date)).toBe('31/12/2025')
  })

  it('should handle leap year (Feb 29)', () => {
    const date = new Date(2024, 1, 29)
    expect(formatDate(date)).toBe('29/02/2024')
  })
})

describe('formatDateTime', () => {
  it('should format with time', () => {
    const date = new Date(2025, 2, 15, 14, 30)
    expect(formatDateTime(date)).toBe('15/03/2025 14:30')
  })

  it('should handle midnight', () => {
    const date = new Date(2025, 0, 1, 0, 0)
    expect(formatDateTime(date)).toBe('01/01/2025 00:00')
  })
})

describe('formatNumber', () => {
  it('should format large numbers', () => {
    const result = formatNumber(1234567)
    // Node.js ICU support varies — verify digits are present
    expect(result).toMatch(/1[.,]?234[.,]?567/)
  })

  it('should handle small numbers', () => {
    expect(formatNumber(42)).toBe('42')
  })

  it('should handle zero', () => {
    expect(formatNumber(0)).toBe('0')
  })

  it('should handle negative numbers', () => {
    const result = formatNumber(-1234)
    expect(result).toMatch(/1[.,]?234/)
    expect(result).toMatch(/-/)
  })
})

describe('formatTimePeriodLabel', () => {
  describe('without metrics (generic labels)', () => {
    it('should return Italian label for YTD', () => {
      const result = formatTimePeriodLabel('YTD')
      expect(result).toContain('Anno Corrente')
      expect(result).toContain(String(new Date().getFullYear()))
    })

    it('should return Italian label for 1Y', () => {
      expect(formatTimePeriodLabel('1Y')).toBe('Ultimo Anno')
    })

    it('should return Italian label for 3Y', () => {
      expect(formatTimePeriodLabel('3Y')).toBe('Ultimi 3 Anni')
    })

    it('should return Italian label for 5Y', () => {
      expect(formatTimePeriodLabel('5Y')).toBe('Ultimi 5 Anni')
    })

    it('should return Italian label for ALL', () => {
      expect(formatTimePeriodLabel('ALL')).toBe('Storico Completo')
    })

    it('should return Italian label for CUSTOM', () => {
      expect(formatTimePeriodLabel('CUSTOM')).toBe('Periodo Personalizzato')
    })
  })

  describe('with metrics (date range labels)', () => {
    it('should format date range with abbreviated month and 2-digit year', () => {
      const metrics = {
        startDate: new Date(2025, 0, 1),  // Jan 2025
        endDate: new Date(2025, 3, 1),    // Apr 2025
      }
      const result = formatTimePeriodLabel('YTD', metrics)
      // Italian abbreviated months: gen, feb, mar, apr...
      expect(result).toMatch(/gen\s+25\s*-\s*apr\s+25/)
    })
  })
})
