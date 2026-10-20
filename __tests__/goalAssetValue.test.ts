/**
 * What an asset is worth to a goal (lib/utils/goalAssetValue.ts): a property net of the loans
 * that finance it, floored at zero; a loan nothing; everything else its value.
 */

import { describe, expect, it } from 'vitest';
import type { Asset } from '@/types/assets';
import { goalAssetValue, isGoalAsset } from '@/lib/utils/goalAssetValue';

function asset(overrides: Partial<Asset> & Pick<Asset, 'id' | 'name' | 'type' | 'assetClass' | 'quantity' | 'currentPrice'>): Asset {
  return { userId: 'u1', ticker: '', currency: 'EUR', createdAt: new Date(), updatedAt: new Date(), ...overrides } as Asset;
}

const HOME = asset({ id: 'home', name: 'Casa', type: 'realestate', assetClass: 'realestate', quantity: 200000, currentPrice: 1 });
const MORTGAGE = asset({ id: 'loan', name: 'Mutuo', type: 'loan', assetClass: 'realestate', quantity: 80000, currentPrice: 1, financedAssetId: 'home' });
const PERSONAL = asset({ id: 'personal', name: 'Prestito', type: 'loan', assetClass: 'cash', quantity: 5000, currentPrice: 1 });
const ETF = asset({ id: 'etf', name: 'ETF', type: 'etf', assetClass: 'equity', quantity: 10, currentPrice: 100 });
const ASSETS = [HOME, MORTGAGE, PERSONAL, ETF];

// The shape of calculateAssetValue: quantity × price, a loan worth minus its principal.
const valueOf = (a: Asset) => (a.type === 'loan' ? -a.quantity * a.currentPrice : a.quantity * a.currentPrice);

describe('goalAssetValue', () => {
  it('nets a property of the loans that finance it, and only those', () => {
    expect(goalAssetValue(HOME, ASSETS, valueOf)).toBe(120000);
    expect(goalAssetValue(ETF, ASSETS, valueOf)).toBe(1000);
  });

  it('values a loan at nothing and never lets a property go below zero', () => {
    expect(goalAssetValue(MORTGAGE, ASSETS, valueOf)).toBe(0);
    expect(goalAssetValue(PERSONAL, ASSETS, valueOf)).toBe(0);
    const underwater = { ...MORTGAGE, quantity: 250000 };
    expect(goalAssetValue(HOME, [HOME, underwater], valueOf)).toBe(0);
  });

  it('says a loan is no asset a goal can hold', () => {
    expect(isGoalAsset(HOME)).toBe(true);
    expect(isGoalAsset(MORTGAGE)).toBe(false);
  });
});
