/**
 * The money half of an expense save, as ONE Firestore transaction writes it with the rows
 * (lib/services/expenseService.ts, since 2026-10-30): given the accounts and the loans as read
 * inside the transaction, what each asset document becomes. Pure, so the arithmetic is tested
 * without Firestore; the service only reads, decides here and commits.
 *
 * Before that day a save was three to five writes in series (the fee, the row, the balances, the
 * debt), and a connection lost between two of them left a row saved with its account unmoved, or
 * a loan repaid twice. Now the row, its fee, the accounts and the loan are written together or not
 * at all.
 */

import { roundToCents } from '@/lib/utils/cents';
import { netBalanceEffects, type BalanceEffect } from '@/lib/utils/cashSettlement';
import {
  debtBalanceField,
  debtGivenBackBy,
  loanDebtOf,
  planDebtEdit,
  splitInstalment,
  type DebtAssetFields,
  type InstalmentSplit,
  type LoanDebt,
} from '@/lib/utils/mortgageRepayment';
import type { Expense } from '@/types/expenses';

/** An asset document as the transaction read it: its debt fields and its balance. */
export type ReadAsset = DebtAssetFields;

/** The fields one asset document is updated with (`updatedAt` is the service's). */
export interface AssetWrite {
  assetId: string;
  fields: Record<string, number>;
}

/** The ids the transaction must read: every account an effect moves and every loan touched, once each. */
export function assetIdsTouched(effects: BalanceEffect[], loanIds: Iterable<string | undefined>): string[] {
  const ids = new Set<string>();
  for (const { assetId } of effects) ids.add(assetId);
  for (const id of loanIds) if (id) ids.add(id);
  return [...ids];
}

/** The loans among the read assets, as `planDebtRepayments` reads them. A loan not found is left out (it repays nothing). */
export function loanDebtsOf(assets: Map<string, ReadAsset>, loanIds: Iterable<string | undefined>): Map<string, LoanDebt> {
  const debts = new Map<string, LoanDebt>();
  for (const id of loanIds) {
    const asset = id ? assets.get(id) : undefined;
    if (id && asset) debts.set(id, loanDebtOf(asset));
  }
  return debts;
}

/**
 * What the assets become: each account moved by its net effect, rounded to the cent (as
 * `updateCashAssetBalancesAtomic`), each loan set to its new debt on the field its type keeps it in
 * (`debtBalanceField`). An asset that was not found is skipped, as before: the row is still saved.
 */
export function assetWritesOf(assets: Map<string, ReadAsset>, effects: BalanceEffect[], debts: Map<string, number>): AssetWrite[] {
  const writes = new Map<string, Record<string, number>>();
  for (const { assetId, delta } of netBalanceEffects(effects)) {
    const asset = assets.get(assetId);
    if (!asset) continue;
    writes.set(assetId, { quantity: roundToCents(asset.quantity + delta) });
  }
  for (const [assetId, debt] of debts) {
    const asset = assets.get(assetId);
    if (!asset) continue;
    writes.set(assetId, { ...(writes.get(assetId) ?? {}), [debtBalanceField(asset)]: debt });
  }
  return [...writes.entries()].map(([assetId, fields]) => ({ assetId, fields }));
}

/** Each loan's debt once the deleted rows have given back the principal they had repaid. */
export function debtsAfterGivingBack(
  rows: Pick<Expense, 'debtAssetId' | 'debtPrincipalRepaid' | 'balancePending'>[],
  loans: Map<string, LoanDebt>
): Map<string, number> {
  const debts = new Map<string, number>();
  for (const [assetId, principal] of debtGivenBackBy(rows)) {
    const loan = loans.get(assetId);
    if (loan) debts.set(assetId, roundToCents(loan.debt + principal));
  }
  return debts;
}

type DebtEditBefore = Pick<Expense, 'type' | 'amount' | 'debtAssetId' | 'isDebtPayoff' | 'debtPrincipalRepaid' | 'balancePending'>;
type DebtEditAfter = Pick<Expense, 'type' | 'amount' | 'debtAssetId' | 'isDebtPayoff'> & { date: Date };

/** The loans an edit has to read: the old one it gives back to, the new one it repays now. */
export function loanIdsOfEdit(before: DebtEditBefore, after: DebtEditAfter, now: Date): string[] {
  const plan = planDebtEdit(before, after, now);
  if (plan.unchanged) return [];
  return [...new Set([plan.giveBack?.assetId, plan.applyNow ? after.debtAssetId : undefined].filter((id): id is string => !!id))];
}

/** What an edit writes on the loans and on the row's stamp. */
export interface DebtEditWrites {
  debts: Map<string, number>;
  /** Whether the row's `debtPrincipalRepaid`/`debtInterestPaid` are written (or deleted, `stamp` null). */
  touchesStamp: boolean;
  stamp: InstalmentSplit | null;
}

/**
 * What an edit does to the debt (`planDebtEdit`): the principal the old row had repaid given
 * back, and the edited row — when it has happened and still repays a loan — split again on the
 * debt as it now stands. An edit that touches nothing the repayment depends on writes nothing; a
 * stamp left on a row that no longer repays anything is deleted.
 */
export function planDebtEditWrites(before: DebtEditBefore, after: DebtEditAfter, now: Date, loans: Map<string, LoanDebt>): DebtEditWrites {
  const plan = planDebtEdit(before, after, now);
  if (plan.unchanged) return { debts: new Map(), touchesStamp: false, stamp: null };
  if (!plan.giveBack && !plan.applyNow) {
    return { debts: new Map(), touchesStamp: before.debtPrincipalRepaid !== undefined, stamp: null };
  }

  // The old repayment given back first, so the new one is split on the debt it really faces.
  const debts = new Map<string, number>();
  if (plan.giveBack && loans.has(plan.giveBack.assetId)) {
    debts.set(plan.giveBack.assetId, roundToCents(loans.get(plan.giveBack.assetId)!.debt + plan.giveBack.principal));
  }
  let stamp: InstalmentSplit | null = null;
  if (plan.applyNow && after.debtAssetId && loans.has(after.debtAssetId)) {
    const loan = loans.get(after.debtAssetId)!;
    const debt = debts.get(after.debtAssetId) ?? loan.debt;
    stamp = splitInstalment(after.amount, debt, loan.annualRatePct, after.isDebtPayoff === true);
    debts.set(after.debtAssetId, roundToCents(debt - stamp.principal));
  }
  return { debts, touchesStamp: true, stamp };
}
