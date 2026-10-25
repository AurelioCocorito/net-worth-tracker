/**
 * The import preview's price check (2026-10-25): a trade row whose price is far from the
 * instrument's current price is flagged before the import, never refused. It catches the
 * separator slips a file carries — «224.139» read as two hundred thousand, a price typed ten
 * times too big — which the ledger accepts as a perfectly valid trade.
 *
 * Two bands, because a price is only expected near today's for a trade near today:
 *   - a buy or a sell of the last 31 days: flagged beyond ±25% of the current price;
 *   - an older trade, or a correction (its price is the average cost, which drifts from the market
 *     for years): flagged only beyond a factor of 3 either way — a slip of the decimal point, not
 *     a market move.
 *
 * The reference is the price in Patrimonio for a held instrument, the live quote for one the same
 * file creates; no reference (no quote, a price of 0) = no check. Both are in the instrument's
 * own currency, as the file's «prezzo» is.
 */

import type { ImportTradeType, PlannedTradeRow } from '@/types/expenseImport';

const RECENT_DAYS = 31;
const RECENT_TOLERANCE = 0.25;
const OLD_FACTOR = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The price a row is compared against, by upper-case ISIN. */
export interface ImportPriceReference {
  name: string;
  price: number;
}

/** A row whose price looks wrong: what it says, what the instrument is worth, by how much. */
export interface ImportPriceWarning {
  line: number;
  isin: string;
  name: string;
  tradeType: ImportTradeType;
  price: number;
  reference: number;
  /** price ÷ reference. */
  ratio: number;
}

/** True when the row's price is outside its band around the reference. */
export function isImplausiblePrice(
  row: Pick<PlannedTradeRow, 'tradeType' | 'date' | 'pricePerUnit'>,
  reference: number,
  now: Date
): boolean {
  if (!(reference > 0) || !(row.pricePerUnit > 0)) return false;
  const ratio = row.pricePerUnit / reference;
  const recent = row.tradeType !== 'adjustment' && now.getTime() - row.date.getTime() <= RECENT_DAYS * DAY_MS;
  if (recent) return Math.abs(ratio - 1) > RECENT_TOLERANCE;
  return ratio > OLD_FACTOR || ratio < 1 / OLD_FACTOR;
}

/** The trade rows of a plan whose price is implausible, in file order. */
export function findImplausibleTradePrices(
  rows: PlannedTradeRow[],
  references: ReadonlyMap<string, ImportPriceReference>,
  now: Date
): ImportPriceWarning[] {
  const warnings: ImportPriceWarning[] = [];
  for (const row of rows) {
    const reference = references.get(row.isin.toUpperCase());
    if (!reference || !isImplausiblePrice(row, reference.price, now)) continue;
    warnings.push({
      line: row.line,
      isin: row.isin,
      name: reference.name,
      tradeType: row.tradeType,
      price: row.pricePerUnit,
      reference: reference.price,
      ratio: row.pricePerUnit / reference.price,
    });
  }
  return warnings.sort((a, b) => a.line - b.line);
}

/** «Riga 12 · Amazon: prezzo 224.139 contro 224,14 in Patrimonio (×1000). Controlla i decimali.» */
export function describePriceWarning(w: ImportPriceWarning, format: (value: number) => string): string {
  const times = w.ratio >= 1 ? `×${formatRatio(w.ratio)}` : `÷${formatRatio(1 / w.ratio)}`;
  const kind = w.tradeType === 'adjustment' ? 'prezzo medio' : 'prezzo';
  return `${w.name}: ${kind} ${format(w.price)} contro un prezzo attuale di ${format(w.reference)} (${times}). Controlla separatore dei decimali e valuta.`;
}

function formatRatio(value: number): string {
  return value >= 10 ? String(Math.round(value)) : value.toFixed(1).replace('.', ',');
}
