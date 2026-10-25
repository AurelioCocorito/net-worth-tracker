import { describe, it, expect } from 'vitest';
import { describePriceWarning, findImplausibleTradePrices, isImplausiblePrice } from '@/lib/utils/importPriceCheck';
import type { PlannedTradeRow } from '@/types/expenseImport';

const NOW = new Date('2026-10-25T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

function row(over: Partial<PlannedTradeRow>): PlannedTradeRow {
  return { line: 1, date: daysAgo(2), tradeType: 'buy', isin: 'IE00EXAMPLE1', quantity: 10, pricePerUnit: 100, ...over };
}

describe('isImplausiblePrice', () => {
  it('a recent buy or sell is held to ±25% of the current price', () => {
    expect(isImplausiblePrice(row({ pricePerUnit: 120 }), 100, NOW)).toBe(false);
    expect(isImplausiblePrice(row({ pricePerUnit: 80, tradeType: 'sell' }), 100, NOW)).toBe(false);
    expect(isImplausiblePrice(row({ pricePerUnit: 130 }), 100, NOW)).toBe(true);
    expect(isImplausiblePrice(row({ pricePerUnit: 70, tradeType: 'sell' }), 100, NOW)).toBe(true);
  });

  it('an older trade is flagged only beyond a factor of 3', () => {
    expect(isImplausiblePrice(row({ date: daysAgo(200), pricePerUnit: 250 }), 100, NOW)).toBe(false);
    expect(isImplausiblePrice(row({ date: daysAgo(200), pricePerUnit: 40 }), 100, NOW)).toBe(false);
    expect(isImplausiblePrice(row({ date: daysAgo(200), pricePerUnit: 350 }), 100, NOW)).toBe(true);
    expect(isImplausiblePrice(row({ date: daysAgo(200), pricePerUnit: 30 }), 100, NOW)).toBe(true);
  });

  it('a correction, even of today, uses the wide band: its price is the average cost', () => {
    expect(isImplausiblePrice(row({ tradeType: 'adjustment', pricePerUnit: 50 }), 100, NOW)).toBe(false);
    expect(isImplausiblePrice(row({ tradeType: 'adjustment', pricePerUnit: 100000 }), 100, NOW)).toBe(true);
  });

  it('no reference, no check', () => {
    expect(isImplausiblePrice(row({ pricePerUnit: 100000 }), 0, NOW)).toBe(false);
  });
});

describe('findImplausibleTradePrices', () => {
  it('flags the decimal slip of a correction against the instrument it names, in file order', () => {
    const refs = new Map([
      ['IE00EXAMPLE1', { name: 'Esempio World ETF', price: 50 }],
      ['US0000000002', { name: 'Esempio Corp', price: 200 }],
    ]);
    const warnings = findImplausibleTradePrices(
      [
        row({ line: 4, isin: 'us0000000002', tradeType: 'adjustment', pricePerUnit: 200000 }),
        row({ line: 2, pricePerUnit: 51 }),
        row({ line: 3, isin: 'XS0000000003', pricePerUnit: 999999 }),
      ],
      refs,
      NOW
    );

    expect(warnings).toEqual([
      { line: 4, isin: 'us0000000002', name: 'Esempio Corp', tradeType: 'adjustment', price: 200000, reference: 200, ratio: 1000 },
    ]);
  });
});

describe('describePriceWarning', () => {
  const fmt = (v: number) => v.toLocaleString('it-IT');

  it('names the instrument, both prices and how far apart they are', () => {
    expect(
      describePriceWarning(
        { line: 4, isin: 'X', name: 'Esempio Corp', tradeType: 'adjustment', price: 200000, reference: 200, ratio: 1000 },
        fmt
      )
    ).toBe('Esempio Corp: prezzo medio 200.000 contro un prezzo attuale di 200 (×1000). Controlla separatore dei decimali e valuta.');
    expect(
      describePriceWarning({ line: 2, isin: 'X', name: 'Esempio', tradeType: 'buy', price: 5, reference: 10, ratio: 0.5 }, fmt)
    ).toContain('prezzo 5 contro un prezzo attuale di 10 (÷2,0)');
  });
});
