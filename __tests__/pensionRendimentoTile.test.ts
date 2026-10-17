/**
 * Previdenza's RendimentoTile (components/pension/tiles/RendimentoTile.tsx) — a figure the strip
 * repeats is signed on the PRINTED text, never on the raw value (2026-10-16).
 *
 * The strip's TWR cell prints «0,00%» for a TWR of −0,004 (`formatStripFigure`, and the reading's
 * `signedPct` in pensionNarrative.ts, both on `printedSign`); the tile printed «−0,00%» under it,
 * because it chose the sign with `value >= 0`. The rule is the printed-zero rule of AGENTS.md
 * § Layout and Color Tokens: a printed zero has no sign and no tone (`printedSign`, `formatSignedPercentIt`,
 * `formatSignedEuro` in lib/utils/formatters.ts). The figures here are invented and round.
 *
 * Seen red on 2026-10-16: the tile printed «−0,00%» for the TWR of −0,004, «+0,00%» for the
 * annualised +0,003 and «−0,00 €» for a market gain of −0,004 €, each in a sign colour.
 * Rendered to a string with react-dom/server.
 */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { RendimentoTile } from '@/components/pension/tiles/RendimentoTile';
import type { PensionMemberBlock } from '@/lib/utils/pensionSummary';
import type { PensionReturnResult } from '@/lib/utils/pensionReturn';

function makeResult(overrides: Partial<PensionReturnResult> = {}): PensionReturnResult {
  return {
    windowStart: '2025-01',
    windowEnd: '2026-01',
    monthsCovered: 12,
    startValue: 10_000,
    endValue: 12_000,
    valueGrowth: 2_000,
    contributions: { tfr: 1_000, voluntary: 0, employer: 1_000, total: 2_000 },
    marketGain: 0,
    twr: 0,
    annualizedTwr: 0,
    personalReturn: 10,
    isCoverageSuspicious: false,
    isCoverageContradictory: false,
    hasNoMovement: false,
    ...overrides,
  };
}

function makeBlock(result: PensionReturnResult): PensionMemberBlock {
  return {
    key: 'm1',
    kind: 'member',
    name: 'Anna',
    fundIds: ['f1'],
    fundNames: ['Fondo Uno'],
    value: 12_000,
    return: result,
    returnState: 'measured',
    windowStart: '2025-01',
    hasConfiguredStart: true,
    tax: null,
  };
}

/** The markup with the formatters' narrow and non-breaking spaces as plain ones. */
const render = (result: PensionReturnResult) =>
  renderToStaticMarkup(
    createElement(RendimentoTile, {
      reading: [{ text: 'Il mercato ha reso zero.' }],
      aside: 'gen 2025 → gen 2026',
      footer: [{ text: 'Nota.' }],
      blocks: [makeBlock(result)],
    }),
  ).replace(/[  ]/g, ' ');

describe('RendimentoTile — a printed zero has no sign (2026-10-16)', () => {
  it('prints «0,00%» with no sign and no tone for a TWR that rounds to zero from below', () => {
    const html = render(makeResult({ twr: -0.004 }));
    expect(html).not.toContain('−0,00%');
    expect(html).not.toContain('+0,00%');
    // The KPI paragraph: the plain zero, in the foreground colour, never the loss red.
    expect(html).toMatch(/text-foreground">0,00%<\/p>/);
  });

  it('prints the annualised TWR unsigned when it rounds to zero from above', () => {
    const html = render(makeResult({ twr: 5, annualizedTwr: 0.003 }));
    expect(html).toContain('>0,00%</span> annualizzato');
    expect(html).toContain('+5,00%');
  });

  it('prints a market gain that rounds to zero cents unsigned and untoned', () => {
    const html = render(makeResult({ twr: 5, marketGain: -0.004 }));
    expect(html).not.toContain('−0,00 €');
    expect(html).not.toContain('+0,00 €');
    expect(html).toMatch(/text-foreground">0,00 €<\/span>/);
  });

  it('keeps the sign and the tone of a figure that prints as non-zero', () => {
    const html = render(makeResult({ twr: -2.4, annualizedTwr: -2.4, marketGain: -700 }));
    expect(html).toMatch(/text-destructive">−2,40%<\/p>/);
    expect(html).toMatch(/text-destructive">−700,00 €<\/span>/);
  });
});
