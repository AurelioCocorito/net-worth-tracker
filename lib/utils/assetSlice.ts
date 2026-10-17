/**
 * «Una fetta di un asset» (owner, 2026-10-17) — the ONE primitive behind the Intestatari per
 * quota and the goal assignments in quote or in percentuale.
 *
 * A slice is expressed either in UNITS (quote for a quoted instrument; euro for an account, a
 * property, a pension fund or a loan, whose value lives in `quantity` at price 1 — the unit the
 * reader already types in the asset form) or as a PERCENT of the asset, and it is resolved into a
 * FRACTION of the asset at the moment of the calculation. Units are the primary memory where the
 * owner chose them: they do not move with the price, and a quantity that changes (a trade in the
 * Registro, a value typed by hand) leaves them exactly as written — the new units stay
 * unassigned and a quantity that falls below the units assigned is DECLARED, never rescaled in
 * silence (`summarizeSlices.overBy`).
 *
 * Pure and SDK-free: it reads `hasMarketPrice` only, so the server builder, the pure summaries
 * and the forms share one arithmetic.
 */

import { hasMarketPrice } from '@/lib/utils/assetPricing';

export type AssetSlice = { units: number } | { percent: number };

/** Below this, a difference between two unit counts is float noise (a quota can be fractional). */
export const SLICE_UNITS_EPSILON = 1e-6;

export function isUnitsSlice(slice: AssetSlice): slice is { units: number } {
  return 'units' in slice;
}

/**
 * The asset's size the units are counted against: the quantity as a magnitude. A credit card in
 * the red has a negative balance; its units are euro of debt, counted on the absolute figure.
 */
export function sliceBase(quantity: number): number {
  return Math.abs(quantity);
}

/** The fraction of the asset a slice is today, 0-1 for a slice that fits (above 1 when it no longer does); 0 on an empty asset. */
export function sliceFraction(slice: AssetSlice, quantity: number): number {
  if (isUnitsSlice(slice)) {
    const base = sliceBase(quantity);
    return base > 0 ? slice.units / base : 0;
  }
  return slice.percent / 100;
}

/** The slice in units of the asset — a percent slice converted on today's quantity. */
export function sliceUnits(slice: AssetSlice, quantity: number): number {
  return isUnitsSlice(slice) ? slice.units : (slice.percent / 100) * sliceBase(quantity);
}

/** The slice as a percent of the asset — the DERIVED figure a units slice prints beside itself. */
export function slicePercent(slice: AssetSlice, quantity: number): number {
  return sliceFraction(slice, quantity) * 100;
}

/** The euro the slice is worth: the fraction of the asset's value (negative on a debt). */
export function sliceValue(slice: AssetSlice, quantity: number, value: number): number {
  return sliceFraction(slice, quantity) * value;
}

export interface SliceBudget {
  /** The units every slice adds up to, percent slices converted on today's quantity. */
  assignedUnits: number;
  /** The units nobody has yet (0 when over). */
  freeUnits: number;
  /** The units assigned past the quantity — the figure the declaration prints; 0 when everything fits. */
  overBy: number;
  /** `overBy > 0` beyond float noise: the stored slices no longer fit the asset. */
  needsReassignment: boolean;
}

/** The slices of ONE asset against its quantity: what is assigned, what is free, what no longer fits. */
export function summarizeSlices(slices: readonly AssetSlice[], quantity: number): SliceBudget {
  const base = sliceBase(quantity);
  const assignedUnits = slices.reduce((sum, slice) => sum + sliceUnits(slice, quantity), 0);
  const overBy = assignedUnits - base;
  const needsReassignment = overBy > SLICE_UNITS_EPSILON;
  return {
    assignedUnits,
    freeUnits: needsReassignment ? 0 : Math.max(0, base - assignedUnits),
    overBy: needsReassignment ? overBy : 0,
    needsReassignment,
  };
}

/**
 * The unit a slice of this asset is counted in: `quote` for an instrument with a market price
 * (a quoted one priced by hand included — its quantity is still a count), the asset's currency
 * for everything whose value lives in `quantity` at price 1 (an account, a property, a pension
 * fund, a loan, a private-equity stake).
 */
export type SliceUnit = { kind: 'units' } | { kind: 'currency'; currency: string };

export function sliceUnit(asset: { type: string; subCategory?: string; currency: string }): SliceUnit {
  return hasMarketPrice(asset.type, asset.subCategory) ? { kind: 'units' } : { kind: 'currency', currency: asset.currency };
}

/** «quote» / «€» / «USD» — the word after a units figure. */
export function sliceUnitLabel(unit: SliceUnit, count = 2): string {
  if (unit.kind === 'units') return count === 1 ? 'quota' : 'quote';
  return unit.currency === 'EUR' ? '€' : unit.currency;
}
