/**
 * Asset Pricing Source — single source of truth for "does this asset have a market price?"
 *
 * Design note: this rule used to exist in three independent copies (AssetDialog's local
 * `shouldUpdatePrice`, yahooFinanceService's exported `shouldUpdatePrice`, and
 * the asset table's `requiresManualPricing`). They drifted: only the dialog's copy knew
 * about `pensionFund`, so a pension fund was priced correctly in the form, still queued for
 * a Yahoo quote by the price cron, and never got the manual-price row tint in the table.
 *
 * The module is deliberately dependency-free (no Firebase, no yahoo-finance2) so both the
 * client bundle and server-only code can import it.
 *
 * WARNING: adding an AssetType whose value is entered by hand (statement, appraisal, NAV)
 * requires adding it to MANUALLY_VALUED_TYPES below — and nowhere else.
 */

/**
 * Asset types whose value is entered by the user, never quoted by a market data provider.
 *
 * - `realestate`: property appraisals, not market quotes
 * - `cash`: the unit of measurement itself, price is always 1
 * - `pensionFund`: the value is an "estratto conto" overwrite from the fund manager
 * - `loan`: the outstanding principal, as the bank states it, moved by the linked instalments
 */
const MANUALLY_VALUED_TYPES: ReadonlySet<string> = new Set(['realestate', 'cash', 'pensionFund', 'loan']);

/**
 * Sub-category that overrides an otherwise market-traded type. A Private Equity position sits
 * in the `equity` class but is valued periodically by the fund manager, not by an exchange.
 */
const MANUALLY_VALUED_SUBCATEGORY = 'Private Equity';

/**
 * Whether an asset can be priced from a market data provider (Yahoo Finance / Borsa Italiana).
 *
 * @param assetType   - The asset type (stock, etf, bond, crypto, commodity, cash, realestate, pensionFund)
 * @param subCategory - Optional sub-category (e.g. "Private Equity" within the equity class)
 * @returns True when an automatic quote is meaningful for this asset.
 */
export function hasMarketPrice(assetType: string, subCategory?: string): boolean {
  if (MANUALLY_VALUED_TYPES.has(assetType)) return false;
  if (subCategory === MANUALLY_VALUED_SUBCATEGORY) return false;
  return true;
}

/** Minimal asset shape needed to decide how an asset is priced. */
export interface PricedAssetFields {
  type: string;
  subCategory?: string;
  autoUpdatePrice?: boolean;
}

/**
 * Whether the user has to keep this asset's value up to date by hand.
 *
 * True either because the asset has no market price at all, or because the user explicitly
 * turned auto-updates off for it. `autoUpdatePrice === undefined` means "not set" and is
 * treated as opted-in, matching the backwards-compatible default in `priceUpdater.ts`.
 *
 * Drives the manual-price row tint on Patrimonio and the «N valutati a mano» count of its
 * Strumenti reading. It does NOT decide how the Δ columns are measured: a hand-priced asset can
 * still have a real unit price (see lib/utils/assetPerformanceDeltas.ts).
 */
export function requiresManualPricing(asset: PricedAssetFields): boolean {
  if (asset.autoUpdatePrice === false) return true;
  return !hasMarketPrice(asset.type, asset.subCategory);
}

/**
 * Days after which an automatic quote counts as stale even without a recorded failure. The price
 * update runs every evening (the daily cron, `vercel.json`), so four days is three runs missed in a
 * row: past a passing hiccup of Yahoo or Vercel, and the sign that the job itself is not running.
 */
export const AUTO_PRICE_STALE_DAYS = 4;

/** What Patrimonio shows beside an instrument's name about its automatic price (owner, 2026-10-25). */
export type AutoPriceStatus =
  /** Valued by hand: no market price, or automatic updates switched off. No mark, the row tint says it. */
  | { kind: 'manual' }
  /** Automatic and working: the green check. */
  | { kind: 'ok'; updatedAt: Date }
  /**
   * Automatic, it found a price before, and now it does not: the last attempt failed, no quote
   * has arrived for too long, or the quote arrives but the market made it too long ago (`frozen`:
   * Yahoo answering with a price that stopped moving, the «1GOOGL.MI» case). The yellow warning:
   * to keep an eye on (owner, 2026-10-25).
   */
  | { kind: 'failing'; reason: 'failed' | 'stale'; updatedAt: Date; failedAt: Date | null }
  | { kind: 'failing'; reason: 'frozen'; updatedAt: Date; quotedAt: Date }
  /**
   * Automatic, and it has NEVER found a price: the only `lastPriceUpdate` is the one stamped at
   * creation (typically a ticker Yahoo does not know). The red mark: to update by hand.
   */
  | { kind: 'never'; failedAt: Date | null }
  /**
   * Automatic, and no attempt has spoken yet: the only `lastPriceUpdate` is the one stamped at
   * creation, no run has failed and the creation is younger than AUTO_PRICE_STALE_DAYS. No mark: a
   * check here would claim a price nobody fetched (Austria 2120, owner, 2026-10-25).
   */
  | { kind: 'pending' };

/** The fields `resolveAutoPriceStatus` reads. */
export interface AutoPricedAssetFields extends PricedAssetFields {
  lastPriceUpdate?: Date | null;
  priceUpdateFailedAt?: Date | null;
  priceQuotedAt?: Date | null;
  createdAt?: Date | null;
}

function validDate(value: Date | null | undefined): Date | null {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value : null;
}

/**
 * Whether this asset's automatic price is on AND working. «Riuscito» reads two fields the price
 * update writes (lib/helpers/priceUpdater.ts): `priceUpdateFailedAt`, stamped when a run gets no
 * quote and removed by the next success, and `lastPriceUpdate`, stamped by every success. A failure
 * later than the last success is `failed`; a last success older than AUTO_PRICE_STALE_DAYS is
 * `stale`. `lastPriceUpdate` is also stamped at creation, so the check needs a success LATER than
 * `createdAt`: a new instrument reads `pending` (no mark) until the first run, then `ok` or `never`.
 * A success whose market time (`priceQuotedAt`, Yahoo's `regularMarketTime`) is older than
 * AUTO_PRICE_STALE_DAYS is `frozen`: the update works, the price it brings does not move.
 */
export function resolveAutoPriceStatus(asset: AutoPricedAssetFields, now: Date): AutoPriceStatus {
  if (requiresManualPricing(asset)) return { kind: 'manual' };
  const updatedAt = validDate(asset.lastPriceUpdate);
  const failedAt = validDate(asset.priceUpdateFailedAt);
  const createdAt = validDate(asset.createdAt);
  const lastFailed = failedAt !== null && (!updatedAt || failedAt.getTime() >= updatedAt.getTime());
  const stale = !updatedAt || now.getTime() - updatedAt.getTime() > AUTO_PRICE_STALE_DAYS * 86_400_000;
  const neverUpdated = !updatedAt || (!!createdAt && updatedAt.getTime() <= createdAt.getTime());
  const quotedAt = validDate(asset.priceQuotedAt);
  const frozen = quotedAt !== null && now.getTime() - quotedAt.getTime() > AUTO_PRICE_STALE_DAYS * 86_400_000;
  if (!lastFailed && !stale && updatedAt && !neverUpdated) {
    return frozen && quotedAt ? { kind: 'failing', reason: 'frozen', updatedAt, quotedAt } : { kind: 'ok', updatedAt };
  }
  if (!lastFailed && !stale && neverUpdated) return { kind: 'pending' };
  if (neverUpdated || !updatedAt) return { kind: 'never', failedAt: lastFailed ? failedAt : null };
  if (lastFailed) return { kind: 'failing', reason: 'failed', updatedAt, failedAt };
  return { kind: 'failing', reason: 'stale', updatedAt, failedAt: null };
}
