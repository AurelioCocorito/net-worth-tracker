/**
 * Tests for lib/utils/portfolioSleeve.ts: i tre blocchi di Strumenti (Core · Trading · Altro),
 * decisi dal solo tipo dell'asset. Modulo puro, nessun mock Firebase.
 */
import { describe, it, expect } from 'vitest';
import type { AssetType } from '@/types/assets';
import { groupBySleeve, resolvePortfolioSleeve } from '@/lib/utils/portfolioSleeve';

const row = (id: string, type: AssetType) => ({ id, type });

describe('resolvePortfolioSleeve', () => {
  it('puts ETF, bonds, ETC on commodities and crypto in the core', () => {
    for (const type of ['etf', 'bond', 'commodity', 'crypto'] as const) {
      expect(resolvePortfolioSleeve({ type })).toBe('core');
    }
  });

  it('puts single stocks in trading', () => {
    expect(resolvePortfolioSleeve({ type: 'stock' })).toBe('trading');
  });

  it('puts properties, pension funds, loans and accounts in altro', () => {
    for (const type of ['realestate', 'pensionFund', 'loan', 'cash'] as const) {
      expect(resolvePortfolioSleeve({ type })).toBe('other');
    }
  });
});

describe('groupBySleeve', () => {
  it('orders the blocks core → trading → altro and keeps the given order inside each', () => {
    const groups = groupBySleeve([row('a', 'stock'), row('b', 'realestate'), row('c', 'etf'), row('d', 'stock'), row('e', 'bond')]);
    expect(groups?.map((g) => g.sleeve)).toEqual(['core', 'trading', 'other']);
    expect(groups?.map((g) => g.assets.map((a) => a.id))).toEqual([['c', 'e'], ['a', 'd'], ['b']]);
  });

  it('leaves out an empty block', () => {
    const groups = groupBySleeve([row('a', 'etf'), row('b', 'stock')]);
    expect(groups?.map((g) => g.label)).toEqual(['Core', 'Trading']);
  });

  it('is null when a single block holds everything (no header to repeat the tile)', () => {
    expect(groupBySleeve([row('a', 'etf'), row('b', 'bond')])).toBeNull();
    expect(groupBySleeve([])).toBeNull();
  });
});
