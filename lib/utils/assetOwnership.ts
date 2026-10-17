/**
 * «Intestatario» — whose each asset is, and how the household's wealth splits by person
 * (owner, 2026-10-17; per QUOTA since the same day). Pure and SDK-free: the Panoramica's server
 * builder, the Patrimonio page and the Strumenti filter all read it, with `calculateAssetValue`
 * INJECTED as `valueOf` (the module must stay importable without the Firebase chain, like
 * `allocationUtils`).
 *
 * The rules, each the owner's call of that day:
 *  - `Asset.ownerShares` is the list member → UNITS (quote of an instrument, euro of an account,
 *    a property or a loan — lib/utils/assetSlice.ts); the units are the primary memory, the
 *    percentage is derived on today's quantity. `Asset.ownerMemberId` names who takes the REST —
 *    every unit the list does not name, the ones a trade adds included; absent, the rest is
 *    «IN COMUNE» (the form's «Nessuna quota in comune» off). A document with `ownerMemberId` and
 *    no `ownerShares` — every one written before the quotas — is the whole asset to one member:
 *    no migration, the exception is marked.
 *  - A pension fund's owner IS `pensionFundDetails.familyMemberId`, whole — one field, never two.
 *  - A loan that finances a property follows that property's FRACTIONS (a mortgage is as shared
 *    or as personal as the house, in the same proportions); a personal loan has its own list. A
 *    debt counts in its owner's group with its NEGATIVE value, so each group is net.
 *  - Units past the quantity (a sale, a value typed lower) are DECLARED («quote da
 *    riassegnare»), never rescaled in silence: the asset's value is still split by the stored
 *    proportions so the tile adds up to the net worth, and `needsReassignment` says the stored
 *    quotas no longer fit.
 *  - An id whose member was deleted is «Senza intestatario» (the Divisione's word), a group of
 *    its own: never folded into «In comune», so the stale datum is seen and fixed.
 *  - A credit card in the red is a debt its owner holds: the gate is «balance ≠ 0», not
 *    «quantity > 0» (the owner's P.S. of 2026-10-17: a card named to a person did not lower
 *    their share).
 */

import { isLoanAsset, type Asset, type FamilyMember } from '@/types/assets';
import { SPLIT_UNASSIGNED_LABEL } from '@/lib/utils/expenseSplitSummary';
import { OWNER_FILTER_ALL, OWNER_FILTER_COMMON, OWNER_FILTER_UNASSIGNED, type OwnerFilterOption } from '@/lib/utils/movementsOwnerFilter';
import { sliceBase, sliceUnit, sliceUnitLabel, summarizeSlices, SLICE_UNITS_EPSILON, type SliceBudget, type SliceUnit } from '@/lib/utils/assetSlice';
import { cachedFormatCurrencyEUR, formatNumberIt } from '@/lib/utils/formatters';

/** The shared group's label — the same words the expense form and the Movimenti filter use. */
export const OWNER_COMMON_LABEL = 'In comune';
export const OWNER_UNASSIGNED_LABEL = SPLIT_UNASSIGNED_LABEL;
/** The declaration under an asset whose stored units no longer fit its quantity. */
export const REASSIGN_LABEL = 'quote da riassegnare';

/** One owner's part of an asset: `memberId` null for the shared part, `fraction` 0-1 of the asset today. */
export interface OwnerSlice {
  memberId: string | null;
  fraction: number;
  /** The units behind the fraction, as stored (the rest's computed); null for a derived owner (a pension fund, a mortgage). */
  units: number | null;
}

export interface AssetOwnership {
  /** Every part with a name: each member once, the shared rest last when it is more than nothing. Fractions sum to 1 on a held asset. */
  slices: OwnerSlice[];
  /** How the owner is known: typed on this asset, the whole of it to one member or in comune, or derived from another document. */
  source: 'shares' | 'whole' | 'pensionFund' | 'mortgage';
  /** The typed units against the quantity (null unless `source` is `shares`). */
  budget: SliceBudget | null;
  /** The stored units are more than the asset has: declared on the row and on the tile. */
  needsReassignment: boolean;
  unit: SliceUnit;
}

/**
 * The ONE resolution of whose an asset is. A pension fund answers with its Previdenza member;
 * a mortgage with its property's fractions (the property looked up in `assets`; a financed asset
 * no longer there leaves the loan to its own fields); everything else with its `ownerShares` and
 * the rest to `ownerMemberId`, or the whole asset to `ownerMemberId` when nothing is typed.
 */
export function resolveAssetOwnership(asset: Asset, assets: readonly Asset[]): AssetOwnership {
  const unit = sliceUnit(asset);
  if (asset.type === 'pensionFund') {
    return { slices: [{ memberId: asset.pensionFundDetails?.familyMemberId || null, fraction: 1, units: null }], source: 'pensionFund', budget: null, needsReassignment: false, unit };
  }
  if (isLoanAsset(asset) && asset.financedAssetId) {
    const financed = assets.find((candidate) => candidate.id === asset.financedAssetId);
    if (financed) {
      const property = resolveAssetOwnership(financed, assets);
      return { slices: property.slices.map((slice) => ({ ...slice, units: null })), source: 'mortgage', budget: null, needsReassignment: false, unit };
    }
  }

  const typed = mergeShares(asset.ownerShares ?? []);
  const rest = asset.ownerMemberId || null;
  if (typed.length === 0) {
    return { slices: [{ memberId: rest, fraction: 1, units: null }], source: 'whole', budget: null, needsReassignment: false, unit };
  }

  const base = sliceBase(asset.quantity);
  const budget = summarizeSlices(typed.map((share) => ({ units: share.units })), asset.quantity);
  const typedUnits = typed.reduce((sum, share) => sum + share.units, 0);
  // Over the quantity the stored proportions still split the whole asset (the tile adds up);
  // the overflow is declared, not absorbed.
  const divisor = budget.needsReassignment ? typedUnits : base;
  const slices: OwnerSlice[] = typed.map((share) => ({
    memberId: share.memberId,
    fraction: divisor > 0 ? share.units / divisor : 0,
    units: share.units,
  }));
  if (!budget.needsReassignment && budget.freeUnits > SLICE_UNITS_EPSILON) {
    slices.push({ memberId: rest, fraction: base > 0 ? budget.freeUnits / base : 0, units: budget.freeUnits });
  }
  return { slices, source: 'shares', budget, needsReassignment: budget.needsReassignment, unit };
}

/** The typed rows with a positive count, one per member (a member named twice is summed). */
function mergeShares(shares: readonly { memberId: string; units: number }[]): { memberId: string; units: number }[] {
  const byMember = new Map<string, number>();
  for (const share of shares) {
    if (!share.memberId || !(share.units > 0)) continue;
    byMember.set(share.memberId, (byMember.get(share.memberId) ?? 0) + share.units);
  }
  return [...byMember].map(([memberId, units]) => ({ memberId, units }));
}

/** Whether the form offers the quotas: a pension fund and a linked mortgage derive their owner. */
export function hasOwnOwnerField(asset: Pick<Asset, 'type' | 'financedAssetId'>): boolean {
  if (asset.type === 'pensionFund') return false;
  return !(isLoanAsset(asset) && !!asset.financedAssetId);
}

/** A holding the Intestatari count: something is there, a debt included (a card in the red, a loan). */
export function isOwnedHolding(asset: Pick<Asset, 'quantity'>): boolean {
  return asset.quantity !== 0;
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
  /** Net value of the group's parts in EUR (a loan counts negative). */
  value: number;
  /** Share of the net total, 0-100 (negative when the group is a net debt); `null` without a positive total. */
  sharePct: number | null;
  /** Assets the group holds a part of — a split asset counts in every row that has a quota of it (owner, 2026-10-17). */
  assetCount: number;
}

export interface OwnershipSummary {
  /** Members by value (largest first), then «In comune», then «Senza intestatario» — groups holding something only. */
  rows: OwnershipRow[];
  /** The net total every share is measured on: the held assets' values, debts included. */
  total: number;
  /** Distinct held assets, every group counted once. */
  assetCount: number;
  /** Whether any held asset names a person — the tile exists only then (a household with no owner set sees nothing new). */
  hasOwners: boolean;
  /** The held assets whose stored quotas no longer fit their quantity — the tile's warning footer. */
  reassign: { assetId: string; name: string }[];
}

/**
 * The household's wealth by owner. Held assets only (`isOwnedHolding`; a repaid loan or a sold
 * position is nobody's), each split by the parts `resolveAssetOwnership` names; the shares are
 * of the NET total, so the rows add up to the Panoramica's net worth.
 */
export function summarizeOwnership(
  assets: readonly Asset[],
  members: readonly FamilyMember[],
  valueOf: (asset: Asset) => number,
): OwnershipSummary {
  const groups = new Map<string, { value: number; assetCount: number }>();
  const known = new Map(members.map((member) => [member.id, member.name]));
  const reassign: OwnershipSummary['reassign'] = [];
  let total = 0;
  let assetCount = 0;

  for (const asset of assets) {
    if (!isOwnedHolding(asset)) continue;
    const ownership = resolveAssetOwnership(asset, assets);
    const value = valueOf(asset);
    for (const slice of ownership.slices) {
      if (!(slice.fraction > 0)) continue;
      const key = slice.memberId === null ? OWNER_FILTER_COMMON : known.has(slice.memberId) ? slice.memberId : OWNER_FILTER_UNASSIGNED;
      const group = groups.get(key) ?? { value: 0, assetCount: 0 };
      group.value += value * slice.fraction;
      group.assetCount += 1;
      groups.set(key, group);
    }
    if (ownership.needsReassignment) reassign.push({ assetId: asset.id, name: asset.name });
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

  return { rows, total, assetCount, hasOwners: rows.some((r) => r.kind !== 'common'), reassign };
}

// ─── The Strumenti filter ─────────────────────────────────────────────────────

/** The ids an asset names, whatever its quantity (the filter is about who is named, the summary about what is worth). */
function namedOwnerIds(asset: Asset, assets: readonly Asset[]): (string | null)[] {
  return resolveAssetOwnership(asset, assets).slices.map((slice) => slice.memberId);
}

/** «Tutti · In comune · {members…}», plus «Senza intestatario» only when such an asset exists — the Movimenti filter's shape. */
export function listAssetOwnerFilterOptions(assets: readonly Asset[], members: readonly FamilyMember[]): OwnerFilterOption[] {
  const options: OwnerFilterOption[] = [
    { value: OWNER_FILTER_ALL, label: 'Tutti' },
    { value: OWNER_FILTER_COMMON, label: OWNER_COMMON_LABEL },
    ...members.map((member) => ({ value: member.id, label: member.name })),
  ];
  const knownIds = new Set(members.map((member) => member.id));
  if (assets.some((asset) => namedOwnerIds(asset, assets).some((id) => id !== null && !knownIds.has(id)))) {
    options.push({ value: OWNER_FILTER_UNASSIGNED, label: OWNER_UNASSIGNED_LABEL });
  }
  return options;
}

/** Whether an asset passes the owner filter: a quota of a member is enough for their filter; `all` passes everything. */
export function matchesAssetOwnerFilter(asset: Asset, assets: readonly Asset[], filter: string, knownIds: ReadonlySet<string>): boolean {
  if (filter === OWNER_FILTER_ALL) return true;
  const ids = namedOwnerIds(asset, assets);
  switch (filter) {
    case OWNER_FILTER_COMMON:
      return ids.includes(null);
    case OWNER_FILTER_UNASSIGNED:
      return ids.some((id) => id !== null && !knownIds.has(id));
    default:
      return ids.includes(filter);
  }
}

/** «100» for quote, «5.000 €» or «1.200 USD» where the unit is money. */
export function formatOwnerUnits(units: number, unit: SliceUnit): string {
  if (unit.kind === 'units') return formatNumberIt(units, Number.isInteger(units) ? 0 : 2);
  if (unit.currency === 'EUR') return cachedFormatCurrencyEUR(units, true);
  return `${formatNumberIt(units, 0)} ${unit.currency}`;
}

/**
 * The owner part of a Strumenti row's sub-line (owner, 2026-10-17; the «di Marco» of the first
 * day kept for an asset wholly one member's — the number would add nothing). A split asset lists
 * every name with its units and the rest: «Marco 100 · Giulia 20 · 30 in comune», the rest's
 * member computed like the others («Marco 40 · Giulia 60»); stored units past the quantity close
 * the line with the declaration: «quote da riassegnare (120 su 100)». `null` for a shared asset —
 * the default stays silent, the exception is named.
 */
export function describeAssetOwnerLabel(asset: Asset, assets: readonly Asset[], memberNames: ReadonlyMap<string, string>): string | null {
  const ownership = resolveAssetOwnership(asset, assets);
  const nameOf = (id: string) => memberNames.get(id) ?? OWNER_UNASSIGNED_LABEL;
  if (ownership.source !== 'shares') {
    const [whole] = ownership.slices;
    if (!whole || whole.memberId === null) return null;
    const name = nameOf(whole.memberId);
    return name === OWNER_UNASSIGNED_LABEL ? name.toLowerCase() : `di ${name}`;
  }
  const parts = ownership.slices.map((slice) => {
    const units = formatOwnerUnits(slice.units ?? 0, ownership.unit);
    return slice.memberId === null ? `${units} in comune` : `${nameOf(slice.memberId)} ${units}`;
  });
  if (ownership.needsReassignment && ownership.budget) {
    const label = sliceUnitLabel(ownership.unit);
    parts.push(`${REASSIGN_LABEL} (${formatOwnerUnits(ownership.budget.assignedUnits, ownership.unit)} su ${formatOwnerUnits(sliceBase(asset.quantity), ownership.unit)}${ownership.unit.kind === 'units' ? ` ${label}` : ''})`);
  }
  return parts.join(' · ');
}
