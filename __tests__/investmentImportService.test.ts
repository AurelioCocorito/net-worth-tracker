/**
 * The commit order of the import's trades: by date, then the replay's same-day rank (buy < sell <
 * correction), then the file's line — the ledger route validates each write against the trades
 * already stored, so a same-day sale sent before its buy would be refused.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/services/assetService', () => ({ createAsset: vi.fn(), deleteAsset: vi.fn() }));
vi.mock('@/lib/services/assetTransactionService', () => ({
  createAssetTransaction: vi.fn(),
  deleteAssetTransaction: vi.fn(),
  getAssetTransactions: vi.fn(),
}));

import { orderTradeRowsForCommit } from '@/lib/services/investmentImportService';
import type { PlannedTradeRow } from '@/types/expenseImport';

const row = (line: number, day: number, tradeType: PlannedTradeRow['tradeType']): PlannedTradeRow => ({
  line,
  date: new Date(2026, 9, day, 12),
  tradeType,
  isin: 'IE0000000001',
  quantity: 1,
  pricePerUnit: 10,
});

describe('orderTradeRowsForCommit', () => {
  it('sorts by date, then buy < sell < correction, then line', () => {
    const ordered = orderTradeRowsForCommit([
      row(1, 2, 'sell'),
      row(2, 1, 'adjustment'),
      row(3, 2, 'buy'),
      row(4, 1, 'buy'),
      row(5, 2, 'buy'),
    ]);
    expect(ordered.map((r) => r.line)).toEqual([4, 2, 3, 5, 1]);
  });
});
