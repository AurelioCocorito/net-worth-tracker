/**
 * Tests for the pure import layer in lib/utils/expenseImport.ts.
 *
 * Covers the tricky, locale-sensitive parts of the historical CSV importer:
 *   1. parseItalianNumber — IT (`1.234,56`) vs EN (`1234.56`) + thousands heuristic.
 *   2. parseFlexibleDate — ISO and DD/MM/YYYY, with invalid/overflow rejection.
 *   3. parseImportCsv — header aliases, `;` delimiter, missing-column errors.
 *   4. buildImportPlan — (name, type) identity: same-named categories of different
 *      types resolve/create side by side, untyped rows inherit the single
 *      namesake's type (ambiguous → rejected), same-name-same-type duplicates
 *      attach to the oldest with a preview notice; plus transfer skip,
 *      subcategory creation, summary totals.
 *   5. the «conto» column — rows linked by account name, unknown/ambiguous names
 *      rejected, the per-account net in the summary.
 *   6. transfers — «conto» origin + «conto_destinazione» destination, the default
 *      transfer category, rejections, the summary's per-account legs.
 *   7. summarizeImportBatches — the past imports listed for a later undo.
 *
 * No React, no Firebase — the module imports only papaparse + types.
 */

import { describe, it, expect } from 'vitest';
import {
  parseItalianNumber,
  parseFlexibleDate,
  parseImportCsv,
  buildImportPlan,
  buildTemplateCsv,
  summarizeImportBatches,
} from '@/lib/utils/expenseImport';
import { ExpenseCategory } from '@/types/expenses';

function cat(partial: Partial<ExpenseCategory> & { name: string; type: ExpenseCategory['type'] }): ExpenseCategory {
  return {
    id: partial.id ?? `id-${partial.name}`,
    userId: 'u1',
    name: partial.name,
    type: partial.type,
    subCategories: partial.subCategories ?? [],
    createdAt: partial.createdAt ?? new Date(),
    updatedAt: new Date(),
  };
}

describe('parseItalianNumber', () => {
  it('parses IT format with dot thousands and comma decimal', () => {
    expect(parseItalianNumber('1.234,56')).toBe(1234.56);
    expect(parseItalianNumber('1.234.567,89')).toBe(1234567.89);
  });

  it('parses EN format', () => {
    expect(parseItalianNumber('1234.56')).toBe(1234.56);
    expect(parseItalianNumber('1,234.56')).toBe(1234.56);
  });

  it('treats a single separator grouping 3 digits as thousands', () => {
    expect(parseItalianNumber('1.234')).toBe(1234);
    expect(parseItalianNumber('1,234')).toBe(1234);
  });

  it('treats a single separator with 1-2 decimals as decimal', () => {
    expect(parseItalianNumber('12,5')).toBe(12.5);
    expect(parseItalianNumber('12.50')).toBe(12.5);
  });

  it('strips currency symbols and returns positive magnitude', () => {
    expect(parseItalianNumber('€ 54,90')).toBe(54.9);
    expect(parseItalianNumber('-50,00')).toBe(50);
  });

  it('returns null for junk', () => {
    expect(parseItalianNumber('abc')).toBeNull();
    expect(parseItalianNumber('')).toBeNull();
  });
});

describe('parseFlexibleDate', () => {
  it('parses ISO YYYY-MM-DD', () => {
    const d = parseFlexibleDate('2024-01-15')!;
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(15);
  });

  it('parses DD/MM/YYYY (and . / - separators)', () => {
    expect(parseFlexibleDate('15/01/2024')!.getMonth()).toBe(0);
    expect(parseFlexibleDate('15.01.2024')!.getDate()).toBe(15);
    expect(parseFlexibleDate('15-01-2024')!.getFullYear()).toBe(2024);
  });

  it('rejects overflow and garbage', () => {
    expect(parseFlexibleDate('31/02/2024')).toBeNull();
    expect(parseFlexibleDate('2024-13-01')).toBeNull();
    expect(parseFlexibleDate('not a date')).toBeNull();
    expect(parseFlexibleDate('')).toBeNull();
  });
});

describe('parseImportCsv', () => {
  it('parses a `;`-delimited file with Italian headers', () => {
    const csv = 'data;importo;tipo;categoria;sottocategoria;note;valuta\n2024-01-15;1200,00;fixed;Casa;Affitto;x;EUR';
    const rows = parseImportCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ line: 1, categoria: 'Casa', importo: '1200,00', tipo: 'fixed' });
  });

  it('accepts English header aliases and `,` delimiter', () => {
    const csv = 'date,amount,type,category\n2024-01-15,50.00,variable,Spesa';
    const rows = parseImportCsv(csv);
    expect(rows[0]).toMatchObject({ data: '2024-01-15', importo: '50.00', tipo: 'variable', categoria: 'Spesa' });
  });

  it('tolerates a UTF-8 BOM and the generated template', () => {
    const rows = parseImportCsv(buildTemplateCsv());
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0].categoria).toBe('Casa');
  });

  it('throws when a required column is missing', () => {
    expect(() => parseImportCsv('data;tipo;categoria\n2024-01-15;fixed;Casa')).toThrow(/importo/i);
  });
});

describe('buildImportPlan', () => {
  const rowsCsv = (body: string) =>
    parseImportCsv('data;importo;tipo;categoria;sottocategoria;note;valuta\n' + body);

  it('falls back to variable when type is empty', () => {
    const plan = buildImportPlan(rowsCsv('2024-01-15;50,00;;Spesa;;;'), []);
    expect(plan.validRows).toHaveLength(1);
    expect(plan.validRows[0].type).toBe('variable');
  });

  it('rejects a transfer row without its accounts', () => {
    const plan = buildImportPlan(rowsCsv('2024-01-15;50,00;transfer;Giroconto;;;'), []);
    expect(plan.validRows).toHaveLength(0);
    expect(plan.errors[0].reason).toMatch(/conto di partenza/);
  });

  it('treats a name used with two types in the file as two distinct categories', () => {
    // (name, type) is the identity app-wide: "Auto" fissa and "Auto" variabile are
    // two documents, not a conflict.
    const plan = buildImportPlan(
      rowsCsv('2024-01-15;50,00;fixed;Auto;;;\n2024-02-15;60,00;variable;Auto;;;'),
      []
    );
    expect(plan.errors).toHaveLength(0);
    expect(plan.validRows).toHaveLength(2);
    expect(plan.categoriesToCreate).toHaveLength(2);
    expect(plan.categoriesToCreate.map((c) => c.type).sort()).toEqual(['fixed', 'variable']);
  });

  it('creates a same-named category of a different type beside the existing one', () => {
    const plan = buildImportPlan(
      rowsCsv('2024-01-15;50,00;variable;Casa;;;'),
      [cat({ name: 'Casa', type: 'fixed' })]
    );
    expect(plan.errors).toHaveLength(0);
    expect(plan.validRows).toHaveLength(1);
    expect(plan.validRows[0].categoryId).toBeUndefined(); // the variable Casa does not exist yet
    expect(plan.categoriesToCreate).toEqual([{ name: 'Casa', type: 'variable', subCategories: [] }]);
  });

  it('inherits the single existing namesake type when the row has no type', () => {
    const plan = buildImportPlan(
      rowsCsv('2024-01-15;50,00;;Casa;;;'),
      [cat({ name: 'Casa', type: 'fixed' })]
    );
    expect(plan.errors).toHaveLength(0);
    expect(plan.validRows[0]).toMatchObject({ type: 'fixed', categoryId: 'id-Casa' });
    expect(plan.categoriesToCreate).toHaveLength(0);
  });

  it('rejects an untyped row when same-named categories of different types exist', () => {
    const plan = buildImportPlan(
      rowsCsv('2024-01-15;50,00;;Casa;;;'),
      [cat({ id: 'c-fix', name: 'Casa', type: 'fixed' }), cat({ id: 'c-var', name: 'Casa', type: 'variable' })]
    );
    expect(plan.validRows).toHaveLength(0);
    expect(plan.errors[0].reason).toMatch(/ambiguo/i);
    expect(plan.errors[0].reason).toMatch(/Spese Fisse/);
  });

  it('attaches same-name-same-type duplicates to the OLDEST document and says so', () => {
    const plan = buildImportPlan(
      rowsCsv('2024-01-15;50,00;fixed;Casa;;;'),
      [
        cat({ id: 'c-new', name: 'Casa', type: 'fixed', createdAt: new Date(2026, 0, 1) }),
        cat({ id: 'c-old', name: 'Casa', type: 'fixed', createdAt: new Date(2024, 0, 1) }),
      ]
    );
    expect(plan.errors).toHaveLength(0);
    expect(plan.validRows[0].categoryId).toBe('c-old');
    expect(plan.notices).toHaveLength(1);
    expect(plan.notices[0]).toMatchObject({ categoryName: 'Casa', type: 'fixed', duplicateCount: 2 });
    expect(plan.notices[0].message).toMatch(/più vecchia/);
  });

  it('resolves existing categories case-insensitively and plans new subcategories', () => {
    const plan = buildImportPlan(
      rowsCsv('2024-01-15;50,00;fixed;casa;Bollette;;'),
      [cat({ name: 'Casa', type: 'fixed', subCategories: [{ id: 's1', name: 'Affitto' }] })]
    );
    expect(plan.validRows).toHaveLength(1);
    expect(plan.validRows[0].categoryId).toBe('id-Casa');
    expect(plan.categoriesToCreate).toHaveLength(0);
    expect(plan.notices).toHaveLength(0);
    expect(plan.subCategoriesToCreate).toHaveLength(1);
    expect(plan.subCategoriesToCreate[0]).toMatchObject({ categoryId: 'id-Casa', subCategoryNames: ['Bollette'] });
  });

  it('plans a new category with its subcategories', () => {
    const plan = buildImportPlan(rowsCsv('2024-01-15;50,00;income;Stipendio;Bonus;;'), []);
    expect(plan.categoriesToCreate).toHaveLength(1);
    expect(plan.categoriesToCreate[0]).toMatchObject({ name: 'Stipendio', type: 'income', subCategories: ['Bonus'] });
  });

  it('computes summary totals, date range, and counts', () => {
    const plan = buildImportPlan(
      rowsCsv(
        '2024-01-15;2500,00;income;Stipendio;;;\n' +
          '2024-03-20;1200,00;fixed;Casa;;;\n' +
          '2024-02-10;50,00;variable;Spesa;;;\n' +
          'bad;10;fixed;X;;;'
      ),
      []
    );
    expect(plan.summary.validCount).toBe(3);
    expect(plan.summary.skippedCount).toBe(1);
    expect(plan.summary.totalIncome).toBe(2500);
    expect(plan.summary.totalExpense).toBe(1250);
    expect(plan.summary.newCategoriesCount).toBe(3);
    expect(plan.summary.dateFrom!.getMonth()).toBe(0);
    expect(plan.summary.dateTo!.getMonth()).toBe(2);
  });
});

describe('the «conto» column', () => {
  const accounts = [
    { id: 'acc-a', name: 'Conto Alfa' },
    { id: 'acc-b', name: 'Conto Beta' },
  ];
  const rowsCsv = (body: string) =>
    parseImportCsv('data;importo;tipo;categoria;sottocategoria;note;valuta;conto\n' + body);

  it('reads the column under its Italian and English names', () => {
    expect(parseImportCsv('data;importo;categoria;conto\n2024-01-15;50;Spesa;Conto Alfa')[0].conto).toBe('Conto Alfa');
    expect(parseImportCsv('date,amount,category,account\n2024-01-15,50,Spesa,Conto Alfa')[0].conto).toBe('Conto Alfa');
  });

  it('links a row to the account named, case-insensitive', () => {
    const plan = buildImportPlan(rowsCsv('2024-01-15;50,00;variable;Spesa;;;;conto alfa'), [], accounts);
    expect(plan.validRows[0].linkedCashAssetId).toBe('acc-a');
  });

  it('leaves a row without «conto» linked to nothing', () => {
    const plan = buildImportPlan(rowsCsv('2024-01-15;50,00;variable;Spesa;;;;'), [], accounts);
    expect(plan.validRows[0].linkedCashAssetId).toBeUndefined();
    expect(plan.summary.accounts).toEqual([]);
  });

  it('links the rows without «conto» to the default account, the named ones to theirs', () => {
    const plan = buildImportPlan(
      rowsCsv('2024-01-15;50,00;variable;Spesa;;;;\n2024-01-16;20,00;variable;Spesa;;;;Conto Beta'),
      [],
      accounts,
      'acc-a'
    );
    expect(plan.validRows.map((r) => r.linkedCashAssetId)).toEqual(['acc-a', 'acc-b']);
  });

  it('rejects an unknown account, naming the ones available', () => {
    const plan = buildImportPlan(rowsCsv('2024-01-15;50,00;variable;Spesa;;;;Conto Gamma'), [], accounts);
    expect(plan.validRows).toHaveLength(0);
    expect(plan.errors[0].reason).toMatch(/Conto "Conto Gamma" non trovato/);
    expect(plan.errors[0].reason).toMatch(/Conto Alfa, Conto Beta/);
  });

  it('rejects a name two accounts share', () => {
    const twins = [...accounts, { id: 'acc-c', name: 'conto alfa' }];
    const plan = buildImportPlan(rowsCsv('2024-01-15;50,00;variable;Spesa;;;;Conto Alfa'), [], twins);
    expect(plan.validRows).toHaveLength(0);
    expect(plan.errors[0].reason).toMatch(/ambiguo/);
  });

  it('sums the signed net per account for the preview', () => {
    const plan = buildImportPlan(
      rowsCsv(
        '2024-01-15;2500,00;income;Stipendio;;;;Conto Alfa\n' +
          '2024-01-20;120,50;variable;Spesa;;;;Conto Alfa\n' +
          '2024-01-21;40,00;variable;Spesa;;;;Conto Beta\n' +
          '2024-01-22;10,00;variable;Spesa;;;;'
      ),
      [],
      accounts
    );
    expect(plan.summary.accounts).toEqual([
      { assetId: 'acc-a', name: 'Conto Alfa', count: 2, net: 2379.5 },
      { assetId: 'acc-b', name: 'Conto Beta', count: 1, net: -40 },
    ]);
  });
});

describe('summarizeImportBatches', () => {
  const row = (batch: string | undefined, date: string, createdAt: string, linked?: string) => ({
    importBatchId: batch,
    date: new Date(`${date}T12:00:00`),
    createdAt: new Date(`${createdAt}T12:00:00`),
    linkedCashAssetId: linked,
  });

  it('groups the rows by batch, newest import first, ignoring rows typed by hand', () => {
    const batches = summarizeImportBatches([
      row('old', '2024-01-10', '2024-05-01'),
      row('new', '2024-03-05', '2024-06-01', 'acc-a'),
      row(undefined, '2024-03-06', '2024-06-02'),
      row('new', '2024-02-01', '2024-06-01'),
      row('old', '2024-01-31', '2024-05-01'),
    ]);
    expect(batches.map((b) => b.importBatchId)).toEqual(['new', 'old']);
    expect(batches[0]).toMatchObject({ count: 2, linkedCount: 1 });
    expect(batches[0].dateFrom.getMonth()).toBe(1);
    expect(batches[0].dateTo.getMonth()).toBe(2);
    expect(batches[1]).toMatchObject({ count: 2, linkedCount: 0 });
  });

  it('is empty when nothing was imported', () => {
    expect(summarizeImportBatches([row(undefined, '2024-01-10', '2024-05-01')])).toEqual([]);
  });
});

describe('buildImportPlan — transfers', () => {
  const header = 'data;importo;tipo;categoria;sottocategoria;note;valuta;conto;conto_destinazione\n';
  const rows = (body: string) => parseImportCsv(header + body);
  const accounts = [
    { id: 'poste', name: 'Poste Italiane' },
    { id: 'fineco', name: 'Fineco' },
  ];

  it('plans a transfer with both accounts and a new «Trasferimenti» category', () => {
    const plan = buildImportPlan(rows('2026-05-12;5.000,00;transfer;;;Bonifico per investimento;EUR;poste italiane;FINECO'), [], accounts);
    expect(plan.errors).toEqual([]);
    expect(plan.validRows[0]).toMatchObject({
      type: 'transfer',
      amount: 5000,
      categoryName: 'Trasferimenti',
      linkedCashAssetId: 'poste',
      transferCashAssetId: 'fineco',
      notes: 'Bonifico per investimento',
    });
    expect(plan.categoriesToCreate).toEqual([{ name: 'Trasferimenti', type: 'transfer', subCategories: [] }]);
    expect(plan.summary).toMatchObject({ totalIncome: 0, totalExpense: 0, transferCount: 1, totalTransfer: 5000 });
    expect(plan.summary.accounts).toEqual([
      { assetId: 'poste', name: 'Poste Italiane', count: 1, net: -5000 },
      { assetId: 'fineco', name: 'Fineco', count: 1, net: 5000 },
    ]);
  });

  it('lands an empty «categoria» on the oldest existing transfer category', () => {
    const existing = [
      cat({ id: 't2', name: 'Giroconti', type: 'transfer', createdAt: new Date('2025-01-01') }),
      cat({ id: 't1', name: 'Trasferimenti', type: 'transfer', createdAt: new Date('2024-01-01') }),
    ];
    const plan = buildImportPlan(rows('2026-05-12;100;transfer;;;;;Poste Italiane;Fineco'), existing, accounts);
    expect(plan.validRows[0]).toMatchObject({ categoryName: 'Trasferimenti', categoryId: 't1' });
    expect(plan.categoriesToCreate).toEqual([]);
  });

  it('reads an untyped row with a destination as a transfer', () => {
    const plan = buildImportPlan(rows('2026-05-12;100;;;;;;Poste Italiane;Fineco'), [], accounts);
    expect(plan.validRows[0].type).toBe('transfer');
  });

  it('takes the origin from the default account', () => {
    const plan = buildImportPlan(rows('2026-05-12;100;transfer;;;;;;Fineco'), [], accounts, 'poste');
    expect(plan.validRows[0]).toMatchObject({ linkedCashAssetId: 'poste', transferCashAssetId: 'fineco' });
  });

  it('rejects a missing, unknown or identical destination, and a destination on a spending row', () => {
    const plan = buildImportPlan(
      rows(
        [
          '2026-05-12;100;transfer;;;;;Poste Italiane;',
          '2026-05-12;100;transfer;;;;;Poste Italiane;Banca X',
          '2026-05-12;100;transfer;;;;;Poste Italiane;poste italiane',
          '2026-05-12;100;variable;Spesa;;;;Poste Italiane;Fineco',
        ].join('\n')
      ),
      [],
      accounts
    );
    expect(plan.validRows).toEqual([]);
    expect(plan.errors.map((e) => e.reason)).toEqual([
      expect.stringMatching(/conto di destinazione/),
      expect.stringMatching(/Banca X.*non trovato/),
      expect.stringMatching(/stesso conto/),
      expect.stringMatching(/vale solo per i trasferimenti/),
    ]);
  });

  it('accepts the destination column under its aliases', () => {
    const parsed = parseImportCsv('data;importo;categoria;conto;Conto destinazione\n2026-05-12;100;;Poste Italiane;Fineco');
    expect(parsed[0].contoDestinazione).toBe('Fineco');
  });
});

describe('buildImportPlan — transfers into a fondo pensione', () => {
  const header = 'data;importo;tipo;categoria;sottocategoria;note;valuta;conto;conto_destinazione\n';
  const rows = (body: string) => parseImportCsv(header + body);
  const accounts = [
    { id: 'poste', name: 'Poste Italiane' },
    { id: 'fondo', name: 'Fondo X', kind: 'pensionFund' as const },
  ];
  const now = new Date(2026, 9, 25, 12);

  it('marks a transfer into a fund as a pension contribution', () => {
    const plan = buildImportPlan(rows('2026-09-30;400,00;transfer;;;Versamento;EUR;Poste Italiane;Fondo X'), [], accounts, undefined, now);
    expect(plan.errors).toEqual([]);
    expect(plan.validRows[0]).toMatchObject({ linkedCashAssetId: 'poste', transferCashAssetId: 'fondo', pensionContribution: true });
    expect(plan.summary).toMatchObject({ transferCount: 1, pensionContributionCount: 1, totalTransfer: 400 });
  });

  it('leaves a transfer between two accounts unmarked', () => {
    const plan = buildImportPlan(
      rows('2026-09-30;400;transfer;;;;;Poste Italiane;Conto B'),
      [],
      [...accounts, { id: 'b', name: 'Conto B' }],
      undefined,
      now
    );
    expect(plan.validRows[0].pensionContribution).toBeUndefined();
    expect(plan.summary.pensionContributionCount).toBe(0);
  });

  it('refuses a fund as origin, as a spending account, and a future contribution', () => {
    const plan = buildImportPlan(
      rows(
        [
          '2026-09-30;400;transfer;;;;;Fondo X;Poste Italiane',
          '2026-09-30;400;variable;Spesa;;;;Fondo X;',
          '2026-10-26;400;transfer;;;;;Poste Italiane;Fondo X',
        ].join('\n')
      ),
      [],
      accounts,
      undefined,
      now
    );
    expect(plan.validRows).toEqual([]);
    expect(plan.errors.map((e) => e.reason)).toEqual([
      expect.stringMatching(/fondo pensione/),
      expect.stringMatching(/fondo pensione/),
      expect.stringMatching(/data futura/),
    ]);
  });
});
