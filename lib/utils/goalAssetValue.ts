/**
 * What an asset is worth TO A GOAL (2026-10-20, owner's call): a property net of the loans that
 * finance it, a loan nothing — the same «a debt follows what it finances» rule the Allocazione
 * applies (`resolveAllocationRoleWithin`), so FIRE › Obiettivi' «Quota libera», its «Non
 * assegnato», every goal's progress and the assistant's «libero» read one figure. Until then the
 * list printed the home GROSS of its mortgage while the total already netted it: a row and a
 * total that did not speak the same language.
 *
 * Pure: `valueOf` is injected (the precedent of `buildHoldings`), so the assistant's portfolio
 * block can use it without the Firebase-coupled service; `goalMath` wraps it with
 * `calculateAssetValue`.
 */

import type { Asset } from '@/types/assets';
import { isLoanAsset } from '@/types/assets';

/** Whether a goal can hold a quota of the asset: never a loan. */
export function isGoalAsset(asset: Pick<Asset, 'type'>): boolean {
  return !isLoanAsset(asset);
}

/**
 * The asset's value for the goals: its own value plus the (negative) value of every loan that
 * names it in `financedAssetId`, floored at zero; a loan itself is 0.
 */
export function goalAssetValue(asset: Asset, assets: readonly Asset[], valueOf: (asset: Asset) => number): number {
  if (!isGoalAsset(asset)) return 0;
  let value = valueOf(asset);
  for (const candidate of assets) {
    if (isLoanAsset(candidate) && candidate.financedAssetId === asset.id) value += valueOf(candidate);
  }
  return Math.max(0, value);
}
