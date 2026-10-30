/**
 * Expense Service
 *
 * Manages expense tracking for budgeting and cashflow analysis.
 *
 * Features:
 * - CRUD operations for expenses (create, read, update, delete)
 * - Recurring expenses (monthly or yearly series of fixed/variable/debt entries)
 * - Installment expenses (BNPL - Buy Now Pay Later)
 * - Monthly summaries and statistics with month-over-month comparison
 * - Category and subcategory management integration
 *
 * Amount sign convention:
 * - Expenses (fixed, variable, debt): stored as negative values
 * - Income: stored as positive values
 * - Transfers: stored as positive values (direction encoded by origin/destination asset IDs)
 * This allows simple summing for net cashflow calculations.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
  orderBy,
  limit,
  writeBatch,
  runTransaction,
  deleteField,
  type DocumentReference,
  type DocumentSnapshot,
  type Transaction
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { removeUndefinedDeep as removeUndefinedFields } from '@/lib/utils/firestoreData';
import { invalidateDashboardOverviewSummary } from '@/lib/services/dashboardOverviewInvalidation';
import { needsSignFlip, crossesTransferBoundary } from '@/lib/utils/expenseTypeTransition';
import { buildRecurrenceDates, resolveRecurrenceFrequency } from '@/lib/utils/recurrenceDates';
import { appliedBalanceEffectsOf, editBalanceEffects, hasDatedEffects, repaysDebt, reverseBalanceEffects, selectLinkableOccurrences, settlesLater, type BalanceEffect, type SettlementRow } from '@/lib/utils/cashSettlement';
import { buildExpenseFeeFormData, planExpenseFee, type ExpenseFeeCategory } from '@/lib/utils/expenseFee';
import { debtGivenBackBy, planDebtRepayments, selectDebtLinkableOccurrences, type DebtRow } from '@/lib/utils/mortgageRepayment';
import {
  assetIdsTouched,
  assetWritesOf,
  debtsAfterGivingBack,
  loanDebtsOf,
  loanIdsOfEdit,
  planDebtEditWrites,
  type AssetWrite,
  type ReadAsset,
} from '@/lib/utils/expenseMoneyWrites';
import { reverseAppliedBalances } from '@/lib/services/cashBalanceReconciliation';
import {
  Expense,
  ExpenseFormData,
  ExpenseType
} from '@/types/expenses';

const EXPENSES_COLLECTION = 'expenses';
const ASSETS_COLLECTION = 'assets';

/**
 * Raised by the batch re-typing paths (moveExpensesToCategory,
 * moveExpensesFromSubCategory, updateExpensesType) when a move would cross the
 * transfer boundary with linked expenses: each of those rows touches two cash
 * accounts, so no batch reconciliation of balances is possible. Carries a
 * user-facing message the dialogs surface as-is.
 */
export class TransferBoundaryError extends Error {
  constructor() {
    super(
      'Impossibile convertire in blocco da o verso Trasferimento: ogni voce tocca due conti e i saldi non sarebbero riconciliabili. Modifica le singole voci dal Cashflow.'
    );
    this.name = 'TransferBoundaryError';
  }
}

/**
 * Get all expenses for a specific user
 */
export async function getAllExpenses(userId: string): Promise<Expense[]> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      orderBy('date', 'desc')
    );

    const querySnapshot = await getDocs(q);

    const expenses = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      date: doc.data().date?.toDate() || new Date(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Expense[];

    return expenses;
  } catch (error) {
    console.error('Error getting expenses:', error);
    throw new Error('Failed to fetch expenses');
  }
}

/** The dates of the oldest and of the newest expense of an account. */
export interface ExpenseDateBounds {
  oldest: Date;
  newest: Date;
}

/**
 * The dates of the oldest and of the newest expense — two one-document reads on the
 * `(userId, date)` indexes — or null for an account with no expense at all.
 *
 * What a page that reads a WINDOW of the collection (lib/utils/expenseWindows.ts) still needs
 * to know about the rest of it: which years its period picker can offer, and whether an empty
 * window is an empty period or an empty account.
 */
export async function getExpenseDateBounds(userId: string): Promise<ExpenseDateBounds | null> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    // The `userId` filter is what the rules need on a list, at any size (AGENTS.md § Firestore Queries and the Rules).
    const readEdge = (direction: 'asc' | 'desc') =>
      getDocs(query(expensesRef, where('userId', '==', userId), orderBy('date', direction), limit(1)));
    const [oldest, newest] = await Promise.all([readEdge('asc'), readEdge('desc')]);

    const oldestDate: Date | undefined = oldest.docs[0]?.data().date?.toDate();
    const newestDate: Date | undefined = newest.docs[0]?.data().date?.toDate();
    if (!oldestDate || !newestDate) return null;
    return { oldest: oldestDate, newest: newestDate };
  } catch (error) {
    console.error('Error getting expense date bounds:', error);
    throw new Error('Failed to fetch expense date bounds');
  }
}

/**
 * Get expenses in a date range, both ends included.
 *
 * The reader behind every page that shows a window of the collection (`useExpensesInRange`);
 * the bounds come from lib/utils/expenseWindows.ts, never from `Date.UTC`.
 */
export async function getExpensesByDateRange(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<Expense[]> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('date', '>=', Timestamp.fromDate(startDate)),
      where('date', '<=', Timestamp.fromDate(endDate)),
      orderBy('date', 'desc')
    );

    const querySnapshot = await getDocs(q);

    const expenses = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      date: doc.data().date?.toDate() || new Date(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Expense[];

    return expenses;
  } catch (error) {
    console.error('Error getting expenses by date range:', error);
    throw new Error('Failed to fetch expenses by date range');
  }
}

/**
 * Create a new expense (single, recurring, or installment)
 *
 * Handles three creation modes based on form data:
 * 1. Installment (BNPL): Creates multiple expenses spread over months with defined amounts
 * 2. Recurring: Creates multiple expenses with the same amount, one per month or per year
 * 3. Single: Creates one expense
 *
 * Priority: Installment > Recurring > Single (installments checked first)
 *
 * @param userId - User ID
 * @param expenseData - Form data with expense details and mode flags
 * @param categoryName - Category name for display
 * @param subCategoryName - Optional subcategory name
 * @returns Single expense ID or array of IDs (for recurring/installments)
 */
export async function createExpense(
  userId: string,
  expenseData: ExpenseFormData,
  categoryName: string,
  subCategoryName?: string
): Promise<string | string[]> {
  const created = await writeExpenseRows(userId, expenseData, categoryName, subCategoryName);
  return created.isSeries ? created.ids : created.ids[0];
}

/**
 * Create an expense of any shape whose linked account(s) move ON THE ROWS' OWN DATES
 * (lib/utils/cashSettlement.ts): every occurrence of a series carries the account, a row dated
 * after today is written `balancePending` and settled by the server on the day.
 *
 * ALL OR NOTHING (2026-10-30): the rows, their fees, the accounts moved by the rows already
 * happened and the loan those rows repay (each stamped with its principal, in date order on the
 * debt as it stands — lib/utils/mortgageRepayment.ts) are ONE transaction. Before, they were three
 * writes in series, and a connection lost between them left the rows saved with the account
 * unmoved. The one exception is a series too long for a transaction (`OPERATIONS_PER_TRANSACTION`:
 * a 30-year series with a fee on every instalment): its rows go in batches first and the money
 * alone in the transaction — the owner's call, that day, for a case they never meet.
 *
 * `createExpense` keeps the older contract (series linked on the first row only, nothing
 * pending) for the callers that move the balance themselves — a voluntary pension
 * contribution's transfer, recorded and settled by `pensionContributionService`.
 *
 * `parents` (2026-10-12) are the parent rows as written, the fees excluded, so the form can hand
 * the first one to its host before the refetch lands (`ExpenseDialog.onSuccess(saved)`).
 * `assetsMoved` says whether an account or a loan was written, for the caller's cache.
 */
export async function createExpenseSettledOnDate(
  userId: string,
  expenseData: ExpenseFormData,
  categoryName: string,
  subCategoryName: string | undefined,
  now: Date,
  fee?: ExpenseFee
): Promise<{ ids: string[]; parents: Expense[]; assetsMoved: boolean }> {
  const planned = planExpenseRows(userId, expenseData, categoryName, subCategoryName, now, fee);
  const effects = planned.rows.flatMap(appliedBalanceEffectsOf);
  // The rows already happened that repay a loan. A fee row never repays anything (it carries no
  // `debtAssetId`).
  const debtRows: DebtRow[] = planned.rows
    .map((row, index) => ({ ...row, id: planned.ids[index] }))
    .filter((row) => repaysDebt(row) && !row.balancePending);
  const loanIds = debtRows.map((row) => row.debtAssetId);
  const assetIds = assetIdsTouched(effects, loanIds);

  const rowsInTransaction = planned.docs.length + assetIds.length <= OPERATIONS_PER_TRANSACTION;
  if (!rowsInTransaction) await commitInBatches(planned.docs);

  let assetsMoved = false;
  if (rowsInTransaction || assetIds.length > 0) {
    await runTransaction(db, async (tx) => {
      // ALL reads before ANY write (Firestore transactions).
      const assets = await readAssets(tx, assetIds);
      const plan = planDebtRepayments(debtRows, loanDebtsOf(assets, loanIds));
      const assetWrites = assetWritesOf(assets, effects, plan.debts);
      const stamps = new Map(
        debtRows.map((row) => [row.id, { debtPrincipalRepaid: plan.principals.get(row.id) ?? 0, debtInterestPaid: plan.interests.get(row.id) ?? 0 }])
      );
      if (rowsInTransaction) {
        for (const { ref, data } of planned.docs) tx.set(ref, { ...data, ...stamps.get(ref.id) });
      } else {
        for (const [id, stamp] of stamps) tx.update(doc(db, EXPENSES_COLLECTION, id), stamp);
      }
      writeAssets(tx, assetWrites);
      assetsMoved = assetWrites.length > 0;
    });
  }

  await invalidateDashboardOverviewSummary(userId, 'expense_created');
  return { ids: planned.ids, parents: planned.parents, assetsMoved };
}

/**
 * The fee a new row (or every occurrence of a new series) carries (lib/utils/expenseFee.ts):
 * its amount, the category from Impostazioni and the note it is born with.
 */
export interface ExpenseFee {
  amount: number;
  category: ExpenseFeeCategory;
  notes: string;
}

/** Firestore's ceiling on the writes of one transaction, with room to spare (the same as a batch's). */
const OPERATIONS_PER_TRANSACTION = 450;

/** The assets a save touches, read inside its transaction; one not found is skipped (the row is still saved). */
async function readAssets(tx: Transaction, ids: string[]): Promise<Map<string, ReadAsset>> {
  const snaps = await Promise.all(ids.map((id) => tx.get(doc(db, ASSETS_COLLECTION, id))));
  const assets = new Map<string, ReadAsset>();
  snaps.forEach((snap, index) => {
    if (snap.exists()) assets.set(ids[index], snap.data() as ReadAsset);
    else console.warn('Skipping balance update: asset not found', { assetId: ids[index] });
  });
  return assets;
}

function writeAssets(tx: Transaction, writes: AssetWrite[]): void {
  const now = new Date();
  for (const { assetId, fields } of writes) tx.update(doc(db, ASSETS_COLLECTION, assetId), { ...fields, updatedAt: now });
}

/** An edit of ONE row, as the form hands it (ExpenseDialog). */
export interface ExpenseEdit {
  ownerId: string;
  expenseId: string;
  /** The fields to write, as `updateExpense` takes them (`deleteField()` where a field is cleared). */
  updates: Partial<ExpenseFormData>;
  categoryName: string;
  subCategoryName?: string;
  /** The edited row as its accounts and its loan see it: the amount signed as stored. */
  after: SettlementRow & { date: Date; currency: string; isDebtPayoff?: boolean };
  /** The fee the form asks for (already through `normalizeExpenseFee`), null for none. */
  requestedFee: number | null;
  /** The fee category from Impostazioni, needed only to create a fee. */
  feeCategory: ExpenseFeeCategory | null;
  feeNote: string;
  now: Date;
}

/**
 * Save an edited row ALL OR NOTHING (2026-10-30): the row, its fee row (created, updated or
 * deleted — lib/utils/expenseFee.ts), the accounts both move and the loan the row repays, in ONE
 * transaction. Before, these were four writes in series.
 *
 * The row and its fee are READ INSIDE the transaction, and every effect is computed on them, not
 * on the copy the form opened: an instalment the server settled while the dialog was open
 * (`settleDueBalances`) is given back as applied, never as still pending.
 *
 * Accounts (`editBalanceEffects`): the old row's applied effect given back, the new one applied
 * unless its new date is still to come. The fee row follows its parent — its date, its account,
 * the amount asked for; its category, subcategory and note are its own and never touched. The debt
 * (`planDebtEditWrites`): what the row had repaid given back, the edited row split again on the
 * debt as it now stands.
 */
export async function saveExpenseEdit(edit: ExpenseEdit): Promise<{ pending: boolean; feeExpenseId: string | null; assetsMoved: boolean }> {
  const { ownerId, expenseId, after, requestedFee, feeCategory, feeNote, now } = edit;
  const rowRef = doc(db, EXPENSES_COLLECTION, expenseId);
  // Minted outside the transaction, so a retry writes the same document.
  const newFeeRef = doc(collection(db, EXPENSES_COLLECTION));

  const result = await runTransaction(db, async (tx) => {
    // ALL reads before ANY write: the row, its fee, then the assets they move.
    const rowSnap = await tx.get(rowRef);
    if (!rowSnap.exists()) throw new Error('The expense no longer exists');
    const stored = expenseFromSnapshot(rowSnap);
    const feeSnap = stored.transferFeeExpenseId ? await tx.get(doc(db, EXPENSES_COLLECTION, stored.transferFeeExpenseId)) : null;
    const storedFee = feeSnap?.exists() ? expenseFromSnapshot(feeSnap) : null;

    const settlement = editBalanceEffects(stored, after, now);
    const feePlan = planExpenseFee(storedFee, requestedFee);
    let feeEffects: BalanceEffect[] = [];
    let feeExpenseId: string | null = null;
    let writeFee: () => void = () => {};
    switch (feePlan.kind) {
      case 'none':
        break;
      case 'delete': {
        const fee = storedFee!;
        feeEffects = reverseBalanceEffects(appliedBalanceEffectsOf(fee));
        writeFee = () => tx.delete(doc(db, EXPENSES_COLLECTION, fee.id));
        break;
      }
      case 'update': {
        const fee = storedFee!;
        const feeAfter = { type: fee.type, amount: -feePlan.amount, date: after.date, linkedCashAssetId: after.linkedCashAssetId };
        const feeSettlement = editBalanceEffects(fee, feeAfter, now);
        feeEffects = feeSettlement.effects;
        feeExpenseId = fee.id;
        writeFee = () =>
          tx.update(doc(db, EXPENSES_COLLECTION, fee.id), {
            amount: feeAfter.amount,
            date: Timestamp.fromDate(after.date),
            currency: after.currency,
            linkedCashAssetId: after.linkedCashAssetId ?? deleteField(),
            balancePending: feeSettlement.pending ? true : deleteField(),
            updatedAt: new Date(),
          });
        break;
      }
      case 'create': {
        // The form disables the field without a category, so reaching here without one is a bug in
        // the caller — refused rather than written into a category the owner never chose.
        if (!feeCategory) throw new Error('A new fee needs the fee category from Impostazioni');
        const feeData = {
          ...buildExpenseFeeFormData({ date: after.date, currency: after.currency, linkedCashAssetId: after.linkedCashAssetId }, feePlan.amount, feeCategory, feeNote),
          feeOfTransferId: expenseId,
        };
        const { data, row } = buildSingleExpenseDoc(ownerId, feeData, feeCategory.categoryName, feeCategory.subCategoryName, now, new Date());
        feeEffects = appliedBalanceEffectsOf(row);
        feeExpenseId = newFeeRef.id;
        writeFee = () => tx.set(newFeeRef, data);
        break;
      }
    }

    const effects = [...settlement.effects, ...feeEffects];
    const loanIds = loanIdsOfEdit(stored, after, now);
    const assets = await readAssets(tx, assetIdsTouched(effects, loanIds));
    const debt = planDebtEditWrites(stored, after, now, loanDebtsOf(assets, loanIds));
    const assetWrites = assetWritesOf(assets, effects, debt.debts);

    writeFee();
    tx.update(rowRef, {
      ...buildExpenseUpdate(edit.updates, edit.categoryName, edit.subCategoryName),
      // The row's new date decides: still to come → it waits (the server settles it on the day),
      // today or past → it has moved its account(s) with the effects above.
      balancePending: settlement.pending,
      transferFeeExpenseId: feeExpenseId ?? deleteField(),
      ...(debt.touchesStamp
        ? { debtPrincipalRepaid: debt.stamp?.principal ?? deleteField(), debtInterestPaid: debt.stamp?.interest ?? deleteField() }
        : {}),
    });
    writeAssets(tx, assetWrites);
    return { pending: settlement.pending, feeExpenseId, assetsMoved: assetWrites.length > 0 };
  });

  await invalidateDashboardOverviewSummary(ownerId, 'expense_updated');
  return result;
}

/** A written row, as far as its accounts are concerned. */
type WrittenRow = SettlementRow & { date: Date; isDebtPayoff?: boolean };

interface WrittenRows {
  ids: string[];
  rows: WrittenRow[];
  /**
   * The parent rows as the readers hand them out (`getExpensesByDateRange`), one per `ids`
   * position of a parent and in the same order — the fees are not here. For the caller that
   * wants to show the row it just saved before the refetch lands (Tracciamento's «+» on a phone,
   * since 2026-10-12).
   */
  parents: Expense[];
  isSeries: boolean;
}

/** Rows built and not yet written: their documents beside what `WrittenRows` hands back. */
interface PlannedRows extends WrittenRows {
  docs: { ref: DocumentReference; data: Record<string, unknown> }[];
}

/** The document as a reader would return it: its fields, its id, and its date back as a `Date`. */
function writtenExpense(id: string, data: Record<string, unknown>, date: Date): Expense {
  return { ...(data as Omit<Expense, 'id' | 'date'>), id, date };
}

/** Firestore's ceiling on one `writeBatch`, with room to spare. */
const OPERATIONS_PER_BATCH = 450;

/**
 * Write the given documents in batches under Firestore's 500-operation ceiling: a series of 360
 * instalments with a fee each is 720 documents, which one batch refuses whole.
 */
async function commitInBatches(docs: { ref: DocumentReference; data: Record<string, unknown> }[]): Promise<void> {
  for (let start = 0; start < docs.length; start += OPERATIONS_PER_BATCH) {
    const batch = writeBatch(db);
    for (const { ref, data } of docs.slice(start, start + OPERATIONS_PER_BATCH)) batch.set(ref, data);
    await batch.commit();
  }
}

/**
 * Apply the given field updates in batches under Firestore's 500-operation ceiling: a category
 * rewrite touches every row of the category, and a category used for years holds more than one
 * batch accepts (2026-10-25).
 */
async function updateInBatches(updates: { ref: DocumentReference; data: Record<string, unknown> }[]): Promise<void> {
  for (let start = 0; start < updates.length; start += OPERATIONS_PER_BATCH) {
    const batch = writeBatch(db);
    for (const { ref, data } of updates.slice(start, start + OPERATIONS_PER_BATCH)) batch.update(ref, data);
    await batch.commit();
  }
}

/**
 * The fee row of ONE written occurrence (lib/utils/expenseFee.ts): the parent's date, currency
 * and account, the fee category's type, pointing at the parent — whose document carries the
 * fee's id (`transferFeeExpenseId`). Returns the document and the row for the balances.
 */
function buildFeeDoc(
  userId: string,
  parentRef: DocumentReference,
  parent: Pick<ExpenseFormData, 'date' | 'currency' | 'linkedCashAssetId'>,
  fee: ExpenseFee,
  settleNow: Date | undefined,
  now: Date
): { ref: DocumentReference; data: Record<string, unknown>; row: WrittenRow } {
  const ref = doc(collection(db, EXPENSES_COLLECTION));
  const feeData = { ...buildExpenseFeeFormData(parent, fee.amount, fee.category, fee.notes), feeOfTransferId: parentRef.id };
  const { data, row } = buildSingleExpenseDoc(userId, feeData, fee.category.categoryName, fee.category.subCategoryName, settleNow, now);
  return { ref, data, row };
}

/**
 * The settlement fields of one row: with `settleNow` a row that moves an account and is dated
 * after today is written `balancePending: true`; without it (the legacy contract) nothing.
 */
function settlementFieldsOf(row: WrittenRow, settleNow: Date | undefined): { balancePending?: true } {
  if (!settleNow || !hasDatedEffects(row)) return {};
  return settlesLater(row.date, settleNow) ? { balancePending: true } : {};
}

/**
 * The document of ONE non-series row, and the row as far as its accounts are concerned (its
 * settlement fields included). Shared by the single-row create and by the transfer-with-fee
 * batch, which writes two such rows at once.
 */
function buildSingleExpenseDoc(
  userId: string,
  expenseData: ExpenseFormData,
  categoryName: string,
  subCategoryName: string | undefined,
  settleNow: Date | undefined,
  now: Date
): { data: Record<string, unknown>; row: WrittenRow } {
  // Apply amount sign convention: expenses negative, income/transfers positive
  // This allows simple sum() for net cashflow without conditional logic
  let amount = Math.abs(expenseData.amount);
  if (expenseData.type !== 'income' && expenseData.type !== 'transfer') {
    amount = -amount;
  }

  const row: WrittenRow = {
    type: expenseData.type,
    amount,
    date: expenseData.date,
    linkedCashAssetId: expenseData.linkedCashAssetId,
    transferCashAssetId: expenseData.transferCashAssetId,
    debtAssetId: expenseData.type === 'debt' ? expenseData.debtAssetId : undefined,
  };
  // The payoff flag rides with the row applied NOW (`planDebtRepayments` reads it): without it a
  // payoff saved today would be split like an instalment (seen in the browser, 2026-10-10).
  if (row.debtAssetId && expenseData.isDebtPayoff) row.isDebtPayoff = true;
  const settlement = settlementFieldsOf(row, settleNow);
  const data = removeUndefinedFields({
    userId,
    type: expenseData.type,
    categoryId: expenseData.categoryId,
    categoryName,
    subCategoryId: expenseData.subCategoryId,
    subCategoryName,
    amount,
    currency: expenseData.currency,
    date: Timestamp.fromDate(expenseData.date),
    notes: expenseData.notes,
    link: expenseData.link,
    isRecurring: false,
    linkedCashAssetId: expenseData.linkedCashAssetId,
    transferCashAssetId: expenseData.transferCashAssetId,
    debtAssetId: row.debtAssetId,
    // The payoff flag only means something on a row that repays a loan.
    isDebtPayoff: row.debtAssetId && expenseData.isDebtPayoff ? true : undefined,
    ...settlement,
    costCenterId: expenseData.costCenterId,
    costCenterName: expenseData.costCenterName,
    personalMemberId: expenseData.personalMemberId,
    // «Fuori dal budget» is stored only when set: absent means counted (types/expenses.ts).
    excludeFromBudget: expenseData.excludeFromBudget ? true : undefined,
    transferFeeExpenseId: expenseData.transferFeeExpenseId,
    feeOfTransferId: expenseData.feeOfTransferId,
    createdAt: now,
    updatedAt: now,
  });
  return { data, row: { ...row, ...settlement } };
}

/**
 * Build the rows of any shape — one row, an instalment plan, a recurring series — and, with a
 * `fee`, the fee row of EACH of them (lib/utils/expenseFee.ts), every pair in the same batch and
 * pointing at each other: a half-written pair would leave a fee nobody can reach from its parent,
 * or a parent naming a fee that does not exist. The fee rows come AFTER the parents in `ids` and
 * `rows`, so a caller indexing the parents by position is unaffected.
 */
function planExpenseRows(
  userId: string,
  expenseData: ExpenseFormData,
  categoryName: string,
  subCategoryName: string | undefined,
  settleNow?: Date,
  fee?: ExpenseFee
): PlannedRows {
  // Priority 1: Check installment first (BNPL payments with varying amounts)
  // Installments have priority over recurring since they're more specific
  if (expenseData.isInstallment && expenseData.installmentCount && expenseData.installmentCount > 1) {
    return planInstallmentExpenses(userId, expenseData, categoryName, subCategoryName, settleNow, fee);
  }

  // Priority 2: Recurring expenses (a fixed amount repeating monthly or yearly)
  if (expenseData.isRecurring && expenseData.recurringCount && expenseData.recurringCount > 0) {
    return planRecurringExpenses(userId, expenseData, categoryName, subCategoryName, settleNow, fee);
  }

  // Priority 3: Create single expense (with its fee in the same write, when it has one)
  const now = new Date();
  const docRef = doc(collection(db, EXPENSES_COLLECTION));
  const feeDoc = fee ? buildFeeDoc(userId, docRef, expenseData, fee, settleNow, now) : null;
  const { data: cleanedData, row } = buildSingleExpenseDoc(
    userId,
    feeDoc ? { ...expenseData, transferFeeExpenseId: feeDoc.ref.id } : expenseData,
    categoryName,
    subCategoryName,
    settleNow,
    now
  );

  return {
    docs: [{ ref: docRef, data: cleanedData }, ...(feeDoc ? [{ ref: feeDoc.ref, data: feeDoc.data }] : [])],
    ids: [docRef.id, ...(feeDoc ? [feeDoc.ref.id] : [])],
    rows: [row, ...(feeDoc ? [feeDoc.row] : [])],
    parents: [writtenExpense(docRef.id, cleanedData, expenseData.date)],
    isSeries: false,
  };
}

/** The legacy write of `createExpense`: the planned rows in batches, no account moved. */
async function writeExpenseRows(
  userId: string,
  expenseData: ExpenseFormData,
  categoryName: string,
  subCategoryName: string | undefined
): Promise<WrittenRows> {
  try {
    const planned = planExpenseRows(userId, expenseData, categoryName, subCategoryName);
    await commitInBatches(planned.docs);
    await invalidateDashboardOverviewSummary(userId, 'expense_created');
    return planned;
  } catch (error) {
    console.error('Error creating expense:', error);
    throw new Error('Failed to create expense');
  }
}

/**
 * Create a recurring series (fixed, variable, debt or transfer).
 *
 * The series is MATERIALISED: one real, future-dated document per occurrence, all sharing a
 * `recurringParentId` so they can be deleted together. Nothing downstream evaluates a rule —
 * Cashflow, Analisi, Budget and the assistant all read ordinary expense rows.
 *
 * The occurrence count is capped at `MAX_RECURRENCE_OCCURRENCES` (see recurrenceDates.ts) so the
 * form states a legible number; the write goes in batches under Firestore's 500-operation ceiling
 * (`commitInBatches`), because with a fee each occurrence is two documents.
 *
 * With `settleNow` every occurrence carries the linked account and moves it on its own date
 * (lib/utils/cashSettlement.ts); without it only the first one does, at save (legacy contract).
 *
 * @returns The ids of every created occurrence, in chronological order, then the fees' ids, and the rows written.
 */
function planRecurringExpenses(
  userId: string,
  expenseData: ExpenseFormData,
  categoryName: string,
  subCategoryName: string | undefined,
  settleNow?: Date,
  fee?: ExpenseFee
): PlannedRows {
  try {
    const docs: { ref: DocumentReference; data: Record<string, unknown> }[] = [];
    const feeDocs: ReturnType<typeof buildFeeDoc>[] = [];
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const createdIds: string[] = [];
    const rows: WrittenRow[] = [];
    const parents: Expense[] = [];
    const now = new Date();

    // Create parent expense ID for reference
    const parentId = `recurring-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Sign convention: spending types negative, a transfer positive (as `buildSingleExpenseDoc`).
    // Income cannot recur (canTypeRecur); if it ever does, this line is the one to widen.
    const amount = expenseData.type === 'transfer' ? Math.abs(expenseData.amount) : -Math.abs(expenseData.amount);

    const recurringFrequency = resolveRecurrenceFrequency(expenseData.recurringFrequency);
    const recurringDay = expenseData.recurringDay || expenseData.date.getDate();
    const dates = buildRecurrenceDates({
      start: expenseData.date,
      frequency: recurringFrequency,
      count: expenseData.recurringCount || 1,
      dayOfMonth: recurringDay,
    });

    dates.forEach((expenseDate, index) => {
      const docRef = doc(expensesRef);
      const linkedCashAssetId = settleNow || index === 0 ? expenseData.linkedCashAssetId : undefined;
      // A transfer's destination follows its origin: both legs on every occurrence, on its own date.
      const transferCashAssetId = expenseData.type === 'transfer' && linkedCashAssetId ? expenseData.transferCashAssetId : undefined;
      // Like the account, every occurrence carries the loan it repays, each on its own date.
      const debtAssetId = settleNow ? expenseData.debtAssetId : undefined;
      // Each occurrence's own fee, on its own date and account (lib/utils/expenseFee.ts).
      const feeDoc = fee ? buildFeeDoc(userId, docRef, { date: expenseDate, currency: expenseData.currency, linkedCashAssetId }, fee, settleNow, now) : null;
      const row: WrittenRow = { type: expenseData.type, amount, date: expenseDate, linkedCashAssetId, transferCashAssetId, debtAssetId };
      const settlement = settlementFieldsOf(row, settleNow);
      const cleanedData = removeUndefinedFields({
        userId,
        type: expenseData.type,
        categoryId: expenseData.categoryId,
        categoryName,
        subCategoryId: expenseData.subCategoryId,
        subCategoryName,
        amount,
        currency: expenseData.currency,
        date: Timestamp.fromDate(expenseDate),
        notes: expenseData.notes,
        link: expenseData.link,
        isRecurring: true,
        recurringFrequency,
        recurringDay,
        recurringParentId: parentId,
        linkedCashAssetId,
        transferCashAssetId,
        debtAssetId,
        ...settlement,
        costCenterId: expenseData.costCenterId,
        costCenterName: expenseData.costCenterName,
        // Every occurrence of a series belongs to the same person: ownership is a property
        // of the expense, like the account each occurrence settles on its own date.
        personalMemberId: expenseData.personalMemberId,
        // And so is «Fuori dal budget»: every occurrence is out, or none is.
        excludeFromBudget: expenseData.excludeFromBudget ? true : undefined,
        transferFeeExpenseId: feeDoc?.ref.id,
        createdAt: now,
        updatedAt: now,
      });

      docs.push({ ref: docRef, data: cleanedData });
      if (feeDoc) feeDocs.push(feeDoc);
      createdIds.push(docRef.id);
      rows.push({ ...row, ...settlement });
      parents.push(writtenExpense(docRef.id, cleanedData, expenseDate));
    });

    return {
      docs: [...docs, ...feeDocs.map(({ ref, data }) => ({ ref, data }))],
      ids: [...createdIds, ...feeDocs.map((feeDoc) => feeDoc.ref.id)],
      rows: [...rows, ...feeDocs.map((feeDoc) => feeDoc.row)],
      parents,
      isSeries: true,
    };
  } catch (error) {
    console.error('Error creating recurring expenses:', error);
    throw new Error('Failed to create recurring expenses');
  }
}

/**
 * Create installment expenses (for BNPL - Buy Now Pay Later payments)
 *
 * Supports two modes:
 * 1. Auto mode: Divides total amount evenly across installments
 *    - Rounds each installment down to 2 decimals
 *    - Last installment gets remainder to match exact total (prevents rounding errors)
 * 2. Manual mode: Uses user-provided amounts for each installment
 *
 * All installments are linked via a shared parentId for bulk operations.
 *
 * @param userId - User ID
 * @param expenseData - Form data with installment configuration
 * @param categoryName - Category name for display
 * @param subCategoryName - Optional subcategory name
 * With `settleNow` every instalment carries the linked account and moves it on its own date
 * (lib/utils/cashSettlement.ts); without it only the first one does, at save (legacy contract).
 *
 * @returns The created ids and the rows written
 */
function planInstallmentExpenses(
  userId: string,
  expenseData: ExpenseFormData,
  categoryName: string,
  subCategoryName: string | undefined,
  settleNow?: Date,
  fee?: ExpenseFee
): PlannedRows {
  try {
    const docs: { ref: DocumentReference; data: Record<string, unknown> }[] = [];
    const feeDocs: ReturnType<typeof buildFeeDoc>[] = [];
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const createdIds: string[] = [];
    const rows: WrittenRow[] = [];
    const parents: Expense[] = [];
    const now = new Date();

    // Generate unique parent ID for linking all installments together
    // This allows bulk operations like "delete all installments in this series"
    const parentId = `installment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const installmentCount = expenseData.installmentCount!;
    const startDate = expenseData.installmentStartDate || expenseData.date;

    // Calculate amounts based on mode
    let installmentAmounts: number[];
    let totalAmount: number;

    if (expenseData.installmentMode === 'auto') {
      // Auto-calculation: divide total amount evenly across installments
      totalAmount = expenseData.installmentTotalAmount!;
      const perInstallment = totalAmount / installmentCount;
      const baseAmount = Math.floor(perInstallment * 100) / 100; // Round down to 2 decimals
      const remainder = totalAmount - (baseAmount * installmentCount);

      // All installments get base amount except last one
      // Last installment gets base + remainder to ensure total matches exactly
      // (e.g., €100 / 3 = €33.33 + €33.33 + €33.34)
      installmentAmounts = Array(installmentCount - 1).fill(baseAmount);
      installmentAmounts.push(baseAmount + remainder);
    } else {
      // Manual mode: use user-provided amounts (for irregular payment schedules)
      installmentAmounts = expenseData.installmentAmounts!;
      totalAmount = installmentAmounts.reduce((sum, amt) => sum + amt, 0);
    }

    // Ensure amounts are negative for expenses (positive for income)
    const isExpense = expenseData.type !== 'income';
    if (isExpense) {
      installmentAmounts = installmentAmounts.map(amt => -Math.abs(amt));
      totalAmount = -Math.abs(totalAmount);
    }

    // Create one expense document per installment
    for (let i = 0; i < installmentCount; i++) {
      const installmentDate = new Date(startDate);
      installmentDate.setMonth(installmentDate.getMonth() + i);

      const docRef = doc(expensesRef);
      const linkedCashAssetId = settleNow || i === 0 ? expenseData.linkedCashAssetId : undefined;
      const debtAssetId = settleNow ? expenseData.debtAssetId : undefined;
      const feeDoc = fee ? buildFeeDoc(userId, docRef, { date: installmentDate, currency: expenseData.currency, linkedCashAssetId }, fee, settleNow, now) : null;
      const row: WrittenRow = { type: expenseData.type, amount: installmentAmounts[i], date: installmentDate, linkedCashAssetId, debtAssetId };
      const settlement = settlementFieldsOf(row, settleNow);
      const cleanedData = removeUndefinedFields({
        userId,
        type: expenseData.type,
        categoryId: expenseData.categoryId,
        categoryName,
        subCategoryId: expenseData.subCategoryId,
        subCategoryName,
        amount: installmentAmounts[i],
        currency: expenseData.currency,
        date: Timestamp.fromDate(installmentDate),
        notes: expenseData.notes
          ? `${expenseData.notes} (Installment ${i + 1}/${installmentCount})`
          : `Installment ${i + 1}/${installmentCount}`,
        link: expenseData.link,

        // Installment-specific fields
        isInstallment: true,
        installmentParentId: parentId,
        installmentNumber: i + 1,
        installmentTotal: installmentCount,
        installmentTotalAmount: totalAmount,

        linkedCashAssetId,
        debtAssetId,
        ...settlement,
        costCenterId: expenseData.costCenterId,
        costCenterName: expenseData.costCenterName,
        // Every occurrence of a series belongs to the same person: ownership is a property
        // of the expense, like the account each occurrence settles on its own date.
        personalMemberId: expenseData.personalMemberId,
        // And so is «Fuori dal budget»: every instalment is out, or none is.
        excludeFromBudget: expenseData.excludeFromBudget ? true : undefined,
        transferFeeExpenseId: feeDoc?.ref.id,

        createdAt: now,
        updatedAt: now,
      });

      docs.push({ ref: docRef, data: cleanedData });
      if (feeDoc) feeDocs.push(feeDoc);
      createdIds.push(docRef.id);
      rows.push({ ...row, ...settlement });
      parents.push(writtenExpense(docRef.id, cleanedData, installmentDate));
    }

    return {
      docs: [...docs, ...feeDocs.map(({ ref, data }) => ({ ref, data }))],
      ids: [...createdIds, ...feeDocs.map((feeDoc) => feeDoc.ref.id)],
      rows: [...rows, ...feeDocs.map((feeDoc) => feeDoc.row)],
      parents,
      isSeries: true,
    };
  } catch (error) {
    console.error('Error creating installment expenses:', error);
    throw new Error('Failed to create installment expenses');
  }
}

/**
 * Delete all expenses in an installment series, their fees, and give back what they applied
 * (`deleteSeries`). Returns true when an account or a loan moved.
 * @param userId - Owner of the series
 * @param installmentParentId - The parent ID linking all installments
 *
 * SCOPED BY userId, and it has to be: `firestore.rules` guards `expenses` with
 * `canAccess(resource.data.userId)`, and Firestore refuses a LIST whose constraints do not
 * already guarantee the rule holds. A query on the parent id alone comes back
 * `permission-denied` at any result size (verified on the emulator), so the series would read
 * as empty and the delete would silently do nothing.
 */
export async function deleteInstallmentExpenses(
  userId: string,
  installmentParentId: string
): Promise<boolean> {
  return deleteSeries(userId, 'installmentParentId', installmentParentId);
}

/**
 * The fields an edit writes on the row: the amount signed by its type, the names denormalised,
 * the date as a Timestamp, `undefined` stripped (a `deleteField()` survives). Shared by
 * `updateExpense` and the all-or-nothing edit (`saveExpenseEdit`).
 */
function buildExpenseUpdate(updates: Partial<ExpenseFormData>, categoryName?: string, subCategoryName?: string): Record<string, unknown> {
  // If amount is being updated, ensure correct sign
  let updatedAmount = updates.amount;
  if (updatedAmount !== undefined && updates.type) {
    updatedAmount = Math.abs(updatedAmount);
    if (updates.type !== 'income' && updates.type !== 'transfer') {
      updatedAmount = -updatedAmount;
    }
  }

  return removeUndefinedFields({
    ...updates,
    amount: updatedAmount,
    categoryName,
    subCategoryName,
    date: updates.date ? Timestamp.fromDate(updates.date) : undefined,
    linkedCashAssetId: updates.linkedCashAssetId,
    transferCashAssetId: updates.transferCashAssetId,
    updatedAt: new Date(),
  });
}

/**
 * Update an existing expense — fields only: no account, fee or loan moves. The form's edit goes
 * through `saveExpenseEdit`.
 */
export async function updateExpense(
  expenseId: string,
  updates: Partial<ExpenseFormData>,
  categoryName?: string,
  subCategoryName?: string,
  ownerId?: string
): Promise<void> {
  try {
    const expenseRef = doc(db, EXPENSES_COLLECTION, expenseId);
    // The owner is read from the row only when the caller does not know it: the form does, and a
    // read before the write is one more round trip in series on every «Salva modifiche».
    const userId = ownerId ?? ((await getDoc(expenseRef)).data()?.userId as string | undefined);

    await updateDoc(expenseRef, buildExpenseUpdate(updates, categoryName, subCategoryName));
    if (userId) {
      await invalidateDashboardOverviewSummary(userId, 'expense_updated');
    }
  } catch (error) {
    console.error('Error updating expense:', error);
    throw new Error('Failed to update expense');
  }
}

/**
 * Delete an expense
 */
export async function deleteExpense(expenseId: string): Promise<void> {
  try {
    const expenseRef = doc(db, EXPENSES_COLLECTION, expenseId);
    const existingExpense = await getDoc(expenseRef);
    await deleteDoc(expenseRef);
    const userId = existingExpense.data()?.userId as string | undefined;
    if (userId) {
      await invalidateDashboardOverviewSummary(userId, 'expense_deleted');
    }
  } catch (error) {
    console.error('Error deleting expense:', error);
    throw new Error('Failed to delete expense');
  }
}

/** A stored expense document as the app reads it: Timestamps converted to Dates. */
function expenseFromSnapshot(snapshot: DocumentSnapshot): Expense {
  const data = snapshot.data()!;
  return {
    id: snapshot.id,
    ...data,
    date: data.date?.toDate() || new Date(),
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
  } as Expense;
}

/**
 * The fee row a row created (lib/utils/expenseFee.ts), as stored, or null — the row has no fee,
 * or the fee was deleted by hand since. Read before an edit (the form shows its amount) and
 * before a delete (the fee goes with its parent).
 */
export async function getFeeOf(expense: Pick<Expense, 'transferFeeExpenseId'>): Promise<Expense | null> {
  if (!expense.transferFeeExpenseId) return null;
  const snapshot = await getDoc(doc(db, EXPENSES_COLLECTION, expense.transferFeeExpenseId));
  return snapshot.exists() ? expenseFromSnapshot(snapshot) : null;
}

/**
 * The fee rows of the given rows (a whole series), as stored: ONE `in` query per 30 parents
 * (`chunkForInQuery`), with the `userId` the rules need. A caller deleting a series reverses
 * their balances with the series' own (`reverseAppliedBalances`) before the delete.
 */
export async function getFeesOf(userId: string, rows: Pick<Expense, 'id' | 'transferFeeExpenseId'>[]): Promise<Expense[]> {
  const parentIds = rows.filter((row) => !!row.transferFeeExpenseId).map((row) => row.id);
  if (parentIds.length === 0) return [];
  const perChunk = await Promise.all(
    chunkForInQuery(parentIds).map(async (ids) => {
      const snapshot = await getDocs(query(collection(db, EXPENSES_COLLECTION), where('userId', '==', userId), where('feeOfTransferId', 'in', ids)));
      return snapshot.docs.map((docSnapshot) => expenseFromSnapshot(docSnapshot));
    })
  );
  return perChunk.flat();
}

/**
 * Delete rows that go together — a row and its fee (`rowsDeletedWith`), a whole series and its
 * fees — ALL OR NOTHING (2026-10-30): the rows removed, what they had applied to their accounts
 * given back, and the principal they had repaid returned to their loans, in ONE transaction.
 * Before, the balances were given back first and the rows deleted after, two writes in series.
 *
 * The rows are re-read inside the transaction and the effects computed on them as stored: a row
 * still waiting for its date (`balancePending`) moved nothing and gives back nothing — even if it
 * was settled since the list was loaded. A row already gone is skipped.
 *
 * A fee row deleted WITHOUT its parent (deleted by hand from the list) unlinks itself from it in
 * the same transaction, so the parent never points at a row that is gone.
 *
 * Returns true when an account or a loan moved.
 */
export async function deleteExpenseRows(userId: string, rows: Pick<Expense, 'id'>[]): Promise<boolean> {
  const refs = [...new Set(rows.map((row) => row.id))].map((id) => doc(db, EXPENSES_COLLECTION, id));
  const deletedIds = new Set(refs.map((ref) => ref.id));

  const assetsMoved = await runTransaction(db, async (tx) => {
    // ALL reads before ANY write: the rows, the parents a lone fee points at, then the assets.
    const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
    const stored = snaps.filter((snap) => snap.exists()).map(expenseFromSnapshot);
    const parentIds = [...new Set(stored.map((row) => row.feeOfTransferId).filter((id): id is string => !!id && !deletedIds.has(id)))];
    const parentSnaps = await Promise.all(parentIds.map((id) => tx.get(doc(db, EXPENSES_COLLECTION, id))));

    const effects = reverseBalanceEffects(stored.flatMap(appliedBalanceEffectsOf));
    const loanIds = [...debtGivenBackBy(stored).keys()];
    const assets = await readAssets(tx, assetIdsTouched(effects, loanIds));
    const assetWrites = assetWritesOf(assets, effects, debtsAfterGivingBack(stored, loanDebtsOf(assets, loanIds)));

    for (const snap of snaps) if (snap.exists()) tx.delete(snap.ref);
    // An update on a missing document fails the whole transaction: a parent already gone needs nothing.
    for (const snap of parentSnaps) if (snap.exists()) tx.update(snap.ref, { transferFeeExpenseId: deleteField(), updatedAt: new Date() });
    writeAssets(tx, assetWrites);
    return assetWrites.length > 0;
  });

  await invalidateDashboardOverviewSummary(userId, 'expense_deleted');
  return assetsMoved;
}

/**
 * Delete a whole series — its occurrences, the fee row of each (`getFeesOf`) — giving back what
 * they applied. One transaction (`deleteExpenseRows`) whenever it fits; a series too long for one
 * (a 30-year series with a fee on every instalment) gives back the accounts and the loans in one
 * transaction and then deletes the documents in batches, as every series did before 2026-10-30.
 */
async function deleteSeries(userId: string, field: 'recurringParentId' | 'installmentParentId', parentId: string): Promise<boolean> {
  const snapshot = await getDocs(query(collection(db, EXPENSES_COLLECTION), where('userId', '==', userId), where(field, '==', parentId)));
  const series = snapshot.docs.map((docSnapshot) => expenseFromSnapshot(docSnapshot));
  const rows = [...series, ...(await getFeesOf(userId, series))];
  const assetCount = assetIdsTouched(rows.flatMap(appliedBalanceEffectsOf), debtGivenBackBy(rows).keys()).length;
  if (rows.length + assetCount <= OPERATIONS_PER_TRANSACTION) return deleteExpenseRows(userId, rows);

  const assetsMoved = await reverseAppliedBalances(rows);
  await deleteSeriesDocuments(snapshot.docs);
  await invalidateDashboardOverviewSummary(userId, 'expense_deleted');
  return assetsMoved;
}

/**
 * Delete the documents of a whole series — the occurrences the query returns and the fee row of
 * each (`transferFeeExpenseId`) — in batches under Firestore's ceiling: only for a series too long
 * for one transaction (`deleteSeries`), whose balances were given back first.
 */
async function deleteSeriesDocuments(docs: DocumentSnapshot[]): Promise<void> {
  const refs = docs.flatMap((docSnapshot) => {
    const feeId = docSnapshot.data()?.transferFeeExpenseId as string | undefined;
    return feeId ? [docSnapshot.ref, doc(db, EXPENSES_COLLECTION, feeId)] : [docSnapshot.ref];
  });
  for (let start = 0; start < refs.length; start += OPERATIONS_PER_BATCH) {
    const batch = writeBatch(db);
    for (const ref of refs.slice(start, start + OPERATIONS_PER_BATCH)) batch.delete(ref);
    await batch.commit();
  }
}

/**
 * Delete all recurring expenses with the same parent ID, their fees, and give back what they
 * applied (`deleteSeries`). Returns true when an account or a loan moved.
 * @param userId - Owner of the series
 * @param recurringParentId - The shared parent ID of the recurring series
 *
 * SCOPED BY userId, and it has to be: `firestore.rules` guards `expenses` with
 * `canAccess(resource.data.userId)`, and Firestore refuses a LIST whose constraints do not
 * already guarantee the rule holds. A query on the parent id alone comes back
 * `permission-denied` at any result size (verified on the emulator), so the series would read
 * as empty and the delete would silently do nothing.
 */
export async function deleteRecurringExpenses(
  userId: string,
  recurringParentId: string
): Promise<boolean> {
  return deleteSeries(userId, 'recurringParentId', recurringParentId);
}


/**
 * Calculate total income for a period
 */
export function calculateTotalIncome(expenses: Expense[]): number {
  return expenses
    .filter(expense => expense.type === 'income')
    .reduce((total, expense) => total + expense.amount, 0);
}

/** Expense types that count as real spending (excludes income and transfers). */
export const COUNTABLE_EXPENSE_TYPES: ExpenseType[] = ['fixed', 'variable', 'debt'];

/** Returns true if the expense is a real spending entry (not income or transfer). */
export function isCountableExpense(e: Expense): boolean {
  return COUNTABLE_EXPENSE_TYPES.includes(e.type);
}

/**
 * Calculate total expenses for a period.
 * Only counts real spending types (fixed, variable, debt) — excludes income and transfers.
 */
export function calculateTotalExpenses(expenses: Expense[]): number {
  return expenses
    .filter(isCountableExpense)
    .reduce((total, expense) => total + Math.abs(expense.amount), 0);
}

/**
 * Calculate net balance (income - expenses)
 */
export function calculateNetBalance(expenses: Expense[]): number {
  return calculateTotalIncome(expenses) - calculateTotalExpenses(expenses);
}

/**
 * Count expenses associated with a category
 */
export async function getExpenseCountByCategoryId(
  categoryId: string,
  userId: string
): Promise<number> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('categoryId', '==', categoryId)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.size;
  } catch (error) {
    console.error('Error counting expenses by category:', error);
    throw new Error('Failed to count expenses by category');
  }
}

/**
 * Count expenses associated with a subcategory
 */
export async function getExpenseCountBySubCategoryId(
  categoryId: string,
  subCategoryId: string,
  userId: string
): Promise<number> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('categoryId', '==', categoryId),
      where('subCategoryId', '==', subCategoryId)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.size;
  } catch (error) {
    console.error('Error counting expenses by subcategory:', error);
    throw new Error('Failed to count expenses by subcategory');
  }
}

/**
 * Update all expenses when a category name changes
 */
export async function updateExpensesCategoryName(
  categoryId: string,
  newCategoryName: string,
  userId: string
): Promise<void> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('categoryId', '==', categoryId)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return; // No expenses to update
    }

    await updateInBatches(querySnapshot.docs.map((docSnapshot) => ({
      ref: docSnapshot.ref,
      data: { categoryName: newCategoryName, updatedAt: new Date() },
    })));
    // The Panoramica prints category names from the rows: a renamed category is a changed input.
    await invalidateDashboardOverviewSummary(userId, 'expense_category_renamed');
  } catch (error) {
    console.error('Error updating expenses category name:', error);
    throw new Error('Failed to update expenses category name');
  }
}

/**
 * Clear category assignment from expenses when category is deleted without reassignment
 */
export async function clearExpensesCategoryAssignment(
  categoryId: string,
  userId: string
): Promise<number> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('categoryId', '==', categoryId)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return 0; // No expenses to update
    }

    const rewrites = querySnapshot.docs.map((docSnapshot) => {
      const updates: Record<string, unknown> = {
        categoryId: 'uncategorized',
        categoryName: 'Uncategorized',
        subCategoryId: null,
        subCategoryName: null,
        updatedAt: new Date(),
      };

      return { ref: docSnapshot.ref, data: removeUndefinedFields(updates) };
    });

    await updateInBatches(rewrites);
    await invalidateDashboardOverviewSummary(userId, 'expense_category_cleared');
    return rewrites.length;
  } catch (error) {
    console.error('Error clearing expenses category assignment:', error);
    throw new Error('Failed to clear expenses category assignment');
  }
}

/**
 * Reassign all expenses from one subcategory to another (or to no subcategory)
 */
export async function reassignExpensesSubCategory(
  categoryId: string,
  oldSubCategoryId: string,
  userId: string,
  newSubCategoryId?: string,
  newSubCategoryName?: string
): Promise<number> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('categoryId', '==', categoryId),
      where('subCategoryId', '==', oldSubCategoryId)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return 0; // No expenses to reassign
    }

    const rewrites = querySnapshot.docs.map((docSnapshot) => {
      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      // If new subcategory is provided, update it; otherwise clear it
      if (newSubCategoryId && newSubCategoryName) {
        updates.subCategoryId = newSubCategoryId;
        updates.subCategoryName = newSubCategoryName;
      } else {
        updates.subCategoryId = null;
        updates.subCategoryName = null;
      }

      return { ref: docSnapshot.ref, data: removeUndefinedFields(updates) };
    });

    await updateInBatches(rewrites);
    return rewrites.length;
  } catch (error) {
    console.error('Error reassigning expenses subcategory:', error);
    throw new Error('Failed to reassign expenses subcategory');
  }
}

/**
 * Move all expenses from one category to another, updating type for cross-type moves.
 *
 * The ONE way rows leave a category, whether the source is kept (the move) or deleted next
 * (the delete with reassignment): both update the expense `type` field to match the destination
 * category. Until 2026-10-25 the delete had its own rewrite that kept the old type, so a variable
 * expense moved into a fixed category stayed variable in Analisi and in the 50/30/20 split.
 * When crossing the positive/negative sign boundary, flips the amount sign to maintain
 * the sign convention (income/transfer = positive, expenses = negative).
 * Refuses to cross the transfer boundary when expenses exist (TransferBoundaryError).
 */
export async function moveExpensesToCategory(
  oldCategoryId: string,
  oldType: ExpenseType,
  newCategoryId: string,
  newCategoryName: string,
  newType: ExpenseType,
  userId: string,
  newSubCategoryId?: string,
  newSubCategoryName?: string
): Promise<number> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('categoryId', '==', oldCategoryId)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return 0;
    }

    if (crossesTransferBoundary(oldType, newType)) {
      throw new TransferBoundaryError();
    }

    const flipSign = needsSignFlip(oldType, newType);
    const rewrites = querySnapshot.docs.map((docSnapshot) => {
      const updates: Record<string, unknown> = {
        categoryId: newCategoryId,
        categoryName: newCategoryName,
        type: newType,
        updatedAt: new Date(),
      };

      // Flip amount sign when crossing the positive/negative boundary
      if (flipSign) {
        const currentAmount = docSnapshot.data().amount;
        updates.amount = -currentAmount;
      }

      if (newSubCategoryId && newSubCategoryName) {
        updates.subCategoryId = newSubCategoryId;
        updates.subCategoryName = newSubCategoryName;
      } else {
        updates.subCategoryId = null;
        updates.subCategoryName = null;
      }

      return { ref: docSnapshot.ref, data: removeUndefinedFields(updates) };
    });

    await updateInBatches(rewrites);
    await invalidateDashboardOverviewSummary(userId, 'expense_category_moved');
    return rewrites.length;
  } catch (error) {
    if (error instanceof TransferBoundaryError) throw error;
    console.error('Error moving expenses to category:', error);
    throw new Error('Failed to move expenses to category');
  }
}

/**
 * Move all expenses from a specific subcategory to another category/subcategory.
 *
 * Supports cross-category and cross-type moves. Source subcategory is preserved.
 * When crossing the positive/negative sign boundary, flips the amount sign.
 * Refuses to cross the transfer boundary when expenses exist (TransferBoundaryError).
 */
export async function moveExpensesFromSubCategory(
  oldCategoryId: string,
  oldSubCategoryId: string,
  oldType: ExpenseType,
  newCategoryId: string,
  newCategoryName: string,
  newType: ExpenseType,
  userId: string,
  newSubCategoryId?: string,
  newSubCategoryName?: string
): Promise<number> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('categoryId', '==', oldCategoryId),
      where('subCategoryId', '==', oldSubCategoryId)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return 0;
    }

    if (crossesTransferBoundary(oldType, newType)) {
      throw new TransferBoundaryError();
    }

    const flipSign = needsSignFlip(oldType, newType);
    const rewrites = querySnapshot.docs.map((docSnapshot) => {
      const updates: Record<string, unknown> = {
        categoryId: newCategoryId,
        categoryName: newCategoryName,
        type: newType,
        updatedAt: new Date(),
      };

      // Flip amount sign when crossing the positive/negative boundary
      if (flipSign) {
        const currentAmount = docSnapshot.data().amount;
        updates.amount = -currentAmount;
      }

      if (newSubCategoryId && newSubCategoryName) {
        updates.subCategoryId = newSubCategoryId;
        updates.subCategoryName = newSubCategoryName;
      } else {
        updates.subCategoryId = null;
        updates.subCategoryName = null;
      }

      return { ref: docSnapshot.ref, data: removeUndefinedFields(updates) };
    });

    await updateInBatches(rewrites);
    await invalidateDashboardOverviewSummary(userId, 'expense_category_moved');
    return rewrites.length;
  } catch (error) {
    if (error instanceof TransferBoundaryError) throw error;
    console.error('Error moving expenses from subcategory:', error);
    throw new Error('Failed to move expenses from subcategory');
  }
}

/**
 * Batch-update the type of all expenses in a category when the category type changes.
 *
 * Keeps categoryId and categoryName unchanged — only updates the `type` field
 * and flips amount signs when crossing the positive/negative sign boundary.
 * Refuses to cross the transfer boundary when expenses exist (TransferBoundaryError).
 *
 * @param categoryId - The category whose expenses need updating
 * @param oldType - Previous category type
 * @param newType - New category type
 * @param userId - Owner of the expenses
 * @returns Number of expenses updated
 */
export async function updateExpensesType(
  categoryId: string,
  oldType: ExpenseType,
  newType: ExpenseType,
  userId: string
): Promise<number> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('categoryId', '==', categoryId)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return 0;
    }

    if (crossesTransferBoundary(oldType, newType)) {
      throw new TransferBoundaryError();
    }

    const flipSign = needsSignFlip(oldType, newType);
    const rewrites = querySnapshot.docs.map((docSnapshot) => {
      const updates: Record<string, unknown> = {
        type: newType,
        updatedAt: new Date(),
      };

      if (flipSign) {
        const currentAmount = docSnapshot.data().amount as number;
        updates.amount = -currentAmount;
      }

      return { ref: docSnapshot.ref, data: updates };
    });

    await updateInBatches(rewrites);
    await invalidateDashboardOverviewSummary(userId, 'expense_category_type_changed');
    return rewrites.length;
  } catch (error) {
    if (error instanceof TransferBoundaryError) throw error;
    console.error('Error updating expense types in category:', error);
    throw new Error('Failed to update expense types');
  }
}

/**
 * Fetch all expenses in a recurring series by parent ID.
 *
 * Used before deleting a series to identify which entries had a linked cash asset
 * so the asset balance can be reversed before deletion.
 *
 * @param userId - Owner of the series
 * @param recurringParentId - The shared parent ID of the recurring series
 *
 * SCOPED BY userId, and it has to be: `firestore.rules` guards `expenses` with
 * `canAccess(resource.data.userId)`, and Firestore refuses a LIST whose constraints do not
 * already guarantee the rule holds. A query on the parent id alone comes back
 * `permission-denied` at any result size (verified on the emulator), so the series would read
 * as empty and the delete would silently do nothing.
 */
export async function getExpensesByRecurringParentId(
  userId: string,
  recurringParentId: string
): Promise<Expense[]> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('recurringParentId', '==', recurringParentId)
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      date: doc.data().date?.toDate() || new Date(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Expense[];
  } catch (error) {
    console.error('Error fetching recurring series expenses:', error);
    throw new Error('Failed to fetch recurring series expenses');
  }
}

/**
 * Fetch all expenses in an installment series by parent ID.
 *
 * Used before deleting a series to identify which entries had a linked cash asset
 * so the asset balance can be reversed before deletion.
 *
 * @param userId - Owner of the series
 * @param installmentParentId - The shared parent ID of the installment series
 *
 * SCOPED BY userId, and it has to be: `firestore.rules` guards `expenses` with
 * `canAccess(resource.data.userId)`, and Firestore refuses a LIST whose constraints do not
 * already guarantee the rule holds. A query on the parent id alone comes back
 * `permission-denied` at any result size (verified on the emulator), so the series would read
 * as empty and the delete would silently do nothing.
 */
export async function getExpensesByInstallmentParentId(
  userId: string,
  installmentParentId: string
): Promise<Expense[]> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('installmentParentId', '==', installmentParentId)
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      date: doc.data().date?.toDate() || new Date(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Expense[];
  } catch (error) {
    console.error('Error fetching installment series expenses:', error);
    throw new Error('Failed to fetch installment series expenses');
  }
}

/**
 * The rows of the series a row belongs to (an instalment plan or a recurring series), or just
 * the row itself when it belongs to none.
 */
export async function getSeriesOf(userId: string, expense: Expense): Promise<Expense[]> {
  if (expense.isInstallment && expense.installmentParentId) return getExpensesByInstallmentParentId(userId, expense.installmentParentId);
  if (expense.isRecurring && expense.recurringParentId) return getExpensesByRecurringParentId(userId, expense.recurringParentId);
  return [expense];
}

/**
 * «Collega la serie»: link the occurrences of `expense`'s series that are still to come (and have
 * not moved an account) to `cashAssetId`, each waiting for its own date — the server settles it on
 * the day (lib/server/cashSettlement.ts). Occurrences already happened are left as they are
 * (`selectLinkableOccurrences`). One batch: a series is capped under 500 rows. Returns how many
 * occurrences were linked.
 */
export async function linkSeriesToCashAccount(userId: string, expense: Expense, cashAssetId: string, now: Date): Promise<number> {
  const linkable = selectLinkableOccurrences(await getSeriesOf(userId, expense), now);
  if (linkable.length === 0) return 0;
  const batch = writeBatch(db);
  for (const row of linkable) {
    batch.update(doc(db, EXPENSES_COLLECTION, row.id), { linkedCashAssetId: cashAssetId, balancePending: true, updatedAt: new Date() });
  }
  await batch.commit();
  await invalidateDashboardOverviewSummary(userId, 'expense_updated');
  return linkable.length;
}

/** Firestore's ceiling on the values of one `in` filter. */
export const FIRESTORE_IN_LIMIT = 30;

/** Split ids into the chunks one `in` filter accepts (30): 31 ids are two queries. */
export function chunkForInQuery<T>(ids: readonly T[], limit: number = FIRESTORE_IN_LIMIT): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < ids.length; start += limit) chunks.push(ids.slice(start, start + limit));
  return chunks;
}

/**
 * The instalments linked to the given properties (`debtAssetId`), for Patrimonio's «Mutuo» tile
 * (lib/utils/mortgageSummary.ts). ONE query for every property (2026-09-29 — it used to be
 * one per property): `userId`, which `firestore.rules` needs on every list, and `debtAssetId in
 * [...]`; two `.where()` calls, so no composite index is involved. Firestore takes at most 30
 * values in an `in` filter, so past that the ids go in chunks of 30, read in parallel.
 */
export async function getMortgageInstalments(userId: string, propertyIds: string[]): Promise<Expense[]> {
  const perChunk = await Promise.all(
    chunkForInQuery(propertyIds).map(async (ids) => {
      const snapshot = await getDocs(query(collection(db, EXPENSES_COLLECTION), where('userId', '==', userId), where('debtAssetId', 'in', ids)));
      return snapshot.docs.map((docSnapshot) => expenseFromSnapshot(docSnapshot));
    })
  );
  return perChunk.flat();
}

/**
 * «Collega la serie al mutuo»: link the occurrences of `expense`'s series still to come to the
 * property `debtAssetId`, each repaying its principal on its own date (lib/utils/mortgageRepayment.ts,
 * settled by the server like an account). The past is never touched: the debt typed on the property
 * already reflects it. Returns how many occurrences were linked.
 */
export async function linkSeriesToDebt(userId: string, expense: Expense, debtAssetId: string, now: Date): Promise<number> {
  const linkable = selectDebtLinkableOccurrences(await getSeriesOf(userId, expense), now);
  if (linkable.length === 0) return 0;
  const batch = writeBatch(db);
  for (const row of linkable) {
    batch.update(doc(db, EXPENSES_COLLECTION, row.id), { debtAssetId, balancePending: true, updatedAt: new Date() });
  }
  await batch.commit();
  await invalidateDashboardOverviewSummary(userId, 'expense_updated');
  return linkable.length;
}
