// Types for the historical expense/income CSV import tool.
// The pure parse/validate/plan layer lives in lib/utils/expenseImport.ts;
// the Firestore commit/undo layer in lib/services/expenseImportService.ts.

import { ExpenseType } from '@/types/expenses';

// Every ExpenseType is importable. A `transfer` (2026-10-25) names its two accounts:
// «conto» the origin, «conto_destinazione» the destination — a transfer without both
// would be a net-zero inert row, so the plan rejects it.
export type ImportableExpenseType = ExpenseType;

/**
 * A single raw CSV row after header normalization (IT/EN aliases → canonical keys),
 * before any validation or type coercion. All values are trimmed strings.
 * `line` is the 1-based source line number (excluding the header) for error reporting.
 */
export interface RawRow {
  line: number;
  data: string;
  importo: string;
  tipo: string;
  categoria: string;
  sottocategoria: string;
  note: string;
  valuta: string;
  /** Optional account name (column «conto»); empty = the row is linked to no account. On a transfer, the origin. */
  conto: string;
  /** Destination account name (column «conto_destinazione»), on a transfer only. */
  contoDestinazione: string;
}

/**
 * A cash account an imported row can be linked to (column «conto»), matched by name,
 * case-insensitive. Only `type === 'cash' && assetClass === 'cash'` assets, as in the form.
 */
export interface ImportCashAccount {
  id: string;
  name: string;
}

/**
 * A fully validated row ready to be written as an Expense document.
 * `amount` is the positive magnitude; the sign is applied at commit time
 * from `type` (expenses negative, income positive).
 */
export interface PlannedExpenseRow {
  line: number;
  date: Date;
  amount: number; // positive magnitude
  type: ImportableExpenseType;
  categoryName: string;
  /**
   * Firestore id of the EXISTING category this row attaches to, resolved by the
   * plan on (name, type) — oldest document wins when two share both. Undefined
   * when the category is in `categoriesToCreate`: the commit resolves it from
   * the id returned by createCategory.
   */
  categoryId?: string;
  subCategoryName?: string;
  notes?: string;
  currency: string;
  /**
   * The cash account the row is linked to (column «conto»). A linked row moves that
   * account's balance on its own date, exactly as the expense form does
   * (lib/utils/cashSettlement.ts); undefined = no account, nothing moves.
   */
  linkedCashAssetId?: string;
  /** On a transfer: the destination account (column «conto_destinazione»); origin = linkedCashAssetId. */
  transferCashAssetId?: string;
}

/** A row that failed validation (or was intentionally skipped, e.g. transfer). */
export interface RowError {
  line: number;
  reason: string;
  raw?: Partial<RawRow>;
}

/**
 * A category that does not yet exist for the user and must be created before
 * the expenses referencing it can be written. `subCategories` are the new
 * subcategory names required by the imported rows.
 */
export interface CategoryToCreate {
  name: string;
  type: ImportableExpenseType;
  subCategories: string[];
}

/**
 * New subcategories to add to an already-existing category.
 * `categoryId` is the existing category's Firestore ID.
 */
export interface SubCategoryToCreate {
  categoryId: string;
  categoryName: string;
  subCategoryNames: string[];
}

/** Human-facing summary shown in the preview step before committing. */
export interface ImportSummary {
  validCount: number;
  skippedCount: number;
  newCategoriesCount: number;
  totalIncome: number;
  totalExpense: number; // positive magnitude of all expense rows (transfers excluded)
  transferCount: number;
  totalTransfer: number; // positive magnitude of all transfer rows
  dateFrom?: Date;
  dateTo?: Date;
  /** Per linked account: how many rows and their signed net (income +, spending −), for the preview. */
  accounts: ImportAccountSummary[];
}

export interface ImportAccountSummary {
  assetId: string;
  name: string;
  count: number;
  /** Signed sum of the account's rows (a transfer − on its origin, + on its destination): what its balance moves by once every row's date has come. */
  net: number;
}

/**
 * A non-blocking disclosure the preview must surface before commit: the plan made
 * a deterministic choice the user should see (e.g. two same-named same-typed
 * categories exist and the rows will attach to the oldest one).
 */
export interface ImportNotice {
  categoryName: string;
  type: ImportableExpenseType;
  /** How many existing categories share this (name, type) identity. */
  duplicateCount: number;
  /** Ready-to-render Italian sentence. */
  message: string;
}

/**
 * The complete plan produced by buildImportPlan: what will be written, what
 * categories/subcategories will be created, and what was rejected — all before
 * touching Firestore.
 */
export interface ImportPlan {
  validRows: PlannedExpenseRow[];
  errors: RowError[];
  categoriesToCreate: CategoryToCreate[];
  subCategoriesToCreate: SubCategoryToCreate[];
  notices: ImportNotice[];
  summary: ImportSummary;
}
