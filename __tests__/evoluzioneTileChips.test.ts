/**
 * EvoluzioneTile's chips (components/history/tiles/EvoluzioneTile.tsx) — the twelve months' chip
 * on a phone and on a printed zero (2026-10-15).
 *
 * Below `tablet:` the chip's euro is lifted (the strip's «Ultimi 12 mesi» cell prints it) and its
 * percentage stays alone. Without a percentage — the snapshot a year back worth zero or less —
 * nothing was left inside the chip: an empty coloured pill over «ultimi 12 mesi». The chip now
 * hides whole, and with it the row when nothing else of it remains. The percentage beside an
 * unsigned «0 €» is signed on the PRINTED value too (the printed-zero rule): it read «0 € (+0,0%)».
 *
 * Seen red on 2026-10-15, one behaviour at a time: the chip's own `LIFTED_FIGURE_CLASS` removed
 * (the empty pill came back, and the row stayed); `signedPct` put back on the percentage
 * («+0,0%»). Rendered to a string with react-dom/server, no chart (`points: []`).
 */
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// chartService pulls in the client Firebase SDK; the tile needs only its two formatters.
vi.mock('@/lib/services/chartService', async () => {
  const { formatPercentageIt } = await import('@/lib/utils/formatters');
  return { formatPercentage: (value: number, decimals = 2) => formatPercentageIt(value, decimals), formatCurrencyCompact: (value: number) => String(value) };
});

import { EvoluzioneTile } from '@/components/history/tiles/EvoluzioneTile';
import { LIFTED_FIGURE_CLASS } from '@/components/ui/tile';
import type { GrowthPace, GrowthSummary } from '@/lib/utils/storicoSummary';

type TileProps = Parameters<typeof EvoluzioneTile>[0];

const GROWTH: GrowthSummary = {
  first: { year: 2024, month: 10, value: 20000 },
  latest: { year: 2026, month: 9, value: 50000 },
  snapshotCount: 24,
  monthsElapsed: 23,
  delta: 30000,
  growthPct: 150,
  cagr: null,
};

const PACE: GrowthPace = { trailingDelta: 12000, trailingPct: 31.6, trailingMonthly: 1000, lifetimeMonthly: 1304, verdict: null };

const render = (overrides: Partial<TileProps>) =>
  renderToStaticMarkup(
    createElement(EvoluzioneTile, { aside: 'dal 2024', reading: null, growth: GROWTH, pace: PACE, points: [], noteCount: 0, onAddNote: () => {}, ...overrides }),
  );

/** The class list of the chip whose caption is `caption`. */
function chipClass(html: string, caption: string): string {
  const at = html.indexOf(`>${caption}</span>`);
  const open = html.lastIndexOf('<div class="flex w-min', at);
  return /class="([^"]*)"/.exec(html.slice(open))![1];
}

/** The class list of the chips' row (the parent of the first chip). */
function rowClass(html: string): string {
  const firstChip = html.indexOf('<div class="flex w-min');
  const open = html.lastIndexOf('<div class="mt-4 flex', firstChip);
  return /class="([^"]*)"/.exec(html.slice(open))![1];
}

describe('EvoluzioneTile — the twelve months chip', () => {
  it('keeps the chip with its percentage when only the euro is lifted', () => {
    const html = render({ liftedFigures: ['growth', 'trailing'] });
    expect(chipClass(html, 'ultimi 12 mesi')).not.toContain(LIFTED_FIGURE_CLASS);
    expect(rowClass(html)).not.toContain(LIFTED_FIGURE_CLASS);
  });

  it('hides the whole chip, and the row, when the lifted euro was all it had', () => {
    const html = render({ pace: { ...PACE, trailingPct: null }, liftedFigures: ['growth', 'trailing'] });
    expect(chipClass(html, 'ultimi 12 mesi')).toContain(LIFTED_FIGURE_CLASS);
    expect(rowClass(html)).toContain(LIFTED_FIGURE_CLASS);
  });

  it('keeps that chip whole where nothing is lifted (from 768, and at 1440)', () => {
    const html = render({ pace: { ...PACE, trailingPct: null } });
    expect(chipClass(html, 'ultimi 12 mesi')).not.toContain(LIFTED_FIGURE_CLASS);
  });

  it('prints a twelve months that rounds to zero unsigned, euro and percentage alike', () => {
    const html = render({ pace: { ...PACE, trailingDelta: 0.3, trailingPct: 0.001 } });
    const text = html.replace(/<[^>]+>/g, '').replace(/[  ]/g, ' ');
    expect(text).toContain('0 € (0,0%)');
    expect(text).not.toContain('+0,0%');
  });
});
