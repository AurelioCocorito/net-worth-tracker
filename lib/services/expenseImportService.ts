/**
 * Expense Import Service (thin Firestore layer)
 *
 * Commits an ImportPlan produced by the pure lib/utils/expenseImport.ts layer:
 * creates any missing categories/subcategories, then bulk-writes the expenses.
 *
 * Key behaviours:
 * - Every written expense is stamped with a shared `importBatchId`, so an entire
 *   import can be undone in one call (deleteExpensesByImportBatch).
 * - Amount sign convention is applied here (expenses negative, income positive) —
 *   the plan carries positive magnitudes.
 * - A row WITHOUT «conto» is linked to no account and moves no balance (the historical
 *   default). A row WITH «conto» (2026-10-24) carries `linkedCashAssetId` and follows the
 *   ONE settlement rule (lib/utils/cashSettlement.ts): a row dated today or earlier moves
 *   the account at once, a later one is written `balancePending` and settled by the server
 *   on its day. The undo gives back exactly what the batch applied, so an import and its
 *   undo leave the balances where they were.
 * - A `transfer` row (2026-10-25) is written as the form writes it: positive, origin in
 *   `linkedCashAssetId`, destination in `transferCashAssetId`; both legs settle on its date.
 * - A transfer INTO a fondo pensione (`pensionContribution`) is recorded through
 *   recordPensionContribution as a voluntary contribution, after the batch: the service writes the
 *   Previdenza record, its own transfer entry and both values. Both carry the `importBatchId`, and
 *   the undo deletes them through deletePensionContribution BEFORE the plain rows.
 * - Investment rows (`plan.tradeRows`, 2026-10-25) are written LAST, through
 *   lib/services/investmentImportService.ts (the trade ledger's own route), under the same
 *   `importBatchId`; the undo removes them FIRST. A trade the ledger refuses stops that half of the
 *   import at its row and is returned as `tradeFailure` — what was written stays, undoable.
 * - `existingCategories` is the same array the caller already fetched via
 *   `getAllCategories` to build the plan (never `getCategoriesByType`, which
 *   needs a composite index that isn't deployed). New categories/subcategories
 *   are resolved from the IDs returned by createCategory/updateCategory —
 *   no extra Firestore read is needed to find them.
 */

import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { removeUndefinedDeep as removeUndefinedFields } from '@/lib/utils/firestoreData';
import { invalidateDashboardOverviewSummary } from '@/lib/services/dashboardOverviewInvalidation';
import { createCategory, updateCategory } from '@/lib/services/expenseCategoryService';
import { categoryMatchKey } from '@/lib/utils/expenseImport';
import { appliedBalanceEffectsOf, settlesLater, type BalanceEffect } from '@/lib/utils/cashSettlement';
import { applyBalanceEffects, reverseAppliedBalances } from '@/lib/services/cashBalanceReconciliation';
import {
  recordPensionContribution,
  deletePensionContributionsByImportBatch,
} from '@/lib/services/pensionContributionService';
import { commitTradeRows, deleteTradesByImportBatch } from '@/lib/services/investmentImportService';
import { ImportPlan } from '@/types/expenseImport';
import { ExpenseCategory, ExpenseSubCategory } from '@/types/expenses';

const EXPENSES_COLLECTION = 'expenses';
const BATCH_LIMIT = 400; // mirror costCenterService chunking (Firestore hard limit is 500)

const norm = (s: string): string => s.trim().toLowerCase();
const genSubId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
const genImportBatchId = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `import-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

/**
 * Commit a validated ImportPlan for a user.
 *
 * Creates missing categories/subcategories, then writes plan.validRows as expense
 * documents tagged with a fresh importBatchId. Returns the batch id and the number
 * of expenses created (so the UI can offer "undo import").
 */
export async function commitImportPlan(
  userId: string,
  plan: ImportPlan,
  existingCategories: ExpenseCategory[]
): Promise<{ importBatchId: string; created: number; tradeFailure?: { line: number; message: string } }> {
  // Two lookups over the same objects, mirroring how the plan resolved: by document
  // id (rows that attached to an existing category) and by the shared (name, type)
  // key (rows whose category is created below). Same-named same-typed duplicates
  // keep the OLDEST document, matching buildImportPlan's resolution exactly.
  const byId = new Map<string, ExpenseCategory>(existingCategories.map((c) => [c.id, c]));
  const byKey = new Map<string, ExpenseCategory>();
  for (const c of [...existingCategories].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
    byKey.set(categoryMatchKey(c.name, c.type), c); // oldest last → oldest wins
  }

  // 1. Create brand-new categories, capturing their Firestore ID directly from createCategory.
  for (const c of plan.categoriesToCreate) {
    const subCategories: ExpenseSubCategory[] = c.subCategories.map((name) => ({ id: genSubId(), name }));
    const categoryId = await createCategory(userId, {
      name: c.name,
      type: c.type,
      subCategories,
      ...(c.type === 'transfer' ? { icon: 'ArrowLeftRight' } : {}), // as ensureTransferCategory
    });
    const created: ExpenseCategory = {
      id: categoryId,
      userId,
      name: c.name,
      type: c.type,
      subCategories,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    byId.set(categoryId, created);
    byKey.set(categoryMatchKey(c.name, c.type), created);
  }

  // 2. Add missing subcategories to already-existing categories, merging in-memory
  // (no re-read needed — we already hold the category's current subCategories).
  for (const s of plan.subCategoriesToCreate) {
    const category = byId.get(s.categoryId);
    if (!category) continue;
    const existingNames = new Set(category.subCategories.map((sc) => norm(sc.name)));
    const additions: ExpenseSubCategory[] = s.subCategoryNames
      .filter((n) => !existingNames.has(norm(n)))
      .map((name) => ({ id: genSubId(), name }));
    if (additions.length === 0) continue;
    const mergedSubCategories = [...category.subCategories, ...additions];
    await updateCategory(s.categoryId, { subCategories: mergedSubCategories });
    const merged = { ...category, subCategories: mergedSubCategories };
    byId.set(category.id, merged);
    byKey.set(categoryMatchKey(category.name, category.type), merged);
  }

  const importBatchId = genImportBatchId();
  const now = new Date();
  const effects: BalanceEffect[] = [];

  // 3. Bulk-write the expenses in chunks (Firestore hard limit is 500 ops/batch).
  const batches: ReturnType<typeof writeBatch>[] = [];
  let currentBatch = writeBatch(db);
  let opCount = 0;
  let created = 0;

  for (const row of plan.validRows) {
    if (row.pensionContribution) continue; // recorded in Previdenza below
    // Id resolved by the plan when the category pre-existed; (name, type) key for
    // the ones created in step 1.
    const category =
      (row.categoryId ? byId.get(row.categoryId) : undefined) ??
      byKey.get(categoryMatchKey(row.categoryName, row.type));
    if (!category) continue; // should not happen — every valid row's category was created/exists
    const sub = row.subCategoryName
      ? category.subCategories.find((sc) => norm(sc.name) === norm(row.subCategoryName!))
      : undefined;

    // Sign convention: income and transfers positive, fixed/variable/debt negative.
    const amount = row.type === 'income' || row.type === 'transfer' ? row.amount : -row.amount;
    const balancePending =
      (row.linkedCashAssetId || row.transferCashAssetId) && settlesLater(row.date, now) ? true : undefined;
    effects.push(
      ...appliedBalanceEffectsOf({
        type: row.type,
        amount,
        linkedCashAssetId: row.linkedCashAssetId,
        transferCashAssetId: row.transferCashAssetId,
        balancePending,
      })
    );

    const data = removeUndefinedFields({
      userId,
      type: row.type,
      categoryId: category.id,
      categoryName: category.name,
      subCategoryId: sub?.id,
      subCategoryName: sub?.name,
      amount,
      currency: row.currency,
      date: Timestamp.fromDate(row.date),
      notes: row.notes,
      isRecurring: false,
      linkedCashAssetId: row.linkedCashAssetId,
      transferCashAssetId: row.transferCashAssetId,
      balancePending,
      importBatchId,
      createdAt: now,
      updatedAt: now,
    });

    currentBatch.set(doc(collection(db, EXPENSES_COLLECTION)), data);
    created++;
    opCount++;
    if (opCount === BATCH_LIMIT) {
      batches.push(currentBatch);
      currentBatch = writeBatch(db);
      opCount = 0;
    }
  }
  if (opCount > 0) batches.push(currentBatch);

  await Promise.all(batches.map((b) => b.commit()));
  // The balances move only once the rows exist, in one transaction for every account the
  // batch touched — the same order as the expense form (write, then apply).
  await applyBalanceEffects(effects);

  // One at a time: each contribution moves the same account, and its service is not batched.
  for (const row of plan.validRows) {
    if (!row.pensionContribution || !row.transferCashAssetId) continue;
    await recordPensionContribution(userId, {
      assetId: row.transferCashAssetId,
      source: 'voluntary',
      amount: row.amount,
      date: row.date,
      notes: row.notes,
      sourceCashAssetId: row.linkedCashAssetId,
      importBatchId,
    });
    created++;
  }
  if (created > 0) await invalidateDashboardOverviewSummary(userId, 'expense_created');

  // The trades last: each goes through the ledger route, which invalidates its own summaries.
  if (plan.tradeRows.length > 0) {
    const trades = await commitTradeRows(userId, plan, importBatchId);
    return { importBatchId, created: created + trades.created, tradeFailure: trades.failure };
  }
  return { importBatchId, created };
}

/**
 * Delete every expense written by a given import batch. Used by the "Annulla import"
 * action, right after the import or later from the list of past imports. Gives back
 * first what the batch's linked rows applied to their accounts (a row still pending
 * gave nothing and gets nothing back). Returns the number of expenses deleted.
 */
export async function deleteExpensesByImportBatch(userId: string, importBatchId: string): Promise<number> {
  // First the trades (and the instruments the batch created): a settled trade gives its account
  // back through the ledger route, before the plain rows' balances are reversed below.
  const trades = await deleteTradesByImportBatch(userId, importBatchId);
  // Then the pension contributions: deleting one also deletes its transfer entry and gives back
  // both values, so the query below no longer sees (and never reverses twice) those entries.
  const contributions = await deletePensionContributionsByImportBatch(userId, importBatchId);
  const q = query(
    collection(db, EXPENSES_COLLECTION),
    where('userId', '==', userId),
    where('importBatchId', '==', importBatchId)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return trades + contributions;

  await reverseAppliedBalances(
    snapshot.docs.map((d) => {
      const data = d.data();
      return {
        type: data.type,
        amount: data.amount,
        linkedCashAssetId: data.linkedCashAssetId,
        transferCashAssetId: data.transferCashAssetId,
        balancePending: data.balancePending,
      };
    })
  );

  const batches: ReturnType<typeof writeBatch>[] = [];
  let currentBatch = writeBatch(db);
  let opCount = 0;

  snapshot.docs.forEach((d) => {
    currentBatch.delete(d.ref);
    opCount++;
    if (opCount === BATCH_LIMIT) {
      batches.push(currentBatch);
      currentBatch = writeBatch(db);
      opCount = 0;
    }
  });
  if (opCount > 0) batches.push(currentBatch);

  await Promise.all(batches.map((b) => b.commit()));
  await invalidateDashboardOverviewSummary(userId, 'expense_deleted');

  return trades + contributions + snapshot.size;
}
