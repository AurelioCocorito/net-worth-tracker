/**
 * FATTURATO — the CSV import of Cashflow › Fatturati, pure.
 *
 * One row per (month, client): `mese;datore;importo;nota`. The owner keeps the figures in a
 * spreadsheet and exports it, so the parser is lenient where a spreadsheet varies and strict where
 * a wrong reading would be silent:
 * - the month: `2024-03`, `03/2024`, `3-2024`, `marzo 2024`, `mar 2024`, or a whole date
 *   (`31/03/2024`, its month); a cell it cannot read is an error with its line, never a guess;
 * - the amount: `parseItalianNumber`, the import's one reading — a lone comma is ALWAYS the decimal
 *   separator (the owner's rule, 2026-10-25); a leading «−»/«-» or brackets make a credit note;
 * - the client may be empty (the month's total as one figure);
 * - two rows for the same month and client are SUMMED (two invoices to one clinic in March), and
 *   the preview says how many were merged.
 * The write is an upsert on (month, client) (`revenueEntryId`), so importing a file twice
 * replaces its figures instead of doubling them.
 */

import Papa from 'papaparse';
import { roundToCents } from '@/lib/utils/cents';
import { parseFlexibleDate, parseItalianNumber } from '@/lib/utils/expenseImport';
import { revenueClientKey } from '@/lib/utils/revenueStats';
import type { RevenueEntryInput } from '@/types/revenue';

type Column = 'mese' | 'datore' | 'importo' | 'nota';

const HEADER_ALIASES: Record<string, Column> = {
  mese: 'mese',
  month: 'mese',
  competenza: 'mese',
  'mese di competenza': 'mese',
  periodo: 'mese',
  datore: 'datore',
  'datore di lavoro': 'datore',
  cliente: 'datore',
  committente: 'datore',
  client: 'datore',
  importo: 'importo',
  fatturato: 'importo',
  amount: 'importo',
  nota: 'nota',
  note: 'nota',
};

export const REVENUE_TEMPLATE_HEADERS = ['mese', 'datore', 'importo', 'nota'] as const;

const MONTH_WORDS: Record<string, number> = {
  gennaio: 1, gen: 1,
  febbraio: 2, feb: 2,
  marzo: 3, mar: 3,
  aprile: 4, apr: 4,
  maggio: 5, mag: 5,
  giugno: 6, giu: 6,
  luglio: 7, lug: 7,
  agosto: 8, ago: 8,
  settembre: 9, set: 9, sett: 9,
  ottobre: 10, ott: 10,
  novembre: 11, nov: 11,
  dicembre: 12, dic: 12,
};

const toMonth = (year: number, month: number): string | null =>
  month >= 1 && month <= 12 && year >= 1900 && year <= 2999 ? `${year}-${String(month).padStart(2, '0')}` : null;

/** The month of competence of a cell, `YYYY-MM`, or `null` when it cannot be read. */
export function parseRevenueMonth(input: string): string | null {
  const s = String(input ?? '').trim().toLowerCase();
  if (s === '') return null;

  const ym = s.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (ym) return toMonth(+ym[1], +ym[2]);
  const my = s.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (my) return toMonth(+my[2], +my[1]);
  const word = s.match(/^([a-zà]+)\.?[\s\-/]+(\d{4})$/);
  if (word) {
    const month = MONTH_WORDS[word[1]];
    return month ? toMonth(+word[2], month) : null;
  }
  const date = parseFlexibleDate(s);
  return date ? toMonth(date.getFullYear(), date.getMonth() + 1) : null;
}

/** The amount of a cell, signed: a leading minus or brackets make it a credit note. */
export function parseRevenueAmount(input: string): number | null {
  const s = String(input ?? '').trim();
  const magnitude = parseItalianNumber(s);
  if (magnitude === null) return null;
  const negative = /^[-−]/.test(s) || /^\(.*\)$/.test(s);
  return roundToCents(negative ? -magnitude : magnitude);
}

export interface RevenueImportError {
  /** 1-based, the header excluded. */
  line: number;
  message: string;
}

export interface RevenueImportPlan {
  rows: RevenueEntryInput[];
  errors: RevenueImportError[];
  /** How many file rows were summed into a row already in the plan. */
  merged: number;
}

export function parseRevenueCsv(raw: string): RevenueImportPlan {
  const text = raw.replace(/^﻿/, '');
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' });
  const table = parsed.data.filter((r) => Array.isArray(r) && r.some((c) => String(c).trim() !== ''));
  if (table.length === 0) throw new Error('Il file è vuoto.');

  const colIndex: Partial<Record<Column, number>> = {};
  table[0].forEach((cell, idx) => {
    const key = HEADER_ALIASES[String(cell).trim().toLowerCase()];
    if (key && colIndex[key] === undefined) colIndex[key] = idx;
  });
  const missing = (['mese', 'importo'] as const).filter((k) => colIndex[k] === undefined);
  if (missing.length > 0) {
    throw new Error(`Intestazioni obbligatorie mancanti: ${missing.join(', ')}. Attese: ${REVENUE_TEMPLATE_HEADERS.join(', ')}.`);
  }
  const get = (row: string[], key: Column): string => {
    const i = colIndex[key];
    return i === undefined ? '' : String(row[i] ?? '').trim();
  };

  const byKey = new Map<string, RevenueEntryInput>();
  const errors: RevenueImportError[] = [];
  let merged = 0;
  for (let i = 1; i < table.length; i++) {
    const row = table[i];
    const monthCell = get(row, 'mese');
    const amountCell = get(row, 'importo');
    const month = parseRevenueMonth(monthCell);
    if (!month) {
      errors.push({ line: i, message: monthCell ? `mese non leggibile: «${monthCell}»` : 'mese mancante' });
      continue;
    }
    const amount = parseRevenueAmount(amountCell);
    if (amount === null) {
      errors.push({ line: i, message: amountCell ? `importo non leggibile: «${amountCell}»` : 'importo mancante' });
      continue;
    }
    const client = get(row, 'datore').replace(/\s+/g, ' ');
    const note = get(row, 'nota');
    const key = `${month}|${revenueClientKey(client)}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.amount = roundToCents(existing.amount + amount);
      if (note) existing.note = existing.note ? `${existing.note}; ${note}` : note;
      merged++;
    } else {
      byKey.set(key, { month, client, amount, ...(note ? { note } : {}) });
    }
  }

  const rows = [...byKey.values()].sort((a, b) => a.month.localeCompare(b.month) || a.client.localeCompare(b.client, 'it'));
  return { rows, errors, merged };
}

/** The template the tab offers for download: the header and two invented rows. */
export function buildRevenueTemplateCsv(): string {
  const rows = [
    [...REVENUE_TEMPLATE_HEADERS],
    ['2025-01', 'Clinica Esempio', '2500,00', ''],
    ['2025-01', 'Studio Esempio', '1200,00', 'due fatture'],
  ];
  return '﻿' + rows.map((r) => r.join(';')).join('\r\n');
}
