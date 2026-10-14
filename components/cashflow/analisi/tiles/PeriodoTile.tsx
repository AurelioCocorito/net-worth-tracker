import type { Narrative } from '@/lib/utils/narrative';
import type { PeriodCashflowTotals } from '@/lib/utils/tracciamentoSummary';
import type { TotalsPacing } from '@/lib/utils/comparisonDeltas';
import type { SpendingPoint } from '@/lib/utils/analisiSummary';
import { cn } from '@/lib/utils';
import { LIFTED_FIGURE_CLASS, Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { CashflowKpiTrio } from '@/components/cashflow/tiles/CashflowKpiTrio';
import { SpendingBarsChart } from './SpendingBarsChart';

interface PeriodoTileProps {
  eyebrow: string;
  aside: Narrative | null;
  reading: Narrative | null;
  totals: PeriodCashflowTotals;
  /** Against the same window of the previous year; null when there is none. */
  pacing: TotalsPacing | null;
  /** Why there is no pacing although the baseline window exists («Nessun movimento nei primi 14 giorni di settembre 2025: nessun confronto.»); null with a pacing or without a window. */
  missingBaseline?: string | null;
  points: SpendingPoint[];
  chartKind: 'month' | 'year';
  /** The chart's sub-eyebrow («Spese per mese · 2026 e 2025»). */
  chartLabel: Narrative;
  /** Why a bar is at half tone and what the baseline is — pinned under the chart. */
  chartFooter: Narrative | null;
  /** The section's id: THE tile of the phone composition (`analisi-periodo`), open at every width. */
  id?: string;
  /**
   * The blocks the page's strip prints, hidden below `tablet:` (The Lifted-Figure Rule): `'trio'` —
   * the trio's three values (the strip's «Entrate» and «Risparmio», the first sentence's spending),
   * the spending delta (the first sentence's pacing, decision 83) and the caption that names the
   * deltas' baseline, which the first sentence names too. The income delta, the savings rate and
   * the coverage stay (decision 17). Default none.
   */
  liftedFigures?: readonly PeriodoLiftedBlock[];
  className?: string;
}

/** The blocks of the Periodo tile a phone's strip repeats (MOB-06, 2026-10-14). */
export type PeriodoLiftedBlock = 'trio';

/** Narrows the `string[]` of `liftedBlocks(strip, section)` to this tile's blocks at the call site. */
export function isPeriodoLiftedBlock(block: string): block is PeriodoLiftedBlock {
  return block === 'trio';
}

/** A percentage delta only when its baseline exists — the trio prints nothing for a zero base. */
const pacedDelta = (side: TotalsPacing['expenses'] | undefined): number | null => (side && side.previous > 0 ? side.deltaPercent : null);

/**
 * «Come è andato il periodo?» in figures — the dominant tile of Analisi: the three KPIs with
 * their year-over-year pacing (ONE caption for both, verbatim from `comparisonDeltas`, so the
 * page cannot disagree with the Confronto on what the baseline is), then the spending bars —
 * the element that stretches when the tile spans two rows.
 */
export function PeriodoTile({ eyebrow, aside, reading, totals, pacing, missingBaseline = null, points, chartKind, chartLabel, chartFooter, id, liftedFigures = [], className }: PeriodoTileProps) {
  const hasBaseline = points.some((point) => point.prevYearValue !== null);
  const trioLifted = liftedFigures.includes('trio');
  const currentYear = points[0]?.key.slice(0, 4);

  return (
    <Tile
      eyebrow={eyebrow}
      aside={aside ? <NarrativeText segments={aside} className="text-[10px]" figureClassName="font-medium" /> : undefined}
      reading={reading}
      id={id}
      className={className}
      ariaLabel="Periodo"
    >
      <CashflowKpiTrio
        totals={totals}
        incomeDelta={pacedDelta(pacing?.income)}
        expensesDelta={pacedDelta(pacing?.expenses)}
        previousLabel={null}
        lifted={trioLifted}
        // The spending delta is the first sentence's pacing, printed again a hand lower (decision 83).
        expensesDeltaLifted={trioLifted}
        className="mt-4"
      />
      {pacing && (pacing.income.previous > 0 || pacing.expenses.previous > 0) && (
        <p className={cn('mt-1.5 font-mono text-[11px] tabular-nums text-muted-foreground', trioLifted && LIFTED_FIGURE_CLASS)}>{pacing.baselineLabel}</p>
      )}
      {/* The baseline window exists but is empty: said in the caption's place, never a silent gap. */}
      {!pacing && missingBaseline && <p className="mt-1.5 text-[11px] text-muted-foreground">{missingBaseline}</p>}

      {points.length >= 2 && (
        <>
          <div className="mt-5 flex items-center justify-between gap-3">
            <NarrativeText segments={chartLabel} className={TILE_SUB_EYEBROW_CLASS} figureClassName="font-semibold" />
            <div className="flex gap-3 font-mono text-[11px] tabular-nums text-muted-foreground" aria-hidden="true">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[2px]" style={{ background: 'var(--chart-1)' }} />
                {chartKind === 'month' ? currentYear : 'Spese'}
              </span>
              {hasBaseline && currentYear && (
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[2px]" style={{ background: 'var(--muted-foreground)' }} />
                  {Number(currentYear) - 1}
                </span>
              )}
            </div>
          </div>
          {/* Below `desktop:` the bars yield to 120px — the chart shortens, never the reading (decision 4). */}
          <SpendingBarsChart points={points} kind={chartKind} plotClassName="max-desktop:min-h-[120px] desktop:min-h-[150px]" className="mt-2.5 flex-1" />
        </>
      )}

      {/* The footer explains the bars: without bars (a single bucket) it has nothing to explain. */}
      {points.length >= 2 && chartFooter && (
        <div className="mt-auto border-t border-border pt-3.5">
          <NarrativeText segments={chartFooter} className="text-[11px] text-muted-foreground" figureClassName="font-medium" />
        </div>
      )}
    </Tile>
  );
}
