/**
 * Pure parse / validate / plan layer for the historical expense-income CSV import.
 *
 * No Firestore here — everything is a pure function so it can be unit-tested.
 * The Firestore commit/undo lives in lib/services/expenseImportService.ts and the
 * wizard UI in components/settings/ExpenseImportSection.tsx.
 *
 * Design notes:
 * - Tolerant to Italian-locale CSVs: delimiter auto-detected (`;`/`,`/tab via Papa
 *   Parse), decimal separator handled for both `1.234,56` (IT) and `1234.56` (EN).
 * - Headers accepted in Italian (canonical) or English (alias), case-insensitive.
 * - `type` optional → inherits the type of the single existing same-named category
 *   when there is exactly one, falls back to `variable` when there is none, and is
 *   rejected as ambiguous when same-named categories of different types exist.
 * - Transfers (2026-10-25): `tipo` = `transfer`, or an empty `tipo` beside a filled
 *   «conto_destinazione». «conto» is the origin, «conto_destinazione» the destination
 *   (cash accounts only); «categoria» may be empty and then falls on the user's transfer
 *   category (the oldest, or a new «Trasferimenti»). Written like the form's transfer:
 *   positive, both accounts on the row, each leg settled on the row's date.
 * - A transfer whose destination is a fondo pensione (2026-10-25) is a VOLUNTARY contribution:
 *   the commit records it in Previdenza (recordPensionContribution), which writes its own transfer
 *   entry and moves both values at once — so a future date is rejected, and a fund is never an
 *   origin nor the account of a spending/income row.
 * - Category identity is (name, type) — the same rule as the rest of the app
 *   (lib/utils/expenseGrouping.ts): "Casa" fissa and "Casa" variabile are two
 *   distinct categories, resolvable and creatable side by side. When two existing
 *   categories share BOTH name and type, rows attach to the OLDEST document
 *   (deterministic) and the plan carries a notice the preview must show.
 * - Optional «conto» column (2026-10-24): the row is linked to that cash account and
 *   moves its balance on its own date, like a row saved from the form. Without it the
 *   row is linked to nothing and no balance moves (the historical behaviour).
 * - Investment rows (2026-10-25): `tipo` = `acquisto`/`buy`, `vendita`/`sell` or
 *   `correzione`/`adjustment`, matched on «isin» against the instruments the user holds, with
 *   «quantita», «prezzo» (or «importo», from which the price is derived), «commissioni» and,
 *   on a sale, «tasse». An unknown ISIN is created from «titolo», «strumento», «simbolo»
 *   (+ optional «classe», «aliquota», «valuta»). They are written through the trade ledger's
 *   route, which replays the instrument; a correction sets quantity and average cost at once —
 *   the way to load today's portfolio. «categoria» is ignored on them.
 * - Dividend rows (2026-10-25): `tipo` = `dividendo`/`dividend` or `cedola`/`coupon`, matched on
 *   «isin», «data» = the payment date (+ optional «data_stacco»), «quantita», «importo» = the
 *   GROSS amount, «tasse» = the withholding. Written through the dividend route, which also writes
 *   the income row of Tracciamento; a payment already in the registry (same instrument, same
 *   payment or ex day — e.g. downloaded from Borsa Italiana) is refused, never counted twice.
 */

import Papa from 'papaparse';
import { roundToCents } from '@/lib/utils/cents';
import { settlesLater } from '@/lib/utils/cashSettlement';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';
import { Expense, ExpenseCategory, EXPENSE_TYPE_LABELS } from '@/types/expenses';
import type { AssetClass, AssetType } from '@/types/assets';
import {
  RawRow,
  PlannedExpenseRow,
  RowError,
  CategoryToCreate,
  SubCategoryToCreate,
  ImportNotice,
  ImportPlan,
  ImportSummary,
  ImportCashAccount,
  ImportAccountSummary,
  ImportableExpenseType,
  ImportInstrument,
  ImportTradeType,
  ImportDividendType,
  ImportExistingDividend,
  PlannedDividendRow,
  InstrumentToCreate,
  PlannedTradeRow,
} from '@/types/expenseImport';

const IMPORTABLE_TYPES: ImportableExpenseType[] = ['fixed', 'variable', 'debt', 'income', 'transfer'];

/** The category a transfer row with an empty «categoria» lands in when the user has none (as ensureTransferCategory). */
export const DEFAULT_TRANSFER_CATEGORY_NAME = 'Trasferimenti';

// Header aliases → canonical Italian key. Matching is case-insensitive and trimmed.
const HEADER_ALIASES: Record<string, keyof Omit<RawRow, 'line'>> = {
  data: 'data',
  date: 'data',
  importo: 'importo',
  amount: 'importo',
  tipo: 'tipo',
  type: 'tipo',
  categoria: 'categoria',
  category: 'categoria',
  sottocategoria: 'sottocategoria',
  subcategoria: 'sottocategoria',
  subcategory: 'sottocategoria',
  'sub-category': 'sottocategoria',
  note: 'note',
  nota: 'note',
  notes: 'note',
  valuta: 'valuta',
  currency: 'valuta',
  conto: 'conto',
  'conto corrente': 'conto',
  account: 'conto',
  conto_destinazione: 'contoDestinazione',
  'conto destinazione': 'contoDestinazione',
  'conto di destinazione': 'contoDestinazione',
  destinazione: 'contoDestinazione',
  destination: 'contoDestinazione',
  'to account': 'contoDestinazione',
  isin: 'isin',
  quantita: 'quantita',
  'quantità': 'quantita',
  qta: 'quantita',
  quantity: 'quantita',
  prezzo: 'prezzo',
  'prezzo unitario': 'prezzo',
  prezzo_unitario: 'prezzo',
  price: 'prezzo',
  commissioni: 'commissioni',
  fees: 'commissioni',
  tasse: 'tasse',
  'tasse trattenute': 'tasse',
  tasse_trattenute: 'tasse',
  tax: 'tasse',
  titolo: 'titolo',
  'nome titolo': 'titolo',
  name: 'titolo',
  strumento: 'strumento',
  'tipo strumento': 'strumento',
  tipo_strumento: 'strumento',
  instrument: 'strumento',
  simbolo: 'simbolo',
  ticker: 'simbolo',
  classe: 'classe',
  'asset class': 'classe',
  aliquota: 'aliquota',
  'tax rate': 'aliquota',
  data_stacco: 'dataStacco',
  'data stacco': 'dataStacco',
  'ex date': 'dataStacco',
  ex_date: 'dataStacco',
};

/** `tipo` values of a dividend row → the registry's dividend type. */
const DIVIDEND_TYPE_ALIASES: Record<string, ImportDividendType> = {
  dividendo: 'ordinary',
  dividend: 'ordinary',
  cedola: 'coupon',
  coupon: 'coupon',
};

/** Whether a `tipo` cell names a dividend or coupon row. */
export function isDividendTypeCell(tipo: string): boolean {
  return DIVIDEND_TYPE_ALIASES[tipo.trim().toLowerCase()] !== undefined;
}

/** `tipo` values of an investment row → the ledger's trade type. */
const TRADE_TYPE_ALIASES: Record<string, ImportTradeType> = {
  acquisto: 'buy',
  buy: 'buy',
  vendita: 'sell',
  sell: 'sell',
  correzione: 'adjustment',
  rettifica: 'adjustment',
  adjustment: 'adjustment',
};

/** «strumento» → AssetType. Only the ledger's types: an account or a house is not traded. */
const INSTRUMENT_TYPE_ALIASES: Record<string, AssetType> = {
  azione: 'stock',
  azioni: 'stock',
  stock: 'stock',
  etf: 'etf',
  fondo: 'etf',
  etc: 'commodity',
  etn: 'commodity',
  'materia prima': 'commodity',
  commodity: 'commodity',
  obbligazione: 'bond',
  obbligazioni: 'bond',
  bond: 'bond',
  certificate: 'bond',
  crypto: 'crypto',
  criptovaluta: 'crypto',
};

/** «classe» → AssetClass, in the app's Italian labels (ASSET_CLASS_LABELS) or its ids. */
const ASSET_CLASS_ALIASES: Record<string, AssetClass> = {
  azioni: 'equity',
  azionario: 'equity',
  equity: 'equity',
  obbligazioni: 'bonds',
  obbligazionario: 'bonds',
  bonds: 'bonds',
  'materie prime': 'commodity',
  commodity: 'commodity',
  criptovalute: 'crypto',
  crypto: 'crypto',
  'liquidità': 'cash',
  liquidita: 'cash',
  cash: 'cash',
  'trend following': 'trendFollowing',
  trendfollowing: 'trendFollowing',
  carry: 'carry',
};

/** The class an instrument type falls in when «classe» is empty (as AssetDialog's TYPE_TO_CLASS). */
const DEFAULT_CLASS_OF_TYPE: Partial<Record<AssetType, AssetClass>> = {
  stock: 'equity',
  etf: 'equity',
  bond: 'bonds',
  commodity: 'commodity',
  crypto: 'crypto',
};

/** The tax rate on gains a created instrument gets without «aliquota» (the Italian 26%). */
export const DEFAULT_IMPORT_TAX_RATE = 26;

/** Whether a `tipo` cell names an investment row (acquisto / vendita / correzione). */
export function isTradeTypeCell(tipo: string): boolean {
  return TRADE_TYPE_ALIASES[tipo.trim().toLowerCase()] !== undefined;
}

/** Template shown/downloaded to guide users. Excel-IT friendly (`;` + BOM). */
const TEMPLATE_HEADERS = [
  'data', 'importo', 'tipo', 'categoria', 'sottocategoria', 'note', 'valuta', 'conto', 'conto_destinazione',
  'isin', 'quantita', 'prezzo', 'commissioni', 'tasse', 'titolo', 'strumento', 'simbolo', 'classe', 'aliquota',
  'data_stacco',
] as const;
const TEMPLATE_EXAMPLE_ROWS: string[][] = [
  ['2024-01-15', '1200,00', 'fixed', 'Casa', 'Affitto', 'Canone gennaio', 'EUR', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['2024-01-27', '2500,00', 'income', 'Stipendio', '', 'Busta paga', 'EUR', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['2024-02-03', '54,90', 'variable', 'Spesa', 'Supermercato', '', 'EUR', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['2024-02-05', '500,00', 'transfer', '', '', 'Bonifico per investimento', 'EUR', 'Conto corrente', 'Conto deposito', '', '', '', '', '', '', '', '', '', '', ''],
  ['2024-02-06', '', 'acquisto', '', '', '', 'EUR', 'Conto corrente', '', 'IE00EXAMPLE1', '10', '50,00', '2,95', '', 'Esempio World ETF', 'etf', 'EXMP.MI', '', '', ''],
  ['2024-03-01', '', 'vendita', '', '', '', 'EUR', 'Conto corrente', '', 'IE00EXAMPLE1', '4', '55,00', '2,95', '5,20', '', '', '', '', '', ''],
  ['2024-03-31', '', 'correzione', '', '', 'Allineamento al broker', 'EUR', '', '', 'IE00EXAMPLE1', '6', '50,30', '', '', '', '', '', '', '', ''],
  ['2024-04-15', '12,00', 'dividendo', '', '', '', 'EUR', '', '', 'IE00EXAMPLE1', '6', '', '', '3,12', '', '', '', '', '', '2024-04-02'],
];

/** Build the downloadable CSV template as a string (with UTF-8 BOM + `;` delimiter). */
export function buildTemplateCsv(): string {
  const rows = [TEMPLATE_HEADERS as unknown as string[], ...TEMPLATE_EXAMPLE_ROWS];
  const body = rows.map((r) => r.join(';')).join('\r\n');
  return '﻿' + body;
}

/**
 * Parse an Italian-locale number string into a JS number, or null if not parseable.
 *
 * Handles both `1.234,56` (IT: dot thousands, comma decimal) and `1234.56` (EN).
 * A lone comma is ALWAYS the decimal separator (2026-10-25, the owner's rule): `224,139` is
 * 224,139 € — a price or a quantity carries three or four decimals, and reading it as a
 * thousands group once made an Amazon share worth 224.139 €. More than one comma with no dot
 * (`1,234,567`) is refused. A lone dot keeps the heuristic: followed by exactly 3 digits it is
 * a thousands group (`1.234` → 1234), otherwise the decimal separator (`12.50`).
 * The returned value is always the positive magnitude (sign comes from the type).
 */
export function parseItalianNumber(input: string): number | null {
  if (input == null) return null;
  // Keep only digits and separators (strips € spaces etc.), drop sign.
  const s = String(input).trim().replace(/[^\d.,]/g, '');
  if (s === '') return null;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  let normalized: string;

  if (hasComma && hasDot) {
    // The separator that appears last is the decimal; the other is thousands.
    const decimalSep = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
    const thousandsSep = decimalSep === ',' ? '.' : ',';
    normalized = s.split(thousandsSep).join('').replace(decimalSep, '.');
  } else if (hasComma) {
    const parts = s.split(',');
    if (parts.length > 2) return null;
    normalized = parts.join('.');
  } else if (hasDot) {
    const sep = '.';
    const parts = s.split(sep);
    const lastPart = parts[parts.length - 1];
    // Multiple occurrences, or a single one grouping exactly 3 digits → thousands.
    const isThousands = parts.length > 2 || (parts.length === 2 && lastPart.length === 3);
    normalized = isThousands ? parts.join('') : parts.join('.');
  } else {
    normalized = s;
  }

  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.abs(n);
}

/**
 * Parse a date accepting `YYYY-MM-DD` (ISO) or `DD/MM/YYYY` (also `.`/`-` separated).
 * Returns a local Date at midday (avoids TZ/DST month shifts), or null if invalid.
 */
export function parseFlexibleDate(input: string): Date | null {
  if (input == null) return null;
  const s = String(input).trim();
  if (s === '') return null;

  let y: number, m: number, d: number;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const eu = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (iso) {
    y = +iso[1]; m = +iso[2]; d = +iso[3];
  } else if (eu) {
    d = +eu[1]; m = +eu[2]; y = +eu[3];
  } else {
    return null;
  }

  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, m - 1, d, 12, 0, 0, 0);
  // Reject overflow (e.g. 31/02 rolling into March).
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return null;
  }
  return date;
}

/**
 * Tokenize a raw CSV string into normalized RawRows.
 *
 * Uses Papa Parse (delimiter auto-detection, RFC-4180 quoting so notes may
 * contain the delimiter). Header cells are matched against HEADER_ALIASES;
 * unknown columns are ignored. Throws if required columns are missing.
 */
export function parseImportCsv(raw: string): RawRow[] {
  const text = raw.replace(/^﻿/, '');
  const parsed = Papa.parse<string[]>(text, {
    skipEmptyLines: 'greedy',
  });
  const table = parsed.data.filter((r) => Array.isArray(r) && r.some((c) => String(c).trim() !== ''));
  if (table.length === 0) {
    throw new Error('Il file è vuoto.');
  }

  const header = table[0];
  const colIndex: Partial<Record<keyof Omit<RawRow, 'line'>, number>> = {};
  header.forEach((cell, idx) => {
    const key = HEADER_ALIASES[String(cell).trim().toLowerCase()];
    if (key && colIndex[key] === undefined) colIndex[key] = idx;
  });

  // «categoria» is required as a COLUMN (a transfer row may leave its cell empty) — unless the
  // file carries «isin»: a file of investment rows only (today's portfolio) needs neither it nor
  // «importo».
  const required = colIndex.isin !== undefined ? (['data', 'tipo'] as const) : (['data', 'importo', 'categoria'] as const);
  const missing = required.filter((k) => colIndex[k] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `Intestazioni obbligatorie mancanti: ${missing.join(', ')}. ` +
        `Attese: ${TEMPLATE_HEADERS.join(', ')}.`
    );
  }

  const get = (row: string[], key: keyof Omit<RawRow, 'line'>): string => {
    const i = colIndex[key];
    return i === undefined ? '' : String(row[i] ?? '').trim();
  };

  const rows: RawRow[] = [];
  for (let i = 1; i < table.length; i++) {
    const row = table[i];
    rows.push({
      line: i, // 1-based, excluding header
      data: get(row, 'data'),
      importo: get(row, 'importo'),
      tipo: get(row, 'tipo'),
      categoria: get(row, 'categoria'),
      sottocategoria: get(row, 'sottocategoria'),
      note: get(row, 'note'),
      valuta: get(row, 'valuta'),
      conto: get(row, 'conto'),
      contoDestinazione: get(row, 'contoDestinazione'),
      isin: get(row, 'isin'),
      quantita: get(row, 'quantita'),
      prezzo: get(row, 'prezzo'),
      commissioni: get(row, 'commissioni'),
      tasse: get(row, 'tasse'),
      titolo: get(row, 'titolo'),
      strumento: get(row, 'strumento'),
      simbolo: get(row, 'simbolo'),
      classe: get(row, 'classe'),
      aliquota: get(row, 'aliquota'),
      dataStacco: get(row, 'dataStacco'),
    });
  }
  return rows;
}

const norm = (s: string): string => s.trim().toLowerCase();

/**
 * The category identity the import resolves against: (normalized name, type).
 * Shared with the commit layer (expenseImportService) so plan and write can never
 * disagree on which document a row attaches to.
 */
export function categoryMatchKey(name: string, type: string): string {
  return `${type}::${norm(name)}`;
}

/**
 * Turn raw rows into a full ImportPlan against the user's existing categories.
 *
 * Row-level validation produces PlannedExpenseRows or RowErrors. Categories are
 * resolved by (name, type): a same-named category of a different type is a
 * different document, never a conflict. Rows without a type inherit the single
 * existing namesake's type (ambiguous namesakes are rejected with the reason).
 * Two existing categories sharing BOTH name and type resolve to the oldest one,
 * and the plan carries a notice the preview must display. Finally it derives
 * which categories / subcategories must be created and a human-facing summary.
 *
 * The optional «conto» column links a row to one of `cashAccounts` by name
 * (case-insensitive); an unknown or ambiguous name rejects the row — a typo must
 * never land as an unlinked row that silently leaves the balance where it was.
 * `defaultAccountId` (the preview's «Conto per le righe senza conto») links every
 * row whose «conto» cell is empty — a whole bank statement lands on its account
 * without the column at all; on a transfer it is the origin.
 * An account of kind `pensionFund` is accepted only as a transfer's destination; `now` decides
 * which contribution dates are in the future (refused: the contribution moves the values at once).
 * `instruments` are the user's assets the investment rows match by ISIN (see planTradeRows);
 * `existingDividends` the registry the dividend rows are checked against (see planDividendRows).
 */
export function buildImportPlan(
  rows: RawRow[],
  existingCategories: ExpenseCategory[],
  cashAccounts: ImportCashAccount[] = [],
  defaultAccountId?: string,
  now: Date = new Date(),
  instruments: ImportInstrument[] = [],
  existingDividends: ImportExistingDividend[] = []
): ImportPlan {
  const accountsByName = new Map<string, ImportCashAccount[]>();
  for (const a of cashAccounts) {
    accountsByName.set(norm(a.name), [...(accountsByName.get(norm(a.name)) ?? []), a]);
  }
  const accountNames = cashAccounts.map((a) => a.name).join(', ') || 'nessuno';
  const pensionFundIds = new Set(cashAccounts.filter((a) => a.kind === 'pensionFund').map((a) => a.id));

  // (name, type) → existing categories, oldest first: [0] is the resolution target.
  const existingByKey = new Map<string, ExpenseCategory[]>();
  // name → importable types it exists under, for the untyped-row inheritance rule.
  const existingTypesByName = new Map<string, Set<ImportableExpenseType>>();
  for (const c of existingCategories) {
    if (!(IMPORTABLE_TYPES as string[]).includes(c.type)) continue;
    const key = categoryMatchKey(c.name, c.type);
    existingByKey.set(key, [...(existingByKey.get(key) ?? []), c]);
    const nameKey = norm(c.name);
    if (!existingTypesByName.has(nameKey)) existingTypesByName.set(nameKey, new Set());
    existingTypesByName.get(nameKey)!.add(c.type as ImportableExpenseType);
  }
  for (const list of existingByKey.values()) {
    list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  // Where a transfer row with an empty «categoria» lands: the oldest transfer category,
  // the same one the form picks (ExpenseDialog, ensureTransferCategory).
  const defaultTransferCategoryName =
    existingCategories
      .filter((c) => c.type === 'transfer')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]?.name ?? DEFAULT_TRANSFER_CATEGORY_NAME;

  const resolveAccount = (name: string): { id: string } | { error: string } => {
    const matches = accountsByName.get(norm(name)) ?? [];
    if (matches.length === 1) return { id: matches[0].id };
    return {
      error:
        matches.length === 0
          ? `Conto "${name}" non trovato. Conti disponibili: ${accountNames}.`
          : `Conto "${name}" ambiguo: ${matches.length} conti hanno questo nome.`,
    };
  };

  const errors: RowError[] = [];
  const validRows: PlannedExpenseRow[] = [];

  // Investment rows take their own path: they write trades, not expense documents.
  const trades = planTradeRows(
    rows.filter((r) => isTradeTypeCell(r.tipo)),
    instruments,
    { resolveAccount, defaultAccountId, pensionFundIds, now }
  );
  errors.push(...trades.errors);
  const dividends = planDividendRows(
    rows.filter((r) => isDividendTypeCell(r.tipo)),
    instruments,
    new Set(trades.instrumentsToCreate.map((i) => i.isin)),
    existingDividends,
    now
  );
  errors.push(...dividends.errors);

  for (const row of rows) {
    if (isTradeTypeCell(row.tipo) || isDividendTypeCell(row.tipo)) continue;
    const rawType = norm(row.tipo);
    const isTransfer = rawType === 'transfer' || (rawType === '' && row.contoDestinazione !== '');
    if (!row.categoria && !isTransfer) {
      errors.push({ line: row.line, reason: 'Categoria mancante.', raw: row });
      continue;
    }

    const date = parseFlexibleDate(row.data);
    if (!date) {
      errors.push({ line: row.line, reason: `Data non valida: "${row.data}".`, raw: row });
      continue;
    }

    const amount = parseItalianNumber(row.importo);
    if (amount === null || amount === 0) {
      errors.push({ line: row.line, reason: `Importo non valido: "${row.importo}".`, raw: row });
      continue;
    }

    let type: ImportableExpenseType;
    if (isTransfer) {
      type = 'transfer';
    } else if (rawType === '') {
      // Untyped row: inherit the type of the single existing namesake — defaulting
      // blindly to 'variable' beside an existing fixed "Casa" would silently create
      // a same-named duplicate. Ambiguous namesakes need the user to say which.
      const namesakeTypes = existingTypesByName.get(norm(row.categoria)) ?? new Set<ImportableExpenseType>();
      if (namesakeTypes.size > 1) {
        const labels = [...namesakeTypes].map((t) => EXPENSE_TYPE_LABELS[t]).join(' e ');
        errors.push({
          line: row.line,
          reason: `Tipo mancante e ambiguo: "${row.categoria}" esiste sia come ${labels}. Specifica il tipo nella colonna "tipo".`,
          raw: row,
        });
        continue;
      }
      type = namesakeTypes.size === 1 ? [...namesakeTypes][0] : 'variable';
    } else if ((IMPORTABLE_TYPES as string[]).includes(rawType)) {
      type = rawType as ImportableExpenseType;
    } else {
      errors.push({ line: row.line, reason: `Tipo non valido: "${row.tipo}".`, raw: row });
      continue;
    }

    let linkedCashAssetId: string | undefined = defaultAccountId;
    if (row.conto) {
      const account = resolveAccount(row.conto);
      if ('error' in account) {
        errors.push({ line: row.line, reason: account.error, raw: row });
        continue;
      }
      linkedCashAssetId = account.id;
    }
    if (linkedCashAssetId && pensionFundIds.has(linkedCashAssetId)) {
      errors.push({
        line: row.line,
        reason: `"${row.conto}" è un fondo pensione: può essere solo la destinazione di un trasferimento ("conto_destinazione").`,
        raw: row,
      });
      continue;
    }

    let transferCashAssetId: string | undefined;
    if (type === 'transfer') {
      // A transfer IS its pair of accounts: without both it would move no money.
      if (!linkedCashAssetId) {
        errors.push({ line: row.line, reason: 'Trasferimento senza conto di partenza (colonna "conto").', raw: row });
        continue;
      }
      if (!row.contoDestinazione) {
        errors.push({ line: row.line, reason: 'Trasferimento senza conto di destinazione (colonna "conto_destinazione").', raw: row });
        continue;
      }
      const destination = resolveAccount(row.contoDestinazione);
      if ('error' in destination) {
        errors.push({ line: row.line, reason: destination.error, raw: row });
        continue;
      }
      if (destination.id === linkedCashAssetId) {
        errors.push({ line: row.line, reason: 'Origine e destinazione del trasferimento sono lo stesso conto.', raw: row });
        continue;
      }
      if (pensionFundIds.has(destination.id) && settlesLater(date, now)) {
        errors.push({
          line: row.line,
          reason: 'Versamento al fondo pensione con data futura: registralo quando è avvenuto.',
          raw: row,
        });
        continue;
      }
      transferCashAssetId = destination.id;
    } else if (row.contoDestinazione) {
      errors.push({
        line: row.line,
        reason: `"conto_destinazione" vale solo per i trasferimenti (tipo "transfer"), non per ${EXPENSE_TYPE_LABELS[type]}.`,
        raw: row,
      });
      continue;
    }

    const categoryName = row.categoria.trim() || defaultTransferCategoryName;
    const resolved = existingByKey.get(categoryMatchKey(categoryName, type))?.[0];
    validRows.push({
      line: row.line,
      date,
      amount,
      type,
      categoryName,
      categoryId: resolved?.id,
      subCategoryName: row.sottocategoria ? row.sottocategoria.trim() : undefined,
      notes: row.note || undefined,
      currency: (row.valuta || 'EUR').toUpperCase(),
      linkedCashAssetId,
      transferCashAssetId,
      pensionContribution: transferCashAssetId && pensionFundIds.has(transferCashAssetId) ? true : undefined,
    });
  }

  // Derive categories / subcategories to create from the valid rows — keyed by
  // (name, type), so "Casa" fissa and "Casa" variabile can be created side by side.
  const categoriesToCreate: CategoryToCreate[] = [];
  const subCategoriesToCreate: SubCategoryToCreate[] = [];
  const notices: ImportNotice[] = [];
  const newCatByKey = new Map<string, CategoryToCreate>();
  const subAddByKey = new Map<string, SubCategoryToCreate>();
  const noticedKeys = new Set<string>();

  for (const c of validRows) {
    const key = categoryMatchKey(c.categoryName, c.type);
    const existingList = existingByKey.get(key);
    const existing = existingList?.[0];

    // Two existing categories share this exact (name, type): the attachment to the
    // oldest is deterministic but must be DISCLOSED, not silent — the preview is
    // mandatory before any write, so this is where the user gets to see it.
    if (existingList && existingList.length > 1 && !noticedKeys.has(key)) {
      noticedKeys.add(key);
      notices.push({
        categoryName: existing!.name,
        type: c.type,
        duplicateCount: existingList.length,
        message: `Esistono ${existingList.length} categorie «${existing!.name}» (${EXPENSE_TYPE_LABELS[c.type]}): le righe importate verranno agganciate alla più vecchia.`,
      });
    }

    if (!existing) {
      let entry = newCatByKey.get(key);
      if (!entry) {
        entry = { name: c.categoryName, type: c.type, subCategories: [] };
        newCatByKey.set(key, entry);
        categoriesToCreate.push(entry);
      }
      if (c.subCategoryName && !entry.subCategories.some((s) => norm(s) === norm(c.subCategoryName!))) {
        entry.subCategories.push(c.subCategoryName);
      }
    } else if (c.subCategoryName) {
      const alreadyHas = existing.subCategories.some((s) => norm(s.name) === norm(c.subCategoryName!));
      if (!alreadyHas) {
        let entry = subAddByKey.get(key);
        if (!entry) {
          entry = { categoryId: existing.id, categoryName: existing.name, subCategoryNames: [] };
          subAddByKey.set(key, entry);
          subCategoriesToCreate.push(entry);
        }
        if (!entry.subCategoryNames.some((s) => norm(s) === norm(c.subCategoryName!))) {
          entry.subCategoryNames.push(c.subCategoryName);
        }
      }
    }
  }

  errors.sort((a, b) => a.line - b.line);
  const summary = buildSummary(validRows, trades.tradeRows, dividends.dividendRows, errors, categoriesToCreate.length, cashAccounts);
  return {
    validRows,
    tradeRows: trades.tradeRows,
    instrumentsToCreate: trades.instrumentsToCreate,
    dividendRows: dividends.dividendRows,
    errors,
    categoriesToCreate,
    subCategoriesToCreate,
    notices,
    summary,
  };
}

interface TradeRowContext {
  resolveAccount: (name: string) => { id: string } | { error: string };
  defaultAccountId?: string;
  pensionFundIds: Set<string>;
  now: Date;
}

/**
 * Validate the investment rows (`tipo` acquisto / vendita / correzione) against the user's
 * instruments, matched by ISIN (case-insensitive).
 *
 * - An ISIN held by exactly one ledger instrument attaches to it; held by a non-ledger asset (an
 *   account, a fund) or by two instruments, the row is refused with the reason.
 * - An ISIN the user does not hold is created: «titolo», «strumento» and «simbolo» on at least
 *   one of its rows (the first filled one wins), «classe» defaulting to the type's class,
 *   «aliquota» to 26, «valuta» to EUR.
 * - Price: «prezzo», else derived from «importo» — what the statement moved: a buy paid
 *   quantity × price + fees, a sale received quantity × price − fees − tax.
 * - A correction is an absolute reset: «quantita» is the new total (0 allowed), «prezzo» the new
 *   average cost; it moves no money, so fees, tax and an explicit «conto» are refused (the
 *   preview's default account is simply not applied to it).
 * - A future date is refused (the ledger refuses it too, but here the user sees it row by row).
 * The replay (no sale beyond the units held) is the ledger route's, at commit.
 */
export function planTradeRows(
  rows: RawRow[],
  instruments: ImportInstrument[],
  ctx: TradeRowContext
): { tradeRows: PlannedTradeRow[]; instrumentsToCreate: InstrumentToCreate[]; errors: RowError[] } {
  const errors: RowError[] = [];
  const tradeRows: PlannedTradeRow[] = [];
  const byIsin = new Map<string, ImportInstrument[]>();
  for (const i of instruments) {
    if (!i.isin) continue;
    const key = i.isin.trim().toUpperCase();
    byIsin.set(key, [...(byIsin.get(key) ?? []), i]);
  }

  // The definition of each ISIN to create, from its first row that carries one.
  const definitions = new Map<string, InstrumentToCreate>();
  const definitionErrors = new Map<string, string>();
  const isinsToCreate: string[] = [];

  for (const row of rows) {
    const fail = (reason: string) => errors.push({ line: row.line, reason, raw: row });
    const tradeType = TRADE_TYPE_ALIASES[norm(row.tipo)];
    const isin = (row.isin ?? '').trim().toUpperCase();
    if (!isin) {
      fail('Operazione su titoli senza ISIN (colonna "isin").');
      continue;
    }
    const date = parseFlexibleDate(row.data);
    if (!date) {
      fail(`Data non valida: "${row.data}".`);
      continue;
    }
    if (settlesLater(date, ctx.now)) {
      fail('Operazione con data futura: registrala quando è avvenuta.');
      continue;
    }

    const quantity = parseItalianNumber(row.quantita ?? '');
    if (quantity === null || (tradeType !== 'adjustment' && quantity === 0)) {
      fail(
        tradeType === 'adjustment'
          ? `Quantità non valida: "${row.quantita ?? ''}" (su una correzione è la nuova quantità totale, anche 0).`
          : `Quantità non valida: "${row.quantita ?? ''}".`
      );
      continue;
    }

    const fees = row.commissioni ? parseItalianNumber(row.commissioni) : undefined;
    if (fees === null) {
      fail(`Commissioni non valide: "${row.commissioni}".`);
      continue;
    }
    const tax = row.tasse ? parseItalianNumber(row.tasse) : undefined;
    if (tax === null) {
      fail(`Tasse non valide: "${row.tasse}".`);
      continue;
    }
    if (tradeType !== 'sell' && tax !== undefined) {
      fail('Le tasse trattenute si indicano solo su una vendita.');
      continue;
    }
    if (tradeType === 'adjustment' && fees !== undefined) {
      fail('Una correzione non prevede commissioni.');
      continue;
    }
    if (tradeType === 'adjustment' && row.conto) {
      fail('Una correzione non movimenta un conto: lascia vuota la colonna "conto".');
      continue;
    }

    let pricePerUnit: number | null = row.prezzo ? parseItalianNumber(row.prezzo) : null;
    if (row.prezzo && pricePerUnit === null) {
      fail(`Prezzo non valido: "${row.prezzo}".`);
      continue;
    }
    if (pricePerUnit === null && tradeType !== 'adjustment' && row.importo) {
      const total = parseItalianNumber(row.importo);
      if (total !== null && total > 0) {
        const gross = tradeType === 'buy' ? total - (fees ?? 0) : total + (fees ?? 0) + (tax ?? 0);
        pricePerUnit = gross > 0 ? gross / quantity : null;
      }
    }
    if (pricePerUnit === null) {
      fail(
        tradeType === 'adjustment'
          ? 'Correzione senza prezzo medio di carico (colonna "prezzo").'
          : 'Prezzo mancante: indica "prezzo" oppure l\'"importo" totale dell\'operazione.'
      );
      continue;
    }

    let linkedCashAssetId: string | undefined;
    if (tradeType !== 'adjustment') {
      linkedCashAssetId = ctx.defaultAccountId;
      if (row.conto) {
        const account = ctx.resolveAccount(row.conto);
        if ('error' in account) {
          fail(account.error);
          continue;
        }
        linkedCashAssetId = account.id;
      }
      if (linkedCashAssetId && ctx.pensionFundIds.has(linkedCashAssetId)) {
        fail(`"${row.conto}" è un fondo pensione: non può regolare un'operazione su titoli.`);
        continue;
      }
    }

    const held = byIsin.get(isin) ?? [];
    let assetId: string | undefined;
    if (held.length > 1) {
      fail(`ISIN ${isin} ambiguo: ${held.length} titoli in Patrimonio hanno questo ISIN.`);
      continue;
    }
    if (held.length === 1) {
      if (!held[0].ledger) {
        fail(`ISIN ${isin} appartiene a "${held[0].name}", che non ha un registro operazioni.`);
        continue;
      }
      assetId = held[0].id;
    } else {
      if (!definitions.has(isin) && !definitionErrors.has(isin)) isinsToCreate.push(isin);
      if (!definitions.has(isin) && (row.titolo || row.strumento || row.simbolo)) {
        const definition = defineInstrument(row, isin, pricePerUnit);
        if ('error' in definition) definitionErrors.set(isin, definition.error);
        else {
          definitions.set(isin, definition);
          definitionErrors.delete(isin);
        }
      }
    }

    tradeRows.push({
      line: row.line,
      date,
      tradeType,
      isin,
      assetId,
      quantity,
      pricePerUnit,
      fees,
      withheldTaxEur: tradeType === 'sell' ? tax : undefined,
      linkedCashAssetId,
      notes: row.note || undefined,
    });
  }

  // An ISIN neither held nor defined cannot be written: every row of it is refused, with the reason.
  const undefinedIsins = new Set(isinsToCreate.filter((i) => !definitions.has(i)));
  const kept = tradeRows.filter((t) => {
    if (!undefinedIsins.has(t.isin)) return true;
    errors.push({
      line: t.line,
      reason:
        definitionErrors.get(t.isin) ??
        `ISIN ${t.isin} non è in Patrimonio: per crearlo indica "titolo", "strumento" e "simbolo" su almeno una sua riga.`,
    });
    return false;
  });

  return {
    tradeRows: kept,
    instrumentsToCreate: isinsToCreate.filter((i) => definitions.has(i)).map((i) => definitions.get(i)!),
    errors,
  };
}

/**
 * Validate the dividend/coupon rows. The instrument is matched by ISIN among the ones held (any
 * type the dividend form offers: what is not a ledger instrument is refused) or created by the
 * same file's trade rows (`isinsBeingCreated`). «importo» is the GROSS amount, «tasse» the
 * withholding (0 when empty, never above the gross); the per-unit amount is gross ÷ quantity.
 * A future payment is refused (an announced dividend is the scrape's or the form's, not a
 * statement's). A payment already in the registry — same instrument and the same Italian day of
 * payment or of ex-date — is refused with the reason: the daily Borsa Italiana scrape may have
 * written it already, and the registry must never count a payment twice. «conto» is not read:
 * a payment credits the instrument's own account (Patrimonio) or the default of Impostazioni ›
 * Dividendi, and only when it is due today or later — a past payment moves no balance.
 */
export function planDividendRows(
  rows: RawRow[],
  instruments: ImportInstrument[],
  isinsBeingCreated: Set<string>,
  existingDividends: ImportExistingDividend[],
  now: Date
): { dividendRows: PlannedDividendRow[]; errors: RowError[] } {
  const errors: RowError[] = [];
  const dividendRows: PlannedDividendRow[] = [];
  const byIsin = new Map<string, ImportInstrument[]>();
  for (const i of instruments) {
    if (!i.isin) continue;
    const key = i.isin.trim().toUpperCase();
    byIsin.set(key, [...(byIsin.get(key) ?? []), i]);
  }
  const dayKey = (d: Date) => getItalyDateIso(d);
  const paidDays = new Set(existingDividends.map((d) => `${d.assetId}::${dayKey(d.paymentDate)}`));
  const exDays = new Set(existingDividends.map((d) => `${d.assetId}::${dayKey(d.exDate)}`));

  for (const row of rows) {
    const fail = (reason: string) => errors.push({ line: row.line, reason, raw: row });
    const dividendType = DIVIDEND_TYPE_ALIASES[norm(row.tipo)];
    const isin = (row.isin ?? '').trim().toUpperCase();
    if (!isin) {
      fail('Dividendo senza ISIN (colonna "isin").');
      continue;
    }
    const paymentDate = parseFlexibleDate(row.data);
    if (!paymentDate) {
      fail(`Data non valida: "${row.data}".`);
      continue;
    }
    if (settlesLater(paymentDate, now)) {
      fail('Pagamento con data futura: registralo quando è stato incassato.');
      continue;
    }
    let exDate = paymentDate;
    if (row.dataStacco) {
      const parsed = parseFlexibleDate(row.dataStacco);
      if (!parsed || parsed > paymentDate) {
        fail(`Data di stacco non valida: "${row.dataStacco}" (deve precedere o coincidere con il pagamento).`);
        continue;
      }
      exDate = parsed;
    }
    const quantity = parseItalianNumber(row.quantita ?? '');
    if (quantity === null || quantity <= 0) {
      fail(`Quantità non valida: "${row.quantita ?? ''}".`);
      continue;
    }
    const grossAmount = parseItalianNumber(row.importo);
    if (grossAmount === null || grossAmount <= 0) {
      fail(`Importo lordo non valido: "${row.importo}".`);
      continue;
    }
    const taxAmount = row.tasse ? parseItalianNumber(row.tasse) : 0;
    if (taxAmount === null || taxAmount < 0 || taxAmount > grossAmount) {
      fail(`Ritenuta non valida: "${row.tasse}" (colonna "tasse", al massimo l'importo lordo).`);
      continue;
    }

    const held = byIsin.get(isin) ?? [];
    let assetId: string | undefined;
    if (held.length > 1) {
      fail(`ISIN ${isin} ambiguo: ${held.length} titoli in Patrimonio hanno questo ISIN.`);
      continue;
    }
    if (held.length === 1) {
      if (!held[0].ledger) {
        fail(`ISIN ${isin} appartiene a "${held[0].name}", che non paga dividendi.`);
        continue;
      }
      assetId = held[0].id;
      if (paidDays.has(`${assetId}::${dayKey(paymentDate)}`) || exDays.has(`${assetId}::${dayKey(exDate)}`)) {
        fail(`Pagamento di "${held[0].name}" già registrato in Dividendi per questa data: non viene contato due volte.`);
        continue;
      }
    } else if (!isinsBeingCreated.has(isin)) {
      fail(`ISIN ${isin} non è in Patrimonio: un dividendo si registra su un titolo che possiedi o hai posseduto.`);
      continue;
    }

    dividendRows.push({
      line: row.line,
      paymentDate,
      exDate,
      dividendType,
      isin,
      assetId,
      quantity,
      grossAmount,
      taxAmount,
      currency: (row.valuta || 'EUR').toUpperCase(),
      notes: row.note || undefined,
    });
  }
  return { dividendRows, errors };
}

function defineInstrument(row: RawRow, isin: string, price: number): InstrumentToCreate | { error: string } {
  const name = (row.titolo ?? '').trim();
  const ticker = (row.simbolo ?? '').trim();
  const type = INSTRUMENT_TYPE_ALIASES[norm(row.strumento ?? '')];
  if (!name || !ticker || !row.strumento) {
    return { error: `Per creare ${isin} servono "titolo", "strumento" e "simbolo" sulla stessa riga.` };
  }
  if (!type) {
    return { error: `Strumento non valido: "${row.strumento}" (azione, etf, etc, obbligazione, crypto).` };
  }
  let assetClass = DEFAULT_CLASS_OF_TYPE[type]!;
  if (row.classe) {
    const resolved = ASSET_CLASS_ALIASES[norm(row.classe)];
    if (!resolved) {
      return { error: `Classe non valida: "${row.classe}" (azioni, obbligazioni, materie prime, criptovalute, liquidità, trend following).` };
    }
    assetClass = resolved;
  }
  let taxRate = DEFAULT_IMPORT_TAX_RATE;
  if (row.aliquota) {
    const parsed = parseItalianNumber(row.aliquota);
    if (parsed === null || parsed > 100) return { error: `Aliquota non valida: "${row.aliquota}".` };
    taxRate = parsed;
  }
  return {
    isin,
    name,
    ticker,
    type,
    assetClass,
    currency: (row.valuta || 'EUR').toUpperCase(),
    taxRate,
    currentPrice: price,
  };
}

/** What a trade moves on its settlement account: a buy pays price × units + fees, a sale receives it net of fees and tax. */
export function tradeCashDelta(t: Pick<PlannedTradeRow, 'tradeType' | 'quantity' | 'pricePerUnit' | 'fees' | 'withheldTaxEur'>): number {
  if (t.tradeType === 'adjustment') return 0;
  const gross = t.quantity * t.pricePerUnit;
  return roundToCents(
    t.tradeType === 'buy' ? -(gross + (t.fees ?? 0)) : gross - (t.fees ?? 0) - (t.withheldTaxEur ?? 0)
  );
}

function buildSummary(
  validRows: PlannedExpenseRow[],
  tradeRows: PlannedTradeRow[],
  dividendRows: PlannedDividendRow[],
  errors: RowError[],
  newCategoriesCount: number,
  cashAccounts: ImportCashAccount[]
): ImportSummary {
  const accountName = new Map(cashAccounts.map((a) => [a.id, a.name]));
  const byAccount = new Map<string, ImportAccountSummary>();
  let totalIncome = 0;
  let totalExpense = 0;
  let transferCount = 0;
  let totalTransfer = 0;
  let pensionContributionCount = 0;
  let dateFrom: Date | undefined;
  let dateTo: Date | undefined;

  for (const r of validRows) {
    if (r.type === 'income') totalIncome += r.amount;
    else if (r.type === 'transfer') {
      transferCount++;
      totalTransfer += r.amount;
      if (r.pensionContribution) pensionContributionCount++;
    } else totalExpense += r.amount;
    if (!dateFrom || r.date < dateFrom) dateFrom = r.date;
    if (!dateTo || r.date > dateTo) dateTo = r.date;
    const move = (assetId: string, delta: number) => {
      const entry = byAccount.get(assetId) ?? {
        assetId,
        name: accountName.get(assetId) ?? assetId,
        count: 0,
        net: 0,
      };
      entry.count++;
      entry.net = roundToCents(entry.net + delta);
      byAccount.set(assetId, entry);
    };
    if (r.linkedCashAssetId) move(r.linkedCashAssetId, r.type === 'income' ? r.amount : -r.amount);
    if (r.transferCashAssetId) move(r.transferCashAssetId, r.amount);
  }

  let buyCount = 0;
  let sellCount = 0;
  let adjustmentCount = 0;
  for (const t of tradeRows) {
    if (t.tradeType === 'buy') buyCount++;
    else if (t.tradeType === 'sell') sellCount++;
    else adjustmentCount++;
    if (!dateFrom || t.date < dateFrom) dateFrom = t.date;
    if (!dateTo || t.date > dateTo) dateTo = t.date;
    if (!t.linkedCashAssetId) continue;
    const entry = byAccount.get(t.linkedCashAssetId) ?? {
      assetId: t.linkedCashAssetId,
      name: accountName.get(t.linkedCashAssetId) ?? t.linkedCashAssetId,
      count: 0,
      net: 0,
    };
    entry.count++;
    entry.tradeCount = (entry.tradeCount ?? 0) + 1;
    entry.net = roundToCents(entry.net + tradeCashDelta(t));
    byAccount.set(t.linkedCashAssetId, entry);
  }

  let dividendCount = 0;
  let couponCount = 0;
  let totalDividendNet = 0;
  for (const d of dividendRows) {
    if (d.dividendType === 'coupon') couponCount++;
    else dividendCount++;
    totalDividendNet += d.grossAmount - d.taxAmount;
    if (!dateFrom || d.paymentDate < dateFrom) dateFrom = d.paymentDate;
    if (!dateTo || d.paymentDate > dateTo) dateTo = d.paymentDate;
  }

  return {
    validCount: validRows.length + tradeRows.length + dividendRows.length,
    dividendCount,
    couponCount,
    totalDividendNet: roundToCents(totalDividendNet),
    buyCount,
    sellCount,
    adjustmentCount,
    skippedCount: errors.length,
    newCategoriesCount,
    totalIncome,
    totalExpense,
    transferCount,
    totalTransfer: roundToCents(totalTransfer),
    pensionContributionCount,
    dateFrom,
    dateTo,
    accounts: [...byAccount.values()],
  };
}

/** One past import, as the list of past imports shows it. */
export interface ImportBatchSummary {
  importBatchId: string;
  count: number;
  /** When it was imported (the rows' shared `createdAt`). */
  importedAt: Date;
  dateFrom: Date;
  dateTo: Date;
  /** Rows linked to an account: their undo gives the balance back. */
  linkedCount: number;
}

/**
 * The past imports still in the data, newest first, from the rows that carry an
 * `importBatchId`. Until 2026-10-24 the undo lived only in the wizard's «done» phase,
 * so an import was undoable only before leaving the page.
 */
export function summarizeImportBatches(
  expenses: Pick<Expense, 'importBatchId' | 'date' | 'createdAt' | 'linkedCashAssetId'>[]
): ImportBatchSummary[] {
  const byBatch = new Map<string, ImportBatchSummary>();
  for (const e of expenses) {
    if (!e.importBatchId) continue;
    const entry = byBatch.get(e.importBatchId);
    if (!entry) {
      byBatch.set(e.importBatchId, {
        importBatchId: e.importBatchId,
        count: 1,
        importedAt: e.createdAt,
        dateFrom: e.date,
        dateTo: e.date,
        linkedCount: e.linkedCashAssetId ? 1 : 0,
      });
      continue;
    }
    entry.count++;
    if (e.linkedCashAssetId) entry.linkedCount++;
    if (e.createdAt < entry.importedAt) entry.importedAt = e.createdAt;
    if (e.date < entry.dateFrom) entry.dateFrom = e.date;
    if (e.date > entry.dateTo) entry.dateTo = e.date;
  }
  return [...byBatch.values()].sort((a, b) => b.importedAt.getTime() - a.importedAt.getTime());
}
