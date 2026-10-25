/**
 * Fondo pensione — pure roll-ups over the recorded `PensionContribution` facts.
 *
 * Contributions live in their own Firestore collection, one document per dated event.
 * This module is the bridge between those stored facts and the two consumers that need them
 * aggregated per year:
 *   - `derivePensionDeductibleByYear` feeds `PensionDeductionInput.deductibleContribByYear`, i.e. the
 *     multi-year fold in `lib/utils/pensionDeduction.ts`.
 *   - `derivePensionContributionsByYearAndNature` powers the "versato per natura" recap card,
 *     which must show TFR too even though it is not deductible.
 *
 * Both group by `taxYear` (the year of competence for the deduction), NOT by the calendar year of
 * `date`: a contribution paid in January can legitimately be attributed to the previous tax year, and
 * the deduction ceiling is consumed in the year of competence.
 *
 * Zero Firebase imports — this file is a pure function of its input array (invariant #4).
 */

import {
  DEDUCTIBLE_PENSION_NATURES,
  type PensionContribution,
  type PensionContributionNature,
} from '@/types/pension';

/**
 * Sum the DEDUCTIBLE contributions (voluntary + employer; TFR is excluded by law) per tax year.
 *
 * Returns a `taxYear -> EUR` map, ready to be passed straight to `computePensionDeductionState`.
 * Years with no deductible contribution are simply absent — the fold treats a missing year as 0.
 *
 * Amounts are stored as positive magnitudes; `Math.abs` is a defensive normalisation for records
 * written by hand or by a future import path.
 */
export function derivePensionDeductibleByYear(
  contributions: PensionContribution[]
): Record<number, number> {
  const byYear: Record<number, number> = {};

  for (const contribution of contributions) {
    if (!DEDUCTIBLE_PENSION_NATURES.includes(contribution.source)) continue;
    byYear[contribution.taxYear] =
      (byYear[contribution.taxYear] ?? 0) + Math.abs(contribution.amount);
  }

  return byYear;
}

/**
 * Break contributions down per tax year AND per nature — all three natures, TFR included.
 *
 * Returns `taxYear -> { tfr, voluntary, employer }` with every nature present (0 when nothing was
 * paid), so the recap can render a stable three-row breakdown without null checks. A year appears in
 * the map only if it has at least one contribution.
 */
export function derivePensionContributionsByYearAndNature(
  contributions: PensionContribution[]
): Record<number, Record<PensionContributionNature, number>> {
  const byYear: Record<number, Record<PensionContributionNature, number>> = {};

  for (const contribution of contributions) {
    const year = contribution.taxYear;
    if (!byYear[year]) {
      byYear[year] = { tfr: 0, voluntary: 0, employer: 0 };
    }
    byYear[year][contribution.source] += Math.abs(contribution.amount);
  }

  return byYear;
}

/**
 * The tax years the Previdenza year axis can offer, newest first.
 *
 * `currentYear` is always included even when nothing has been recorded against it yet: the selector
 * opens on "this year", and a user who has not registered January's contribution would otherwise
 * land on last year's plafond and IRPEF figures without any signal that the axis had moved.
 *
 * Years come from `taxYear` (the year of competence), the same axis every other roll-up in this
 * module groups by — a contribution paid in January against the previous year belongs to that
 * previous year here too.
 */
export function derivePensionContributionYears(
  contributions: PensionContribution[],
  currentYear: number
): number[] {
  const years = new Set<number>([currentYear]);

  for (const contribution of contributions) {
    years.add(contribution.taxYear);
  }

  return [...years].sort((a, b) => b - a);
}

/**
 * Resolve which tax year the Previdenza view is actually showing.
 *
 * The selection is held as "what the user picked, or nothing yet", never as a copy of the derived
 * axis — so no effect has to keep the two in sync. This function is what makes that safe: a
 * selection the axis no longer offers falls back to `currentYear` instead of leaving the page on a
 * year with no data behind it. That happens for real — deleting the last contribution of a year
 * removes that year from `derivePensionContributionYears`, and the previously selected year would
 * otherwise render an empty chapter with a selector that no longer highlights anything.
 *
 * `currentYear` is always a safe fallback because `derivePensionContributionYears` guarantees it is
 * present in the axis.
 */
export function resolveActivePensionYear(
  selectedYear: number | null,
  availableYears: number[],
  currentYear: number
): number {
  if (selectedYear !== null && availableYears.includes(selectedYear)) return selectedYear;
  return currentYear;
}

/**
 * The subcategory of the transfer category that a voluntary contribution's transfer entry takes
 * (2026-10-25): the first whose name speaks of a pension («Pensione integrativa», «Fondo
 * pensione», «Previdenza complementare»), ignoring case and accents. None → the entry stays on the
 * bare category, as before. Matched by name because the subcategory is the user's own: the app
 * creates none, and a renamed one keeps working as long as it still says what it is.
 */
export function findPensionTransferSubCategory<T extends { name: string }>(subCategories: T[]): T | undefined {
  const normalise = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return subCategories.find((sub) => /pension|previdenz/.test(normalise(sub.name)));
}
