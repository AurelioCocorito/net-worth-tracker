/**
 * BilanciamentoTile's lifted KPI (components/allocation/tiles/BilanciamentoTile.tsx) — the phone's
 * strip prints «Fuori posizione», so the tile hides that KPI's VALUE and nothing else (2026-10-16).
 *
 * Only the value hides (`LIFTED_FIGURE_CLASS`, hidden below `desktop:`); «… € da spostare», which
 * nothing else prints, stays under the label (The Lifted-Figure Rule), and so do
 * the other KPIs. The browser spec at 390 (`e2e/allocation.mobile.spec.ts`) runs on the base
 * fixture, whose cell is «nulla» and lifts nothing, so the hiding itself is proved here.
 *
 * Seen red on 2026-10-16: `lifted` ignored by `Kpi` (the value kept its class with the block
 * lifted); the class put on the caption instead of the value. Rendered to a string with
 * react-dom/server; the ring's and the bars' colours come from mocked hooks.
 */
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// The tile's module graph reaches the client Firebase SDK (`allocationUtils` → assetService,
// `chartService`): the same two mocks as `__tests__/allocazioneSummary.test.ts`, plus the formatter.
vi.mock('@/lib/firebase/config', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteField: vi.fn() }));
vi.mock('@/lib/services/chartService', async () => {
  const { formatPercentageIt } = await import('@/lib/utils/formatters');
  return { formatPercentage: (value: number, decimals = 2) => formatPercentageIt(value, decimals) };
});
// The two palette hooks read the theme from the DOM: a fixed palette is enough to render.
vi.mock('@/lib/hooks/useChartColors', () => ({ useChartColors: () => Array.from({ length: 9 }, (_, index) => `#${String(index).repeat(6)}`) }));
vi.mock('@/lib/hooks/useActionColors', () => ({ useActionColors: () => ({ COMPRA: '#00aa00', VENDI: '#aa0000', OK: '#888888' }) }));

import { BilanciamentoTile } from '@/components/allocation/tiles/BilanciamentoTile';
import { LIFTED_FIGURE_CLASS } from '@/components/ui/tile';
import { DEFAULT_REBALANCE_BAND } from '@/lib/utils/allocationUtils';
import type { CompositionPair } from '@/lib/utils/allocazioneSummary';

type TileProps = Parameters<typeof BilanciamentoTile>[0];

const COMPOSITION: CompositionPair = {
  current: [
    { key: 'stocks', label: 'Azioni', pct: 60, chartIndex: 0 },
    { key: 'bonds', label: 'Obbligazioni', pct: 40, chartIndex: 1 },
  ],
  target: [
    { key: 'stocks', label: 'Azioni', pct: 55, chartIndex: 0 },
    { key: 'bonds', label: 'Obbligazioni', pct: 45, chartIndex: 1 },
  ],
};

/** The markup with the formatters' narrow spaces as plain ones, so a figure can be searched as it reads. */
const render = (overrides: Partial<TileProps>) =>
  renderToStaticMarkup(
    createElement(BilanciamentoTile, {
      reading: [{ text: 'Su 245.000 € allocati il 3,5% è fuori posizione.' }],
      band: DEFAULT_REBALANCE_BAND,
      onBandChange: () => {},
      score: 96.5,
      misallocationPct: 3.47,
      misallocationValue: 8500,
      offTargetCount: 2,
      classCount: 5,
      offTargetLabels: ['Azioni', 'Obbligazioni'],
      leverage: null,
      composition: COMPOSITION,
      footer: null,
      ...overrides,
    }),
  ).replace(/[  ]/g, ' ');

/** The class list of the `<p>` whose text is exactly `text`. */
function classOfParagraph(html: string, text: string): string {
  const at = html.indexOf(`>${text}</p>`);
  expect(at).toBeGreaterThan(-1);
  const open = html.lastIndexOf('<p class="', at);
  return /class="([^"]*)"/.exec(html.slice(open))![1];
}

describe('BilanciamentoTile — the lifted «Fuori posizione»', () => {
  it('hides the KPI value alone when the strip prints it, and keeps the caption and the other KPI', () => {
    const html = render({ liftedFigures: ['fuori-posizione'] });
    expect(classOfParagraph(html, '3,5%')).toContain(LIFTED_FIGURE_CLASS);
    expect(classOfParagraph(html, '8500 € da spostare')).not.toContain(LIFTED_FIGURE_CLASS);
    expect(html).toContain('Fuori target');
    expect(html.replace(/<[^>]+>/g, ' ')).toMatch(/2\s+su 5/);
  });

  it('keeps the KPI whole where nothing is lifted (from 768, and at 1440)', () => {
    const html = render({});
    expect(classOfParagraph(html, '3,5%')).not.toContain(LIFTED_FIGURE_CLASS);
    expect(classOfParagraph(html, '8500 € da spostare')).not.toContain(LIFTED_FIGURE_CLASS);
  });
});
