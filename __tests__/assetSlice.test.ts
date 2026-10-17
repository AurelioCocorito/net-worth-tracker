/**
 * «Una fetta di un asset» (lib/utils/assetSlice.ts, 2026-10-17): units or percent, resolved into
 * a fraction on today's quantity. Figures invented and round.
 *
 * Falsified one at a time: a units slice rescaled to fit a smaller quantity (it is declared,
 * `overBy`); a percent slice counted on the signed quantity of a card in the red (the base is the
 * magnitude); an account's unit printed as «quote» (it is its currency).
 */

import { describe, expect, it } from 'vitest';
import {
  sliceFraction,
  slicePercent,
  sliceUnit,
  sliceUnitLabel,
  sliceUnits,
  sliceValue,
  summarizeSlices,
} from '@/lib/utils/assetSlice';

describe('a slice resolved on today\'s quantity', () => {
  it('reads a units slice as its share of the quantity, a percent slice as itself', () => {
    expect(sliceFraction({ units: 40 }, 100)).toBe(0.4);
    expect(sliceFraction({ percent: 25 }, 100)).toBe(0.25);
    expect(slicePercent({ units: 30 }, 120)).toBe(25);
    expect(sliceUnits({ percent: 50 }, 80)).toBe(40);
    expect(sliceUnits({ units: 12.5 }, 80)).toBe(12.5);
  });

  it('does not move a units slice with the price, and does not rescale it when the quantity falls', () => {
    // 40 units of 100 at any price is 40 % of the value…
    expect(sliceValue({ units: 40 }, 100, 10_000)).toBe(4000);
    expect(sliceValue({ units: 40 }, 100, 20_000)).toBe(8000);
    // …and on a quantity that fell to 50 the same 40 units are 80 %, never rescaled to 40 %.
    expect(sliceFraction({ units: 40 }, 50)).toBe(0.8);
    expect(sliceFraction({ units: 60 }, 50)).toBe(1.2);
  });

  it('counts the units of a debt on the magnitude of its balance, and reads 0 on an empty asset', () => {
    // A credit card at −500: 300 € of its debt is 60 % of it.
    expect(sliceFraction({ units: 300 }, -500)).toBe(0.6);
    expect(sliceValue({ units: 300 }, -500, -500)).toBe(-300);
    expect(sliceUnits({ percent: 50 }, -500)).toBe(250);
    expect(sliceFraction({ units: 10 }, 0)).toBe(0);
  });
});

describe('summarizeSlices — assigned, free and what no longer fits', () => {
  it('adds up the units, percent slices converted, and leaves the rest free', () => {
    const budget = summarizeSlices([{ units: 40 }, { percent: 20 }], 100);
    expect(budget).toEqual({ assignedUnits: 60, freeUnits: 40, overBy: 0, needsReassignment: false });
  });

  it('declares the units past the quantity instead of rescaling them', () => {
    const budget = summarizeSlices([{ units: 80 }, { units: 40 }], 100);
    expect(budget.assignedUnits).toBe(120);
    expect(budget.freeUnits).toBe(0);
    expect(budget.overBy).toBe(20);
    expect(budget.needsReassignment).toBe(true);
  });

  it('treats float noise as a fit', () => {
    const budget = summarizeSlices([{ units: 0.1 }, { units: 0.2 }], 0.3);
    expect(budget.needsReassignment).toBe(false);
    expect(budget.overBy).toBe(0);
  });

  it('is empty on nothing assigned', () => {
    expect(summarizeSlices([], 100)).toEqual({ assignedUnits: 0, freeUnits: 100, overBy: 0, needsReassignment: false });
  });
});

describe('the unit a slice is counted in', () => {
  it('is quote for a quoted instrument and the currency where the value lives in quantity at price 1', () => {
    expect(sliceUnit({ type: 'etf', currency: 'EUR' })).toEqual({ kind: 'units' });
    expect(sliceUnit({ type: 'cash', currency: 'EUR' })).toEqual({ kind: 'currency', currency: 'EUR' });
    expect(sliceUnit({ type: 'cash', currency: 'USD' })).toEqual({ kind: 'currency', currency: 'USD' });
    expect(sliceUnit({ type: 'realestate', currency: 'EUR' })).toEqual({ kind: 'currency', currency: 'EUR' });
    expect(sliceUnit({ type: 'pensionFund', currency: 'EUR' })).toEqual({ kind: 'currency', currency: 'EUR' });
    expect(sliceUnit({ type: 'loan', currency: 'EUR' })).toEqual({ kind: 'currency', currency: 'EUR' });
    expect(sliceUnit({ type: 'stock', subCategory: 'Private Equity', currency: 'EUR' })).toEqual({ kind: 'currency', currency: 'EUR' });
  });

  it('prints the word the figure takes', () => {
    expect(sliceUnitLabel({ kind: 'units' })).toBe('quote');
    expect(sliceUnitLabel({ kind: 'units' }, 1)).toBe('quota');
    expect(sliceUnitLabel({ kind: 'currency', currency: 'EUR' })).toBe('€');
    expect(sliceUnitLabel({ kind: 'currency', currency: 'USD' })).toBe('USD');
  });
});
