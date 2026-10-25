/**
 * Tests for the pure import layer in lib/utils/expenseImport.ts.
 *
 * Covers the tricky, locale-sensitive parts of the historical CSV importer:
 *   1. parseItalianNumber — IT (`1.234,56`) vs EN (`1234.56`); a lone comma is always decimal.
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
 *   8. rows already in the data — «codice» and the day/amount/account fingerprint (2026-10-25).
 *   9. «saldo» rows — the account aligned to the statement's balance of a day (2026-10-25).
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
import { Expense, ExpenseCategory } from '@/types/expenses';

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

  it('treats a lone dot grouping 3 digits as thousands', () => {
    expect(parseItalianNumber('1.234')).toBe(1234);
  });

  it('always reads a lone comma as the decimal separator, three or four decimals included', () => {
    expect(parseItalianNumber('1,234')).toBe(1.234);
    expect(parseItalianNumber('224,139')).toBe(224.139);
    expect(parseItalianNumber('192,1095')).toBe(192.1095);
  });

  it('refuses several commas with no dot', () => {
    expect(parseItalianNumber('1,234,567')).toBeNull();
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

describe('investment rows (acquisto / vendita / correzione)', () => {
  const NOW = new Date(2026, 9, 25, 12);
  const header = 'data;importo;tipo;categoria;note;conto;isin;quantita;prezzo;commissioni;tasse;titolo;strumento;simbolo;classe;aliquota\n';
  const plan = (body: string, instruments: Parameters<typeof buildImportPlan>[5] = [], defaultAccountId?: string) =>
    buildImportPlan(
      parseImportCsv(header + body),
      [],
      [{ id: 'acc-1', name: 'Broker' }, { id: 'fund-1', name: 'Fondo', kind: 'pensionFund' }],
      defaultAccountId,
      NOW,
      instruments
    );
  const held = [
    { id: 'a-etf', name: 'World ETF', isin: 'IE0000000001', ledger: true },
    { id: 'a-acc', name: 'Conto', isin: 'IT0000000009', ledger: false },
  ];

  it('parses a file of investment rows only (no «importo» nor «categoria» column)', () => {
    const rows = parseImportCsv('data;tipo;isin;quantita;prezzo\n2026-10-01;correzione;IE0000000001;100;50');
    expect(rows[0]).toMatchObject({ tipo: 'correzione', isin: 'IE0000000001', quantita: '100', prezzo: '50' });
  });

  it('attaches a buy to the held instrument by ISIN, case-insensitive, with the account', () => {
    const p = plan('2026-10-01;;acquisto;;;Broker;ie0000000001;10;50,00;2,50;;;;;;', held);
    expect(p.errors).toEqual([]);
    expect(p.validRows).toHaveLength(0);
    expect(p.tradeRows).toEqual([
      expect.objectContaining({ tradeType: 'buy', isin: 'IE0000000001', assetId: 'a-etf', quantity: 10, pricePerUnit: 50, fees: 2.5, linkedCashAssetId: 'acc-1' }),
    ]);
    expect(p.summary).toMatchObject({ validCount: 1, buyCount: 1 });
    expect(p.summary.accounts).toEqual([
      expect.objectContaining({ assetId: 'acc-1', net: -502.5, tradeCount: 1 }),
    ]);
  });

  it('derives the price from «importo»: a buy paid price + fees, a sale received price − fees − tax', () => {
    const p = plan(
      '2026-10-01;1002,00;acquisto;;;;IE0000000001;20;;2,00;;;;;;\n' +
        '2026-10-02;580,00;vendita;;;;IE0000000001;10;;2,00;18,00;;;;;',
      held
    );
    expect(p.tradeRows.map((t) => t.pricePerUnit)).toEqual([50, 60]);
    expect(p.tradeRows[1].withheldTaxEur).toBe(18);
  });

  it('creates an unknown ISIN from titolo, strumento and simbolo, with class and tax defaults', () => {
    const p = plan(
      '2026-10-01;;acquisto;;;;US0000000002;5;100;;;Esempio Corp;azione;EXC.MI;;\n' +
        '2026-10-03;;acquisto;;;;US0000000002;5;110;;;;;;;'
    );
    expect(p.errors).toEqual([]);
    expect(p.instrumentsToCreate).toEqual([
      { isin: 'US0000000002', name: 'Esempio Corp', ticker: 'EXC.MI', type: 'stock', assetClass: 'equity', currency: 'EUR', taxRate: 26, currentPrice: 100 },
    ]);
    expect(p.tradeRows.every((t) => t.assetId === undefined)).toBe(true);
  });

  it('reads «classe» and «aliquota» for a created instrument', () => {
    const p = plan('2026-10-01;;correzione;;;;AT0000000003;1000;0,98;;;Esempio Bond;obbligazione;EXB.MOT;obbligazioni;12,5');
    expect(p.instrumentsToCreate[0]).toMatchObject({ type: 'bond', assetClass: 'bonds', taxRate: 12.5 });
  });

  it('refuses every row of an unknown ISIN with no definition', () => {
    const p = plan('2026-10-01;;acquisto;;;;US0000000004;5;100;;;;;;;\n2026-10-02;;vendita;;;;US0000000004;5;100;;;;;;;');
    expect(p.tradeRows).toEqual([]);
    expect(p.errors.map((e) => e.line)).toEqual([1, 2]);
    expect(p.errors[0].reason).toMatch(/titolo.*strumento.*simbolo/);
  });

  it('a correction is an absolute reset: 0 allowed, no fees, no account, no default account', () => {
    const p = plan(
      '2026-10-01;;correzione;;;;IE0000000001;0;50;;;;;;;\n' +
        '2026-10-01;;correzione;;;;IE0000000001;10;50;1,00;;;;;;\n' +
        '2026-10-01;;correzione;;;Broker;IE0000000001;10;50;;;;;;;',
      held,
      'acc-1'
    );
    expect(p.tradeRows).toEqual([expect.objectContaining({ line: 1, quantity: 0, linkedCashAssetId: undefined })]);
    expect(p.errors.map((e) => e.reason)).toEqual([
      expect.stringMatching(/commissioni/),
      expect.stringMatching(/non movimenta/),
    ]);
  });

  it('refuses a non-ledger ISIN, a tax outside a sale, a future date, a missing price and a pension fund account', () => {
    const p = plan(
      '2026-10-01;;acquisto;;;;IT0000000009;1;10;;;;;;;\n' +
        '2026-10-01;;acquisto;;;;IE0000000001;1;10;;5;;;;;\n' +
        '2026-11-01;;acquisto;;;;IE0000000001;1;10;;;;;;;\n' +
        '2026-10-01;;acquisto;;;;IE0000000001;1;;;;;;;;\n' +
        '2026-10-01;;acquisto;;;Fondo;IE0000000001;1;10;;;;;;;',
      held
    );
    expect(p.tradeRows).toEqual([]);
    expect(p.errors.map((e) => e.reason)).toEqual([
      expect.stringMatching(/registro operazioni/),
      expect.stringMatching(/solo su una vendita/),
      expect.stringMatching(/data futura/),
      expect.stringMatching(/Prezzo mancante/),
      expect.stringMatching(/fondo pensione/),
    ]);
  });

  it('keeps expense rows and trade rows side by side in one file', () => {
    const p = buildImportPlan(
      parseImportCsv(header + '2026-10-01;50,00;variable;Spesa;;;;;;;;;;;;\n2026-10-01;;acquisto;;;;IE0000000001;1;10;;;;;;;'),
      [],
      [],
      undefined,
      NOW,
      held
    );
    expect(p.validRows).toHaveLength(1);
    expect(p.tradeRows).toHaveLength(1);
    expect(p.summary.validCount).toBe(2);
  });
});

describe('dividend rows (dividendo / cedola)', () => {
  const NOW = new Date(2026, 9, 25, 12);
  const header = 'data;importo;tipo;note;conto;isin;quantita;tasse;data_stacco;titolo;strumento;simbolo;prezzo\n';
  const held = [
    { id: 'a-etf', name: 'World ETF', isin: 'IE0000000001', ledger: true },
    { id: 'a-acc', name: 'Conto', isin: 'IT0000000009', ledger: false },
  ];
  const plan = (body: string, existing: Parameters<typeof buildImportPlan>[6] = []) =>
    buildImportPlan(parseImportCsv(header + body), [], [{ id: 'acc-1', name: 'Broker' }], undefined, NOW, held, existing);

  it('reads a dividend on a held instrument: gross, withholding, ex-date, net in the summary', () => {
    const p = plan('2026-10-15;100,00;dividendo;trimestrale;Broker;ie0000000001;200;26,00;2026-10-01;;;;');
    expect(p.errors).toEqual([]);
    expect(p.dividendRows).toHaveLength(1);
    expect(p.dividendRows[0]).toMatchObject({
      assetId: 'a-etf', isin: 'IE0000000001', dividendType: 'ordinary', quantity: 200,
      grossAmount: 100, taxAmount: 26, currency: 'EUR', notes: 'trimestrale',
    });
    expect(p.dividendRows[0].exDate.getDate()).toBe(1);
    expect(p.validRows).toHaveLength(0); // never a Tracciamento row of the plan: the route writes it
    expect(p.summary).toMatchObject({ dividendCount: 1, couponCount: 0, totalDividendNet: 74, validCount: 1 });
  });

  it('reads a coupon, with no withholding and the ex-date defaulting to the payment day', () => {
    const p = plan('2026-09-30;50;cedola;;;IE0000000001;1000;;;;;;');
    expect(p.dividendRows[0]).toMatchObject({ dividendType: 'coupon', taxAmount: 0 });
    expect(p.dividendRows[0].exDate.getTime()).toBe(p.dividendRows[0].paymentDate.getTime());
    expect(p.summary.couponCount).toBe(1);
  });

  it('accepts a dividend on an instrument the same file creates', () => {
    const p = plan(
      '2026-10-01;1000;acquisto;;;IE0000000002;10;;;Nuovo ETF;etf;NEW.MI;100\n' +
        '2026-10-10;5;dividendo;;;IE0000000002;10;;;;;;'
    );
    expect(p.errors).toEqual([]);
    expect(p.instrumentsToCreate).toHaveLength(1);
    expect(p.dividendRows[0]).toMatchObject({ isin: 'IE0000000002', assetId: undefined });
  });

  it.each([
    ['no ISIN', '2026-10-15;100;dividendo;;;;200;;;;;;', /senza ISIN/],
    ['a future payment', '2026-10-26;100;dividendo;;;IE0000000001;200;;;;;;', /data futura/],
    ['an ex-date after the payment', '2026-10-15;100;dividendo;;;IE0000000001;200;;2026-10-16;;;;', /stacco non valida/],
    ['a zero quantity', '2026-10-15;100;dividendo;;;IE0000000001;0;;;;;;', /Quantità non valida/],
    ['a withholding above the gross', '2026-10-15;100;dividendo;;;IE0000000001;200;101;;;;;', /Ritenuta non valida/],
    ['an unknown ISIN', '2026-10-15;100;dividendo;;;US0000000003;200;;;;;;', /non è in Patrimonio/],
    ['an instrument outside the ledger', '2026-10-15;100;dividendo;;;IT0000000009;200;;;;;;', /non paga dividendi/],
  ])('refuses %s', (_label, body, reason) => {
    const p = plan(body);
    expect(p.dividendRows).toHaveLength(0);
    expect(p.errors[0].reason).toMatch(reason);
  });

  it('refuses a payment already in the registry, by payment day or by ex-date day', () => {
    const existing = [{ assetId: 'a-etf', exDate: new Date(2026, 9, 1, 12), paymentDate: new Date(2026, 9, 15, 12) }];
    expect(plan('2026-10-15;100;dividendo;;;IE0000000001;200;;2026-09-30;;;;', existing).errors[0].reason).toMatch(/già registrato/);
    expect(plan('2026-10-14;100;dividendo;;;IE0000000001;200;;2026-10-01;;;;', existing).errors[0].reason).toMatch(/già registrato/);
    expect(plan('2026-10-20;100;dividendo;;;IE0000000001;200;;;;;;', existing).dividendRows).toHaveLength(1);
  });
});

describe('rows already in the data (codice and fingerprint)', () => {
  const accounts = [
    { id: 'acc-a', name: 'Conto Alfa', balance: 1000 },
    { id: 'acc-b', name: 'Conto Beta', balance: 500 },
  ];
  const csv = (body: string) =>
    parseImportCsv('data;importo;tipo;categoria;sottocategoria;note;valuta;conto;codice\n' + body);
  const stored = (date: string, type: Expense['type'], amount: number, linked?: string, code?: string) => ({
    date: new Date(`${date}T12:00:00`),
    type,
    amount,
    linkedCashAssetId: linked,
    importRowCode: code,
  });
  const now = new Date('2024-12-01T12:00:00');

  it('reads the «codice» column and stores it on the planned row', () => {
    const plan = buildImportPlan(csv('2024-01-15;50,00;variable;Spesa;;;;Conto Alfa;alfa-001'), [], accounts, undefined, now);
    expect(plan.validRows[0].importRowCode).toBe('alfa-001');
  });

  it('sets aside a row whose codice is already stored', () => {
    const plan = buildImportPlan(
      csv('2024-01-15;50,00;variable;Spesa;;;;Conto Alfa;alfa-001'),
      [],
      accounts,
      undefined,
      now,
      [],
      [],
      { expenses: [stored('2024-02-20', 'variable', -99, 'acc-b', 'alfa-001')] }
    );
    expect(plan.validRows).toHaveLength(0);
    expect(plan.duplicates[0].reason).toMatch(/codice «alfa-001»/);
    expect(plan.summary.duplicateCount).toBe(1);
    expect(plan.summary.skippedCount).toBe(0);
  });

  it('sets aside a row of the same day, amount and account, whatever its category or type', () => {
    const plan = buildImportPlan(
      csv('2024-01-15;50,00;variable;Spesa;;;;Conto Alfa;'),
      [],
      accounts,
      undefined,
      now,
      [],
      [],
      { expenses: [stored('2024-01-15', 'fixed', -50, 'acc-a')] }
    );
    expect(plan.validRows).toHaveLength(0);
    expect(plan.duplicates[0].reason).toMatch(/15\/01\/2024/);
    expect(plan.categoriesToCreate).toEqual([]);
  });

  it('lets each stored row answer for one file row only', () => {
    const plan = buildImportPlan(
      csv('2024-01-15;1,50;variable;Bar;;;;Conto Alfa;\n2024-01-15;1,50;variable;Bar;;;;Conto Alfa;'),
      [],
      accounts,
      undefined,
      now,
      [],
      [],
      { expenses: [stored('2024-01-15', 'variable', -1.5, 'acc-a')] }
    );
    expect(plan.validRows).toHaveLength(1);
    expect(plan.duplicates).toHaveLength(1);
  });

  it('never matches a stored row that carries a different codice', () => {
    const plan = buildImportPlan(
      csv('2024-01-15;1,50;variable;Bar;;;;Conto Alfa;alfa-002'),
      [],
      accounts,
      undefined,
      now,
      [],
      [],
      { expenses: [stored('2024-01-15', 'variable', -1.5, 'acc-a', 'alfa-001')] }
    );
    expect(plan.validRows).toHaveLength(1);
    expect(plan.duplicates).toHaveLength(0);
  });

  it('keeps the rows apart from another account or another direction', () => {
    const plan = buildImportPlan(
      csv('2024-01-15;50,00;variable;Spesa;;;;Conto Beta;\n2024-01-15;50,00;income;Rimborso;;;;Conto Alfa;'),
      [],
      accounts,
      undefined,
      now,
      [],
      [],
      { expenses: [stored('2024-01-15', 'variable', -50, 'acc-a')] }
    );
    expect(plan.validRows).toHaveLength(2);
  });

  it('imports them anyway when asked, still listing them', () => {
    const plan = buildImportPlan(
      csv('2024-01-15;50,00;variable;Spesa;;;;Conto Alfa;'),
      [],
      accounts,
      undefined,
      now,
      [],
      [],
      { expenses: [stored('2024-01-15', 'variable', -50, 'acc-a')], includeDuplicates: true }
    );
    expect(plan.validRows).toHaveLength(1);
    expect(plan.duplicates).toHaveLength(1);
  });

  it('refuses a codice repeated inside the file, keeping the first row', () => {
    const plan = buildImportPlan(
      csv('2024-01-15;50,00;variable;Spesa;;;;Conto Alfa;x1\n2024-01-16;20,00;variable;Spesa;;;;Conto Alfa;x1'),
      [],
      accounts,
      undefined,
      now
    );
    expect(plan.validRows.map((r) => r.line)).toEqual([1]);
    expect(plan.errors[0].reason).toMatch(/già usato alla riga 1/);
  });

  it('sets aside a trade of the same day, instrument, units and price', () => {
    const rows = parseImportCsv(
      'data;tipo;isin;quantita;prezzo;conto\n2024-03-01;acquisto;IE00TEST0001;10;50,00;Conto Alfa\n2024-03-02;acquisto;IE00TEST0001;10;50,00;Conto Alfa'
    );
    const plan = buildImportPlan(
      rows,
      [],
      accounts,
      undefined,
      now,
      [{ id: 'etf-1', name: 'Test ETF', isin: 'IE00TEST0001', ledger: true }],
      [],
      {
        trades: [
          { assetId: 'etf-1', type: 'buy', date: new Date('2024-03-01T12:00:00'), quantity: 10, pricePerUnit: 50, cashDelta: -500 },
        ],
      }
    );
    expect(plan.tradeRows.map((t) => t.line)).toEqual([2]);
    expect(plan.duplicates.map((d) => d.line)).toEqual([1]);
  });
});

describe('«saldo» rows', () => {
  const accounts = [
    { id: 'acc-a', name: 'Conto Alfa', balance: 1000 },
    { id: 'fund', name: 'Fondo Pensione', kind: 'pensionFund' as const },
  ];
  const csv = (body: string) => parseImportCsv('data;importo;tipo;categoria;sottocategoria;note;valuta;conto\n' + body);
  const now = new Date('2024-12-01T12:00:00');

  it('aligns the account to the statement after the file is written', () => {
    // Today 1000; the file adds −200 (dated before the statement day): the app will hold 800.
    const plan = buildImportPlan(
      csv('2024-11-10;200,00;variable;Spesa;;;;Conto Alfa\n2024-11-30;850,00;saldo;;;;;Conto Alfa'),
      [],
      accounts,
      undefined,
      now
    );
    expect(plan.balanceRows).toEqual([
      expect.objectContaining({ assetId: 'acc-a', statementBalance: 850, appBalance: 800, delta: 50 }),
    ]);
    expect(plan.summary.balanceCount).toBe(1);
    expect(plan.summary.validCount).toBe(2);
    expect(plan.categoriesToCreate).toEqual([{ name: 'Spesa', type: 'variable', subCategories: [] }]);
  });

  it('leaves out what moved after the statement day, stored or in the file', () => {
    // Today 1000; after the import 900 (the file's −100 of 28/11). After 20/11 the account moved by
    // +300 (stored, 25/11) and −100 (the file): on 20/11 it held 900 − 200 = 700.
    const plan = buildImportPlan(
      csv('2024-11-28;100,00;variable;Spesa;;;;Conto Alfa\n2024-11-20;700,00;saldo;;;;;Conto Alfa'),
      [],
      accounts,
      undefined,
      now,
      [],
      [],
      {
        expenses: [{ date: new Date('2024-11-25T12:00:00'), type: 'income', amount: 300, linkedCashAssetId: 'acc-a' }],
        trades: [],
      }
    );
    expect(plan.balanceRows[0]).toMatchObject({ appBalance: 700, delta: 0 });
  });

  it('reads a leading minus as an overdraft', () => {
    const plan = buildImportPlan(csv('2024-11-30;-120,00;saldo;;;;;Conto Alfa'), [], accounts, undefined, now);
    expect(plan.balanceRows[0]).toMatchObject({ statementBalance: -120, delta: -1120 });
  });

  it('takes the default account when «conto» is empty', () => {
    const plan = buildImportPlan(csv('2024-11-30;1000,00;saldo;;;;;'), [], accounts, 'acc-a', now);
    expect(plan.balanceRows[0]).toMatchObject({ assetId: 'acc-a', delta: 0 });
  });

  it('refuses a future day, a missing account, a fund and a second saldo for the same account', () => {
    const plan = buildImportPlan(
      csv(
        '2024-12-05;10,00;saldo;;;;;Conto Alfa\n' +
          '2024-11-30;10,00;saldo;;;;;\n' +
          '2024-11-30;10,00;saldo;;;;;Fondo Pensione\n' +
          '2024-11-30;10,00;saldo;;;;;Conto Alfa\n' +
          '2024-11-29;10,00;saldo;;;;;Conto Alfa'
      ),
      [],
      accounts,
      undefined,
      now
    );
    expect(plan.balanceRows.map((b) => b.line)).toEqual([4]);
    expect(plan.errors.map((e) => e.reason)).toEqual([
      expect.stringMatching(/data futura/),
      expect.stringMatching(/Saldo senza conto/),
      expect.stringMatching(/non è un conto corrente/),
      expect.stringMatching(/Un solo saldo per conto/),
    ]);
  });
});
