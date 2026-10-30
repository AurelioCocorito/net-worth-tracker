/**
 * Debt Repayment Service — commits what lib/utils/mortgageRepayment.ts decides: a `debt` row linked
 * to a loan lowers its outstanding principal by the instalment's principal, on the row's date.
 *
 * What is left here is the give-back of the import's undo (`reverseAppliedBalances`). Since
 * 2026-10-30 the expense form's create, edit and delete move the debt inside the row's own
 * transaction (lib/services/expenseService.ts, lib/utils/expenseMoneyWrites.ts); the rows still to
 * come are settled on their day by the server (lib/server/cashSettlement.ts), with the same pure
 * plan.
 *
 * Where the debt lives on the document (a loan's `quantity`, a legacy property's `outstandingDebt`)
 * is `debtBalanceField`'s knowledge, never spelled here.
 */

import { doc, runTransaction, type DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { invalidateDashboardOverviewSummary } from '@/lib/services/dashboardOverviewInvalidation';
import { debtBalanceField, debtGivenBackBy, loanDebtOf, type DebtAssetFields } from '@/lib/utils/mortgageRepayment';
import type { Expense } from '@/types/expenses';

const ASSETS_COLLECTION = 'assets';

const toCents = (value: number) => Math.round(value * 100) / 100;

function debtFieldsOf(data: DocumentData): DebtAssetFields {
  return data as DebtAssetFields;
}

/** The update that sets an asset's debt to `debt`, on the field its type keeps it in. */
function debtUpdate(asset: DebtAssetFields, debt: number): Record<string, unknown> {
  return { [debtBalanceField(asset)]: debt, updatedAt: new Date() };
}

/**
 * Give back to each loan the principal the rows had repaid — every delete path calls this
 * (through `reverseAppliedBalances`) before removing the rows. A row still waiting for its date
 * repaid nothing and gives nothing back. Returns true when a debt moved.
 */
export async function reverseDebtRepayments(rows: Pick<Expense, 'debtAssetId' | 'debtPrincipalRepaid' | 'balancePending'>[]): Promise<boolean> {
  const givenBack = debtGivenBackBy(rows);
  if (givenBack.size === 0) return false;
  const assetIds = [...givenBack.keys()];
  let userId: string | undefined;

  await runTransaction(db, async (tx) => {
    const snaps = await Promise.all(assetIds.map((id) => tx.get(doc(db, ASSETS_COLLECTION, id))));
    snaps.forEach((snap, index) => {
      if (!snap.exists()) return;
      userId ??= snap.data().userId as string;
      const fields = debtFieldsOf(snap.data());
      tx.update(snap.ref, debtUpdate(fields, toCents(loanDebtOf(fields).debt + givenBack.get(assetIds[index])!)));
    });
  });

  if (userId) await invalidateDashboardOverviewSummary(userId, 'debt_repayment_reversed');
  return true;
}
