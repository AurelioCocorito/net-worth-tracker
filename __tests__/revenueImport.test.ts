import { describe, expect, it } from 'vitest';
import { buildRevenueTemplateCsv, parseRevenueAmount, parseRevenueCsv, parseRevenueMonth } from '@/lib/utils/revenueImport';

describe('parseRevenueMonth', () => {
  it.each([
    ['2025-03', '2025-03'],
    ['2025/3', '2025-03'],
    ['03/2025', '2025-03'],
    ['3-2025', '2025-03'],
    ['marzo 2025', '2025-03'],
    ['Mar 2025', '2025-03'],
    ['dic. 2024', '2024-12'],
    ['31/03/2025', '2025-03'],
    ['2025-03-01', '2025-03'],
  ])('%s → %s', (input, expected) => {
    expect(parseRevenueMonth(input)).toBe(expected);
  });

  it.each(['', '2025-13', '13/2025', 'primavera 2025', '2025'])('refuses %j', (input) => {
    expect(parseRevenueMonth(input)).toBeNull();
  });
});

describe('parseRevenueAmount', () => {
  it('a lone comma is the decimal separator', () => {
    expect(parseRevenueAmount('2500,50')).toBe(2500.5);
    expect(parseRevenueAmount('1.250,00 €')).toBe(1250);
    expect(parseRevenueAmount('224,139')).toBe(224.14);
  });
  it('a minus or brackets make a credit note', () => {
    expect(parseRevenueAmount('-120,00')).toBe(-120);
    expect(parseRevenueAmount('−120')).toBe(-120);
    expect(parseRevenueAmount('(80)')).toBe(-80);
  });
  it('refuses an empty cell', () => {
    expect(parseRevenueAmount('')).toBeNull();
  });
});

describe('parseRevenueCsv', () => {
  it('reads the template', () => {
    const plan = parseRevenueCsv(buildRevenueTemplateCsv());
    expect(plan.errors).toEqual([]);
    expect(plan.rows).toEqual([
      { month: '2025-01', client: 'Clinica Esempio', amount: 2500 },
      { month: '2025-01', client: 'Studio Esempio', amount: 1200, note: 'due fatture' },
    ]);
  });

  it('sums two rows of the same month and client, whatever the case', () => {
    const plan = parseRevenueCsv('mese;datore;importo\n2025-02;Studio Beta;100\n02/2025;studio beta;50,5\n2025-02;;10');
    expect(plan.merged).toBe(1);
    expect(plan.rows).toEqual([
      { month: '2025-02', client: '', amount: 10 },
      { month: '2025-02', client: 'Studio Beta', amount: 150.5 },
    ]);
  });

  it('accepts the header aliases and a comma-delimited export with quoted amounts', () => {
    const plan = parseRevenueCsv('Mese di competenza,Cliente,Fatturato,Note\n2025-04,Clinica Alfa,"1.234,56",acconto');
    expect(plan.rows).toEqual([{ month: '2025-04', client: 'Clinica Alfa', amount: 1234.56, note: 'acconto' }]);
  });

  it('reports the unreadable rows with their line, and imports the rest', () => {
    const plan = parseRevenueCsv('mese;importo\naprile;100\n2025-05;abc\n2025-06;300');
    expect(plan.rows).toHaveLength(1);
    expect(plan.errors).toEqual([
      { line: 1, message: 'mese non leggibile: «aprile»' },
      { line: 2, message: 'importo non leggibile: «abc»' },
    ]);
  });

  it('refuses a file without the required columns', () => {
    expect(() => parseRevenueCsv('data;totale\n2025-01;1')).toThrow(/mese, importo/);
    expect(() => parseRevenueCsv('')).toThrow(/vuoto/);
  });
});
