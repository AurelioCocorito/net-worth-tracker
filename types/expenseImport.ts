// Types for the historical expense/income CSV import tool.
// The pure parse/validate/plan layer lives in lib/utils/expenseImport.ts;
// the Firestore commit/undo layer in lib/services/expenseImportService.ts.

import { ExpenseType } from '@/types/expenses';
import type { AssetClass, AssetType } from '@/types/assets';

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
  // Investment rows (2026-10-25): `tipo` = acquisto / vendita / correzione. Optional, so a
  // spending-only file (and every test fixture written before) keeps its shape.
  /** The instrument's ISIN (column «isin»): the key a trade row is matched on. */
  isin?: string;
  /** Units bought/sold, or the new total on a correction (column «quantita»). */
  quantita?: string;
  /** Price per unit (column «prezzo»); on a correction, the new average cost. */
  prezzo?: string;
  /** Total EUR commissions of the trade (column «commissioni»). */
  commissioni?: string;
  /** SELL only: the tax the broker withheld at the sale, EUR (column «tasse»). */
  tasse?: string;
  // An instrument the app does not hold yet is created from these (on any of its rows).
  /** Instrument name (column «titolo»). */
  titolo?: string;
  /** Instrument type (column «strumento»): azione, etf, etc, obbligazione, crypto. */
  strumento?: string;
  /** Price ticker (column «simbolo»), as Yahoo Finance reads it (e.g. VWCE.MI). */
  simbolo?: string;
  /** Optional asset class (column «classe»); absent = the type's default class. */
  classe?: string;
  /** Optional tax rate % on gains (column «aliquota»); absent = 26. */
  aliquota?: string;
  /** Dividend/coupon rows: the ex-date (column «data_stacco»); absent = the payment date («data»). */
  dataStacco?: string;
  /**
   * The row's own code (column «codice», 2026-10-25): stable for the same bank movement, so a file
   * loaded twice, or two statements that overlap, never write it twice. Stored on the written row.
   */
  codice?: string;
}

/** The two income types an import row can carry: a dividend or a coupon (types/dividend.ts). */
export type ImportDividendType = 'ordinary' | 'coupon';

/** A dividend already in the registry, as the plan checks a row against it (no double counting). */
export interface ImportExistingDividend {
  assetId: string;
  exDate: Date;
  paymentDate: Date;
}

/**
 * A validated dividend/coupon row, written through POST /api/dividends — the route the dialog
 * uses, which also writes the income row of Tracciamento for a payment already made.
 */
export interface PlannedDividendRow {
  line: number;
  paymentDate: Date;
  exDate: Date;
  dividendType: ImportDividendType;
  isin: string;
  /** The held instrument; undefined when it is created by the same import (resolved at commit). */
  assetId?: string;
  quantity: number;
  grossAmount: number;
  taxAmount: number;
  currency: string;
  notes?: string;
}

/** The three trade types an import row can carry — the ledger's own (types/assetTransactions.ts). */
export type ImportTradeType = 'buy' | 'sell' | 'adjustment';

/**
 * An instrument the user already holds, as the plan matches trade rows against it (by ISIN,
 * case-insensitive). `ledger` = its type is managed by the trade ledger (stock, etf, bond, crypto,
 * commodity): only those accept trades.
 */
export interface ImportInstrument {
  id: string;
  name: string;
  isin?: string;
  ledger: boolean;
}

/**
 * A validated trade row, written through the trade ledger's own route (POST
 * /api/asset-transactions), which replays the instrument and refuses an impossible history.
 */
export interface PlannedTradeRow {
  line: number;
  date: Date;
  tradeType: ImportTradeType;
  /** Upper-case ISIN. */
  isin: string;
  /** The existing instrument; undefined when it is in `instrumentsToCreate` (resolved at commit). */
  assetId?: string;
  quantity: number;
  /** Per unit; on a correction, the new average cost. */
  pricePerUnit: number;
  fees?: number;
  withheldTaxEur?: number;
  /** The settlement account (buy debits, sell credits) — never on a correction. */
  linkedCashAssetId?: string;
  notes?: string;
}

/** An instrument the import creates (empty, like the form's ledger create) before its trades. */
export interface InstrumentToCreate {
  isin: string;
  name: string;
  ticker: string;
  type: AssetType;
  assetClass: AssetClass;
  currency: string;
  taxRate: number;
  /** The first row's price: the instrument's price until the next price update. */
  currentPrice: number;
}

/**
 * A cash account an imported row can be linked to (column «conto»), matched by name,
 * case-insensitive. Only `type === 'cash' && assetClass === 'cash'` assets, as in the form.
 */
export interface ImportCashAccount {
  id: string;
  name: string;
  /**
   * `pensionFund` (2026-10-25): a fondo pensione, valid ONLY as a transfer's destination — the row
   * becomes a voluntary contribution recorded in Previdenza. Absent = a cash account.
   */
  kind?: 'cash' | 'pensionFund';
  /** Today's balance in the app (a cash account's quantity): what a «saldo» row is compared against. */
  balance?: number;
}

/**
 * A cashflow row already in the data, as the plan checks the file against it (2026-10-25): the
 * same day, the same amount, the same accounts — and the same «codice» when both carry one — is a
 * row already imported or typed by hand, and is not written twice.
 */
export interface ImportExistingExpense {
  date: Date;
  type: ExpenseType;
  /** Signed, as stored (spending negative, income and transfers positive). */
  amount: number;
  linkedCashAssetId?: string;
  transferCashAssetId?: string;
  balancePending?: boolean;
  importRowCode?: string;
}

/** A trade already in the ledger, as the plan checks the file against it and reads its cash. */
export interface ImportExistingTrade {
  assetId: string;
  type: ImportTradeType;
  date: Date;
  quantity: number;
  pricePerUnit: number;
  linkedCashAssetId?: string;
  /** What it moved on its settlement account (computeCashDelta), signed. */
  cashDelta: number;
}

/** What the plan checks the file against for rows already in the data; all optional. */
export interface ImportExistingData {
  expenses?: ImportExistingExpense[];
  trades?: ImportExistingTrade[];
  /** The preview's «Importa anche le righe già presenti»: nothing is set aside. */
  includeDuplicates?: boolean;
}

/**
 * A «saldo» row (2026-10-25): the balance the bank statement shows for an account at the end of
 * a day. The plan computes what the app will hold for that day once the file is written; the
 * commit moves the account by the difference, so the balance matches the bank without typing it.
 */
export interface PlannedBalanceRow {
  line: number;
  date: Date;
  assetId: string;
  accountName: string;
  /** The statement's balance at the end of `date`. */
  statementBalance: number;
  /** What the app holds for that day after the import (today's balance minus what came after). */
  appBalance: number;
  /** statementBalance − appBalance: what the commit adds to the account. */
  delta: number;
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
  /** The row's «codice», stored on the written document as `importRowCode`. */
  importRowCode?: string;
  /**
   * The destination is a fondo pensione: the commit records a VOLUNTARY contribution through
   * recordPensionContribution (Previdenza record + its own transfer entry + both balances), never a
   * plain expense document. Its category is the transfer category ensureTransferCategory picks.
   */
  pensionContribution?: boolean;
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
  totalTransfer: number; // positive magnitude of all transfer rows (pension contributions included)
  /** Of the transfers, how many are contributions to a fondo pensione (recorded in Previdenza). */
  pensionContributionCount: number;
  /** Trade rows (included in validCount), by type. */
  buyCount: number;
  sellCount: number;
  adjustmentCount: number;
  /** Dividend and coupon rows (included in validCount) and their net total (gross − withholding). */
  dividendCount: number;
  couponCount: number;
  totalDividendNet: number;
  /** Rows set aside because they are already in the data (not counted in validCount nor skippedCount). */
  duplicateCount: number;
  /** «saldo» rows (included in validCount). */
  balanceCount: number;
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
  /** How many of `count` are trades: they settle on the import day, whatever their date. */
  tradeCount?: number;
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
  /** Trade rows (acquisto / vendita / correzione), committed after the expense rows. */
  tradeRows: PlannedTradeRow[];
  instrumentsToCreate: InstrumentToCreate[];
  /** Dividend and coupon rows, committed after the trades (an instrument they name may be created by them). */
  dividendRows: PlannedDividendRow[];
  /** «saldo» rows: the accounts the commit aligns to the statement, after every other row. */
  balanceRows: PlannedBalanceRow[];
  errors: RowError[];
  /** Rows already in the data, set aside (unless `includeDuplicates`): line and the reason. */
  duplicates: RowError[];
  categoriesToCreate: CategoryToCreate[];
  subCategoriesToCreate: SubCategoryToCreate[];
  notices: ImportNotice[];
  summary: ImportSummary;
}
