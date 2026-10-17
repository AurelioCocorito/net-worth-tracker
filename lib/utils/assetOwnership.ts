/**
 * «Intestatario» — whose each asset is, and how the household's wealth splits by person
 * (owner, 2026-10-17). Pure and SDK-free: the Panoramica's server builder, the Patrimonio page and
 * the Strumenti filter all read it, with `calculateAssetValue` INJECTED as `valueOf` (the module
 * must stay importable without the Firebase chain, like `allocationUtils`).
 *
 * The rules, each the owner's call of that day:
 *  - `Asset.ownerMemberId` names a FamilyMember of the settings (the people Previdenza and the
 *    Divisione already know). ABSENT MEANS «IN COMUNE»: no migration, the exception is marked.
 *  - A pension fund's owner IS `pensionFundDetails.familyMemberId` — one field, never two.
 *  - A loan that finances a property follows that property's owner (a mortgage is as shared or
 *    as personal as the house); a personal loan has its own field. A debt counts in its owner's
 *    group with its NEGATIVE value, so each group is net.
 *  - An id whose member was deleted is «Senza intestatario» (the Divisione's word), a group of
 *    its own: never folded into «In comune», so the stale datum is seen and fixed.
 */

import { isLoanAsset, type Asset, type FamilyMember } from '@/types/assets';
import { SPLIT_UNASSIGNED_LABEL } from '@/lib/utils/expenseSplitSummary';
import { OWNER_FILTER_ALL, OWNER_FILTER_COMMON, OWNER_FILTER_UNASSIGNED, type OwnerFilterOption } from '@/lib/utils/movementsOwnerFilter';

/** The shared group's label — the same words the expense form and the Movimenti filter use. */
export const OWNER_COMMON_LABEL = 'In comune';
export const OWNER_UNASSIGNED_LABEL = SPLIT_UNASSIGNED_LABEL;

/**
 * The member an asset belongs to, or `null` for a shared one. The ONE resolution: a pension fund
 * answers with its Previdenza member, a mortgage with its property's owner (the property looked up
 * in `assets`; a financed asset no longer there leaves the loan to its own field), everything else
 * with its own `ownerMemberId`. A blank id is «in comune».
 */
export function resolveAssetOwnerId(asset: Asset, assets: readonly Asset[]): string | null {
  if (asset.type === 'pensionFund') return asset.pensionFundDetails?.familyMemberId || null;
  if (isLoanAsset(asset) && asset.financedAssetId) {
    const financed = assets.find((candidate) => candidate.id === asset.financedAssetId);
    if (financed) return financed.ownerMemberId || null;
  }
  return asset.ownerMemberId || null;
}

/** Whether the form offers the field: a pension fund and a linked mortgage derive their owner. */
export function hasOwnOwnerField(asset: Pick<Asset, 'type' | 'financedAssetId'>): boolean {
  if (asset.type === 'pensionFund') return false;
  return !(isLoanAsset(asset) && !!asset.financedAssetId);
}

export type OwnershipRowKind = 'member' | 'common' | 'unassigned';

export interface OwnershipRow {
  /** The member's id, `common` or `unassigned` — the row's identity. */
  key: string;
  kind: OwnershipRowKind;
  /** The member's id; `null` for the shared and the orphaned groups. */
  memberId: string | null;
  /** The member's name, «In comune» or «Senza intestatario». */
  label: string;
  /** Net value of the group's held assets in EUR (a loan counts negative). */
  value: number;
  /** Share of the net total, 0-100 (negative when the group is a net debt); `null` without a positive total. */
  sharePct: number | null;
  /** Held assets in the group (accounts, instruments and loans alike). */
  assetCount: number;
}

export interface OwnershipSummary {
  /** Members by value (largest first), then «In comune», then «Senza intestatario» — groups holding something only. */
  rows: OwnershipRow[];
  /** The net total every share is measured on: the held assets' values, debts included. */
  total: number;
  /** Held assets, every group counted. */
  assetCount: number;
  /** Whether any held asset names a person — the tile exists only then (a household with no owner set sees nothing new). */
  hasOwners: boolean;
}

/**
 * The household's wealth by owner. Held assets only (`quantity > 0`; a repaid loan or a sold
 * position is nobody's), each in the group `resolveAssetOwnerId` names; the shares are of the NET
 * total, so the rows add up to the Panoramica's net worth.
 */
export function summarizeOwnership(
  assets: readonly Asset[],
  members: readonly FamilyMember[],
  valueOf: (asset: Asset) => number,
): OwnershipSummary {
  const groups = new Map<string, { value: number; assetCount: number }>();
  const known = new Map(members.map((member) => [member.id, member.name]));
  let total = 0;
  let assetCount = 0;

  for (const asset of assets) {
    if (!(asset.quantity > 0)) continue;
    const ownerId = resolveAssetOwnerId(asset, assets);
    const key = ownerId === null ? OWNER_FILTER_COMMON : known.has(ownerId) ? ownerId : OWNER_FILTER_UNASSIGNED;
    const value = valueOf(asset);
    const group = groups.get(key) ?? { value: 0, assetCount: 0 };
    group.value += value;
    group.assetCount += 1;
    groups.set(key, group);
    total += value;
    assetCount += 1;
  }

  const share = (value: number) => (total > 0 ? (value / total) * 100 : null);
  const row = (key: string, kind: OwnershipRowKind, memberId: string | null, label: string): OwnershipRow | null => {
    const group = groups.get(key);
    if (!group || group.assetCount === 0) return null;
    return { key, kind, memberId, label, value: group.value, sharePct: share(group.value), assetCount: group.assetCount };
  };

  const memberRows = members
    .map((member) => row(member.id, 'member', member.id, member.name))
    .filter((r): r is OwnershipRow => r !== null)
    .sort((a, b) => b.value - a.value);
  const common = row(OWNER_FILTER_COMMON, 'common', null, OWNER_COMMON_LABEL);
  const unassigned = row(OWNER_FILTER_UNASSIGNED, 'unassigned', null, OWNER_UNASSIGNED_LABEL);
  const rows = [...memberRows, ...(common ? [common] : []), ...(unassigned ? [unassigned] : [])];

  return { rows, total, assetCount, hasOwners: rows.some((r) => r.kind !== 'common') };
}

// ─── The Strumenti filter ─────────────────────────────────────────────────────

/** «Tutti · In comune · {members…}», plus «Senza intestatario» only when such an asset exists — the Movimenti filter's shape. */
export function listAssetOwnerFilterOptions(assets: readonly Asset[], members: readonly FamilyMember[]): OwnerFilterOption[] {
  const options: OwnerFilterOption[] = [
    { value: OWNER_FILTER_ALL, label: 'Tutti' },
    { value: OWNER_FILTER_COMMON, label: OWNER_COMMON_LABEL },
    ...members.map((member) => ({ value: member.id, label: member.name })),
  ];
  const knownIds = new Set(members.map((member) => member.id));
  if (assets.some((asset) => {
    const ownerId = resolveAssetOwnerId(asset, assets);
    return ownerId !== null && !knownIds.has(ownerId);
  })) {
    options.push({ value: OWNER_FILTER_UNASSIGNED, label: OWNER_UNASSIGNED_LABEL });
  }
  return options;
}

/** Whether an asset passes the owner filter; `all` passes everything. */
export function matchesAssetOwnerFilter(asset: Asset, assets: readonly Asset[], filter: string, knownIds: ReadonlySet<string>): boolean {
  if (filter === OWNER_FILTER_ALL) return true;
  const ownerId = resolveAssetOwnerId(asset, assets);
  switch (filter) {
    case OWNER_FILTER_COMMON:
      return ownerId === null;
    case OWNER_FILTER_UNASSIGNED:
      return ownerId !== null && !knownIds.has(ownerId);
    default:
      return ownerId === filter;
  }
}

/** The name the row prints under an owned asset; `null` for a shared one (the default stays silent), the orphan's word for a deleted member. */
export function resolveAssetOwnerLabel(asset: Asset, assets: readonly Asset[], memberNames: ReadonlyMap<string, string>): string | null {
  const ownerId = resolveAssetOwnerId(asset, assets);
  if (ownerId === null) return null;
  return memberNames.get(ownerId) ?? OWNER_UNASSIGNED_LABEL;
}
