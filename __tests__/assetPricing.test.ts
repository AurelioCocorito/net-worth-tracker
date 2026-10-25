/**
 * Tests for lib/utils/assetPricing.ts — the single source of truth for "does this asset have
 * a market price?", shared by the price-update cron, AssetDialog and Patrimonio's
 * manual-price row tint.
 *
 * The regression these lock down: `pensionFund` used to be known only to AssetDialog's local
 * copy of the rule, so a pension fund was queued for a Yahoo quote and never tinted as a
 * manually valued asset in the portfolio table.
 */
import { describe, it, expect } from 'vitest';
import { AUTO_PRICE_STALE_DAYS, hasMarketPrice, requiresManualPricing, resolveAutoPriceStatus } from '@/lib/utils/assetPricing';
import type { AssetType } from '@/types/assets';

const MARKET_TRADED_TYPES: AssetType[] = ['stock', 'etf', 'bond', 'crypto', 'commodity'];
const MANUALLY_VALUED_TYPES: AssetType[] = ['cash', 'realestate', 'pensionFund', 'loan'];

describe('hasMarketPrice', () => {
  it.each(MARKET_TRADED_TYPES)('is true for the market-traded type %s', (type) => {
    expect(hasMarketPrice(type)).toBe(true);
  });

  it.each(MANUALLY_VALUED_TYPES)('is false for the manually valued type %s', (type) => {
    expect(hasMarketPrice(type)).toBe(false);
  });

  it('is false for a Private Equity position despite an otherwise tradable type', () => {
    expect(hasMarketPrice('stock', 'Private Equity')).toBe(false);
  });

  it('stays true for other sub-categories of a tradable type', () => {
    expect(hasMarketPrice('etf', 'Azionario Globale')).toBe(true);
  });
});

describe('requiresManualPricing', () => {
  it('is true for a pension fund even when autoUpdatePrice was persisted as true', () => {
    // Regression: pre-fix, pension funds were saved with the form's `true` default and the
    // portfolio table read only that flag, so the row never got the manual-price tint.
    expect(requiresManualPricing({ type: 'pensionFund', autoUpdatePrice: true })).toBe(true);
  });

  it('is true when the user explicitly disabled auto-updates on a tradable asset', () => {
    expect(requiresManualPricing({ type: 'stock', autoUpdatePrice: false })).toBe(true);
  });

  it('is false for a tradable asset with auto-updates on', () => {
    expect(requiresManualPricing({ type: 'etf', autoUpdatePrice: true })).toBe(false);
  });

  it('treats an undefined autoUpdatePrice as opted-in (backwards compatibility)', () => {
    expect(requiresManualPricing({ type: 'etf' })).toBe(false);
    expect(requiresManualPricing({ type: 'realestate' })).toBe(true);
  });

  it('is true for a Private Equity position', () => {
    expect(requiresManualPricing({ type: 'stock', subCategory: 'Private Equity' })).toBe(true);
  });
});

describe('resolveAutoPriceStatus', () => {
  // Noon in Rome; the daily price update runs in the evening.
  const now = new Date('2026-03-10T11:00:00Z');
  const yesterday = new Date('2026-03-09T18:00:00Z');
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
  const created = daysAgo(30);

  it('is manual for a hand-valued type, whatever its dates say', () => {
    expect(resolveAutoPriceStatus({ type: 'cash', lastPriceUpdate: yesterday }, now)).toEqual({ kind: 'manual' });
  });

  it('is manual for a quoted instrument with automatic updates switched off', () => {
    expect(resolveAutoPriceStatus({ type: 'etf', autoUpdatePrice: false, lastPriceUpdate: yesterday }, now)).toEqual({ kind: 'manual' });
  });

  it('is ok for a quoted instrument updated yesterday, autoUpdatePrice unset counting as on', () => {
    expect(resolveAutoPriceStatus({ type: 'etf', createdAt: created, lastPriceUpdate: yesterday }, now)).toEqual({ kind: 'ok', updatedAt: yesterday });
  });

  it('is failing (yellow) when the last attempt failed after an earlier success', () => {
    const failedAt = new Date('2026-03-09T18:00:05Z');
    const status = resolveAutoPriceStatus({ type: 'stock', createdAt: created, lastPriceUpdate: daysAgo(2), priceUpdateFailedAt: failedAt }, now);
    expect(status).toEqual({ kind: 'failing', reason: 'failed', updatedAt: daysAgo(2), failedAt });
  });

  it('ignores a failure older than a later success', () => {
    const status = resolveAutoPriceStatus({ type: 'stock', createdAt: created, lastPriceUpdate: yesterday, priceUpdateFailedAt: daysAgo(3) }, now);
    expect(status.kind).toBe('ok');
  });

  it('is failing (yellow) when no quote arrived for more than the stale threshold', () => {
    const justInside = resolveAutoPriceStatus({ type: 'bond', createdAt: created, lastPriceUpdate: daysAgo(AUTO_PRICE_STALE_DAYS) }, now);
    const justOutside = resolveAutoPriceStatus({ type: 'bond', createdAt: created, lastPriceUpdate: daysAgo(AUTO_PRICE_STALE_DAYS + 0.1) }, now);
    expect(justInside.kind).toBe('ok');
    expect(justOutside).toEqual({ kind: 'failing', reason: 'stale', updatedAt: daysAgo(AUTO_PRICE_STALE_DAYS + 0.1), failedAt: null });
  });

  it('is never (red) when the only update is the creation stamp and the run failed', () => {
    const status = resolveAutoPriceStatus({ type: 'stock', createdAt: created, lastPriceUpdate: created, priceUpdateFailedAt: yesterday }, now);
    expect(status).toEqual({ kind: 'never', failedAt: yesterday });
  });

  it('is never (red) when the creation stamp is the only update and it is past the threshold', () => {
    expect(resolveAutoPriceStatus({ type: 'stock', createdAt: created, lastPriceUpdate: created }, now)).toEqual({ kind: 'never', failedAt: null });
  });

  it('is never (red) without any valid update date', () => {
    expect(resolveAutoPriceStatus({ type: 'crypto', lastPriceUpdate: new Date('invalid') }, now)).toEqual({ kind: 'never', failedAt: null });
  });

  it('keeps a new instrument ok before its first evening run', () => {
    const today = new Date('2026-03-10T09:00:00Z');
    expect(resolveAutoPriceStatus({ type: 'stock', createdAt: today, lastPriceUpdate: today }, now).kind).toBe('ok');
  });
});
