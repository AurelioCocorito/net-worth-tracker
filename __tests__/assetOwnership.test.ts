/**
 * «Intestatario» (lib/utils/assetOwnership.ts, 2026-10-17): whose each asset is, the household's
 * wealth by owner, the Strumenti filter and the words of the Intestatari tile. Pure, SDK-free —
 * `valueOf` injected. Figures invented and round.
 *
 * Falsified one at a time: the pension fund answering its own `ownerMemberId` (the Previdenza
 * member wins); the mortgage answering its own field (the property's owner wins); a deleted
 * member folded into «In comune» (it is «Senza intestatario»); a loan counted positive (net).
 */

import { describe, expect, it } from 'vitest';
import type { Asset, FamilyMember } from '@/types/assets';
import {
  hasOwnOwnerField,
  listAssetOwnerFilterOptions,
  matchesAssetOwnerFilter,
  OWNER_COMMON_LABEL,
  OWNER_UNASSIGNED_LABEL,
  resolveAssetOwnerId,
  resolveAssetOwnerLabel,
  summarizeOwnership,
} from '@/lib/utils/assetOwnership';
import { describeOwnership, describeOwnershipAnswer, describeOwnershipAside } from '@/lib/utils/patrimonioNarrative';
import { narrativeToText } from '@/lib/utils/narrative';

const asset = (overrides: Partial<Asset> & { id: string }): Asset =>
  ({
    userId: 'u',
    ticker: '',
    name: overrides.id,
    type: 'etf',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 1,
    currentPrice: 1,
    lastPriceUpdate: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  }) as Asset;

const MEMBERS: FamilyMember[] = [
  { id: 'marco', name: 'Marco' },
  { id: 'giulia', name: 'Giulia' },
];

/** A loan is minus its principal, everything else quantity × price — `calculateAssetValue`'s rule. */
const valueOf = (a: Asset) => (a.type === 'loan' ? -a.quantity : a.quantity * a.currentPrice);

const HOUSE = asset({ id: 'house', type: 'realestate', assetClass: 'realestate', quantity: 1, currentPrice: 200_000, ownerMemberId: 'marco' });
const MORTGAGE = asset({ id: 'mortgage', type: 'loan', assetClass: 'realestate', quantity: 80_000, financedAssetId: 'house', ownerMemberId: 'giulia' });
const FUND = asset({ id: 'fund', type: 'pensionFund', assetClass: 'equity', quantity: 30_000, pensionFundDetails: { provider: 'X', familyMemberId: 'giulia' }, ownerMemberId: 'marco' });
const ETF = asset({ id: 'etf', quantity: 50, currentPrice: 1000 });
const CASH = asset({ id: 'cash', type: 'cash', assetClass: 'cash', quantity: 20_000, ownerMemberId: 'giulia' });
const GHOST = asset({ id: 'ghost', type: 'cash', assetClass: 'cash', quantity: 5_000, ownerMemberId: 'deleted' });
const SOLD = asset({ id: 'sold', quantity: 0, ownerMemberId: 'marco' });
const ALL = [HOUSE, MORTGAGE, FUND, ETF, CASH, GHOST, SOLD];

describe('resolveAssetOwnerId — the ONE resolution', () => {
  it('reads the field, derives a pension fund from Previdenza and a mortgage from its property', () => {
    expect(resolveAssetOwnerId(CASH, ALL)).toBe('giulia');
    expect(resolveAssetOwnerId(ETF, ALL)).toBeNull();
    expect(resolveAssetOwnerId(FUND, ALL)).toBe('giulia');
    expect(resolveAssetOwnerId(MORTGAGE, ALL)).toBe('marco');
    // A mortgage whose property is gone falls back to its own field; a personal loan reads its own.
    expect(resolveAssetOwnerId(MORTGAGE, [MORTGAGE])).toBe('giulia');
    expect(resolveAssetOwnerId(asset({ id: 'car', type: 'loan', assetClass: 'cash', quantity: 100 }), ALL)).toBeNull();
  });

  it('offers the field to everything but a pension fund and a linked mortgage', () => {
    expect(hasOwnOwnerField(ETF)).toBe(true);
    expect(hasOwnOwnerField(FUND)).toBe(false);
    expect(hasOwnOwnerField(MORTGAGE)).toBe(false);
    expect(hasOwnOwnerField({ type: 'loan' })).toBe(true);
  });
});

describe('summarizeOwnership — the net worth by owner', () => {
  it('groups the held assets by owner, net of the debts, members first then the shared and the orphaned', () => {
    const summary = summarizeOwnership(ALL, MEMBERS, valueOf);
    // 200.000 − 80.000 (Marco) + 30.000 + 20.000 (Giulia) + 50.000 (common) + 5.000 (ghost) = 225.000
    expect(summary.total).toBe(225_000);
    expect(summary.assetCount).toBe(6);
    expect(summary.hasOwners).toBe(true);
    expect(summary.rows.map((row) => [row.key, row.kind, row.label, row.value, row.assetCount])).toEqual([
      ['marco', 'member', 'Marco', 120_000, 2],
      ['giulia', 'member', 'Giulia', 50_000, 2],
      ['common', 'common', OWNER_COMMON_LABEL, 50_000, 1],
      ['unassigned', 'unassigned', OWNER_UNASSIGNED_LABEL, 5_000, 1],
    ]);
    expect(summary.rows.map((row) => Math.round(row.sharePct ?? -1))).toEqual([53, 22, 22, 2]);
  });

  it('has no owners when every held asset is shared, and no shares without a positive total', () => {
    const shared = summarizeOwnership([ETF, SOLD], MEMBERS, valueOf);
    expect(shared.hasOwners).toBe(false);
    expect(shared.rows.map((row) => row.kind)).toEqual(['common']);
    const underwater = summarizeOwnership([asset({ id: 'car', type: 'loan', assetClass: 'cash', quantity: 100, ownerMemberId: 'marco' })], MEMBERS, valueOf);
    expect(underwater.total).toBe(-100);
    expect(underwater.rows[0].sharePct).toBeNull();
  });
});

describe('the Strumenti filter', () => {
  it('lists Tutti, In comune and the members, plus Senza intestatario only when an orphan exists', () => {
    expect(listAssetOwnerFilterOptions(ALL, MEMBERS).map((option) => option.label)).toEqual(['Tutti', 'In comune', 'Marco', 'Giulia', OWNER_UNASSIGNED_LABEL]);
    expect(listAssetOwnerFilterOptions([ETF, CASH], MEMBERS).map((option) => option.label)).toEqual(['Tutti', 'In comune', 'Marco', 'Giulia']);
  });

  it('matches by the resolved owner — a mortgage under its property\'s owner', () => {
    const known = new Set(MEMBERS.map((member) => member.id));
    expect(ALL.filter((a) => matchesAssetOwnerFilter(a, ALL, 'marco', known)).map((a) => a.id)).toEqual(['house', 'mortgage', 'sold']);
    expect(ALL.filter((a) => matchesAssetOwnerFilter(a, ALL, 'common', known)).map((a) => a.id)).toEqual(['etf']);
    expect(ALL.filter((a) => matchesAssetOwnerFilter(a, ALL, 'unassigned', known)).map((a) => a.id)).toEqual(['ghost']);
    expect(ALL.filter((a) => matchesAssetOwnerFilter(a, ALL, 'all', known))).toHaveLength(ALL.length);
  });

  it('labels an owned row with the name, an orphan with the Divisione\'s word, a shared one with nothing', () => {
    const names = new Map(MEMBERS.map((member) => [member.id, member.name]));
    expect(resolveAssetOwnerLabel(MORTGAGE, ALL, names)).toBe('Marco');
    expect(resolveAssetOwnerLabel(GHOST, ALL, names)).toBe(OWNER_UNASSIGNED_LABEL);
    expect(resolveAssetOwnerLabel(ETF, ALL, names)).toBeNull();
  });
});

describe('the words of the Intestatari tile', () => {
  // Intl puts a no-break space before «€»; the comparison reads plain spaces.
  const plain = (narrative: ReturnType<typeof describeOwnership>) => (narrative ? narrativeToText(narrative).replace(/[  ]/g, ' ') : null);

  it('names each owner with the share the row prints, then the rest in common and the orphans', () => {
    const summary = summarizeOwnership(ALL, MEMBERS, valueOf);
    expect(plain(describeOwnership(summary))).toBe('Il 53% è intestato a Marco, il 22% a Giulia, il resto in comune, il 2% senza intestatario.');
    expect(describeOwnershipAside(summary)).toBe('su 6 asset');
    expect(plain(describeOwnershipAnswer(summary))).toBe('Marco 53%');
  });

  it('articulates on the printed integer and says «Tutto» for a single owner', () => {
    const eight = summarizeOwnership([asset({ id: 'a', quantity: 8, currentPrice: 1, ownerMemberId: 'marco' }), asset({ id: 'b', quantity: 92, currentPrice: 1 })], MEMBERS, valueOf);
    expect(plain(describeOwnership(eight))).toBe("L'8% è intestato a Marco, il resto in comune.");
    const alone = summarizeOwnership([HOUSE], MEMBERS, valueOf);
    expect(plain(describeOwnership(alone))).toBe('Tutto è intestato a Marco.');
    expect(describeOwnership(summarizeOwnership([ETF], MEMBERS, valueOf))).toBeNull();
  });

  it('names a group that is a net debt instead of printing a negative share', () => {
    const summary = summarizeOwnership([HOUSE, asset({ id: 'car', type: 'loan', assetClass: 'cash', quantity: 3000, ownerMemberId: 'giulia' })], MEMBERS, valueOf);
    expect(plain(describeOwnership(summary))).toBe('Il 102% è intestato a Marco, Giulia è in negativo (3000 € di debiti).');
    expect(plain(describeOwnershipAnswer(summary))).toBe('Marco 102%');
  });
});
