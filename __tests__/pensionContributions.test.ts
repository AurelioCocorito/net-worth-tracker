import { describe, it, expect } from 'vitest';

import {
  derivePensionDeductibleByYear,
  derivePensionContributionsByYearAndNature,
  derivePensionContributionYears,
  resolveActivePensionYear,
  findPensionTransferSubCategory,
} from '@/lib/utils/pensionContributions';
import type { ContributionSource, PensionContribution } from '@/types/pension';

/**
 * Build a contribution record with only the fields the roll-ups read; everything else is filler.
 * `taxYear` defaults to the calendar year of `date` (the service's own default).
 */
function makeContribution(
  source: ContributionSource,
  amount: number,
  taxYear: number,
  overrides: Partial<PensionContribution> = {}
): PensionContribution {
  return {
    id: `contribution-${taxYear}-${source}-${amount}`,
    userId: 'user-1',
    assetId: 'fund-1',
    source,
    amount,
    date: new Date(taxYear, 5, 15),
    taxYear,
    deductible: source !== 'tfr',
    createdAt: new Date(taxYear, 5, 15),
    ...overrides,
  };
}

describe('derivePensionDeductibleByYear', () => {
  it('should return an empty map for no contributions', () => {
    expect(derivePensionDeductibleByYear([])).toEqual({});
  });

  it('should exclude TFR from the deductible base', () => {
    // Arrange: only TFR was conferred in 2026 — deductible by law is zero.
    const contributions = [makeContribution('tfr', 2000, 2026)];

    // Act
    const byYear = derivePensionDeductibleByYear(contributions);

    // Assert: the year does not appear at all (a missing year reads as 0 in the tax fold).
    expect(byYear).toEqual({});
  });

  it('should sum voluntary and employer contributions within the same tax year', () => {
    const contributions = [
      makeContribution('voluntary', 1200, 2026),
      makeContribution('employer', 800, 2026),
      makeContribution('tfr', 2500, 2026),
    ];

    expect(derivePensionDeductibleByYear(contributions)).toEqual({ 2026: 2000 });
  });

  it('should keep tax years separate', () => {
    const contributions = [
      makeContribution('voluntary', 1000, 2025),
      makeContribution('voluntary', 1500, 2026),
      makeContribution('employer', 500, 2026),
    ];

    expect(derivePensionDeductibleByYear(contributions)).toEqual({ 2025: 1000, 2026: 2000 });
  });

  it('should group by taxYear, not by the calendar year of the payment date', () => {
    // A January 2027 payroll instalment booked to the 2026 tax year (cash-principle straddle).
    const contributions = [
      makeContribution('voluntary', 300, 2026, { date: new Date(2027, 0, 10) }),
      makeContribution('voluntary', 700, 2026),
    ];

    expect(derivePensionDeductibleByYear(contributions)).toEqual({ 2026: 1000 });
  });

  it('should normalise a negatively-signed amount to its magnitude', () => {
    const contributions = [makeContribution('voluntary', -500, 2026)];

    expect(derivePensionDeductibleByYear(contributions)).toEqual({ 2026: 500 });
  });
});

describe('derivePensionContributionsByYearAndNature', () => {
  it('should return an empty map for no contributions', () => {
    expect(derivePensionContributionsByYearAndNature([])).toEqual({});
  });

  it('should split a year across all three natures, TFR included', () => {
    const contributions = [
      makeContribution('tfr', 2500, 2026),
      makeContribution('voluntary', 1200, 2026),
      makeContribution('employer', 800, 2026),
    ];

    expect(derivePensionContributionsByYearAndNature(contributions)).toEqual({
      2026: { tfr: 2500, voluntary: 1200, employer: 800 },
    });
  });

  it('should default the untouched natures of a year to zero', () => {
    const contributions = [makeContribution('tfr', 2500, 2026)];

    expect(derivePensionContributionsByYearAndNature(contributions)).toEqual({
      2026: { tfr: 2500, voluntary: 0, employer: 0 },
    });
  });

  it('should accumulate repeated contributions of the same nature', () => {
    const contributions = [
      makeContribution('voluntary', 100, 2026, { id: 'a' }),
      makeContribution('voluntary', 250, 2026, { id: 'b' }),
    ];

    expect(derivePensionContributionsByYearAndNature(contributions)[2026]).toEqual({
      tfr: 0,
      voluntary: 350,
      employer: 0,
    });
  });

  it('should build one independent bucket per tax year', () => {
    const contributions = [
      makeContribution('tfr', 2000, 2025),
      makeContribution('employer', 600, 2026),
    ];

    expect(derivePensionContributionsByYearAndNature(contributions)).toEqual({
      2025: { tfr: 2000, voluntary: 0, employer: 0 },
      2026: { tfr: 0, voluntary: 0, employer: 600 },
    });
  });
});

describe('derivePensionContributionYears', () => {
  it('should offer the current year even with no contribution recorded against it', () => {
    // Arrange: the user has not registered anything for 2026 yet.
    const contributions = [makeContribution('voluntary', 1000, 2025)];

    // Act
    const years = derivePensionContributionYears(contributions, 2026);

    // Assert: 2026 leads, so the selector opens on "this year" instead of last year's plafond.
    expect(years).toEqual([2026, 2025]);
  });

  it('should return only the current year when there are no contributions at all', () => {
    expect(derivePensionContributionYears([], 2026)).toEqual([2026]);
  });

  it('should de-duplicate years and sort them newest first', () => {
    const contributions = [
      makeContribution('tfr', 2000, 2024),
      makeContribution('voluntary', 500, 2026),
      makeContribution('employer', 300, 2024),
      makeContribution('voluntary', 700, 2025),
    ];

    expect(derivePensionContributionYears(contributions, 2026)).toEqual([2026, 2025, 2024]);
  });

  it('should group by taxYear, not by the calendar year of the payment date', () => {
    // Arrange: paid in January 2026 but attributed to the 2025 tax year (the deduction ceiling is
    // consumed in the year of competence).
    const contributions = [
      makeContribution('voluntary', 900, 2025, { date: new Date(2026, 0, 12) }),
    ];

    // Act
    const years = derivePensionContributionYears(contributions, 2026);

    // Assert: 2025 is offered because of `taxYear`; the January date never creates a 2026 entry of
    // its own beyond the always-present current year.
    expect(years).toEqual([2026, 2025]);
  });
});

describe('resolveActivePensionYear', () => {
  it('should default to the current year before the user has picked anything', () => {
    expect(resolveActivePensionYear(null, [2026, 2025], 2026)).toBe(2026);
  });

  it('should honour a selection the axis still offers', () => {
    expect(resolveActivePensionYear(2025, [2026, 2025], 2026)).toBe(2025);
  });

  it('should fall back to the current year when the selected year leaves the axis', () => {
    // Arrange: 2024 was selected, then its last contribution was deleted — the axis no longer
    // offers it, and staying there would render an empty chapter under a selector highlighting
    // nothing.
    const availableYears = [2026, 2025];

    // Act
    const activeYear = resolveActivePensionYear(2024, availableYears, 2026);

    // Assert
    expect(activeYear).toBe(2026);
  });

  it('should keep a selected future tax year that the axis genuinely contains', () => {
    // A contribution booked to a future taxYear is the user's own data, not an invalid selection.
    expect(resolveActivePensionYear(2027, [2027, 2026], 2026)).toBe(2027);
  });
});

describe('findPensionTransferSubCategory', () => {
  const sub = (id: string, name: string) => ({ id, name });

  it('should pick the subcategory whose name speaks of a pension, ignoring case and accents', () => {
    const subs = [sub('a', 'Conto comune'), sub('b', 'Pensione integrativa'), sub('c', 'Investimenti')];
    expect(findPensionTransferSubCategory(subs)?.id).toBe('b');
    expect(findPensionTransferSubCategory([sub('d', 'FONDO PENSIONE')])?.id).toBe('d');
    expect(findPensionTransferSubCategory([sub('e', 'Previdenza complementare')])?.id).toBe('e');
  });

  it('should return the first match when several qualify', () => {
    expect(findPensionTransferSubCategory([sub('a', 'Pensione 1'), sub('b', 'Pensione 2')])?.id).toBe('a');
  });

  it('should return undefined when no subcategory names a pension', () => {
    expect(findPensionTransferSubCategory([sub('a', 'Giroconti'), sub('b', 'Risparmio')])).toBeUndefined();
    expect(findPensionTransferSubCategory([])).toBeUndefined();
  });
});
