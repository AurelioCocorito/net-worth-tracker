import type { ReactNode } from 'react';
import type { Narrative } from '@/lib/utils/narrative';
import { TRACKING_TRIO_BLOCK, type MonthFlow, type PeriodCashflowTotals, type PeriodDelta } from '@/lib/utils/tracciamentoSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { CASHFLOW_SERIES_COLOR } from '@/lib/constants/expenseTypeColors';
import { NarrativeText } from '@/components/ui/narrative-text';
import { CashflowKpiTrio, deltaClass } from './CashflowKpiTrio';
import { FlowBarsChart } from './FlowBarsChart';

/** The one block of this tile a phone's strip lifts: the trio's three values (doc/guide/cashflow-tracciamento.md). */
export type CashflowPeriodoLiftedBlock = typeof TRACKING_TRIO_BLOCK;

/** Narrows `liftedBlocks(strip, id)` at the call site (the convention of `LIFTED_FIGURE_CLASS`). */
export function isCashflowPeriodoLiftedBlock(block: string): block is CashflowPeriodoLiftedBlock {
  return block === TRACKING_TRIO_BLOCK;
}

export interface SpendingProjection {
  /** Where spending lands at the current daily pace — a linear extrapolation, named as such. */
  projected: number;
  /** Last month's spending to read it against; null when last month has none. */
  previousExpenses: number | null;
  /** The row label of last month ("A luglio"), from the narrative module. */
  previousLabel: string;
}

interface CashflowPeriodoTileProps {
  /** THE tile's anchor (`trk-periodo`): open at every width, never a row (The First-Screen Rule). */
  id?: string;
  eyebrow: string;
  aside?: ReactNode;
  reading: Narrative | null;
  totals: PeriodCashflowTotals;
  /** Against the previous period; null when there is none (a custom range). */
  delta: PeriodDelta | null;
  /** The caption of a delta ("luglio", "2025"); null when there is no previous period. */
  previousLabel: string | null;
  /** The months of the income-vs-spending chart, oldest first. */
  flows: MonthFlow[];
  /** The month the page is about, highlighted in the chart; null for a year. */
  highlightKey: string | null;
  /** The chart's sub-eyebrow («Ultimi 6 mesi», «6 mesi fino a maggio 2025», «Mese per mese»). */
  windowLabel: Narrative;
  /** The month-end projection, only while the period is the current month. */
  projection: SpendingProjection | null;
  /**
   * The blocks the phone's strip already prints (`liftedBlocks(strip, id).filter(
   * isCashflowPeriodoLiftedBlock)`): the trio's three values hide below `desktop:`, its rate,
   * coverage and deltas stay (The Lifted-Figure Rule). Analisi passes none.
   */
  liftedFigures?: readonly CashflowPeriodoLiftedBlock[];
  className?: string;
}

/**
 * "Come sta andando il periodo?" in figures — the dominant tile of Tracciamento: the three
 * KPIs with their deltas, the income-vs-spending bars of the trailing months (the element
 * that stretches when the tile spans two rows), and, while the month is still running, where
 * spending lands at the current pace next to last month's figure. The savings rate and the
 * coverage ratio sit together on purpose: same relationship, two units (the rules are in
 * doc/guide/cashflow-tracciamento.md).
 */
export function CashflowPeriodoTile({
  id,
  eyebrow,
  aside,
  reading,
  totals,
  delta,
  previousLabel,
  flows,
  highlightKey,
  windowLabel,
  projection,
  liftedFigures = [],
  className,
}: CashflowPeriodoTileProps) {
  const projectionClass =
    projection && projection.previousExpenses !== null && projection.previousExpenses > 0
      ? deltaClass(projection.projected - projection.previousExpenses, false)
      : 'text-foreground';

  return (
    <Tile id={id} eyebrow={eyebrow} aside={aside} reading={reading} className={className} ariaLabel="Cashflow del periodo">
      <CashflowKpiTrio
        totals={totals}
        incomeDelta={delta?.income ?? null}
        expensesDelta={delta?.expenses ?? null}
        previousLabel={previousLabel}
        lifted={liftedFigures.includes(TRACKING_TRIO_BLOCK)}
        className="mt-4"
      />

      {flows.length >= 2 && (
        <>
          <div className="mt-5 flex items-center justify-between gap-3">
            <NarrativeText segments={windowLabel} className={TILE_SUB_EYEBROW_CLASS} figureClassName="font-semibold" />
            <div className="flex gap-3 text-[11px] text-muted-foreground" aria-hidden="true">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[2px]" style={{ background: CASHFLOW_SERIES_COLOR.income }} />
                Entrate
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[2px]" style={{ background: CASHFLOW_SERIES_COLOR.expenses }} />
                Spese
              </span>
            </div>
          </div>
          <FlowBarsChart flows={flows} highlightKey={highlightKey} className="mt-2.5 flex-1" />
        </>
      )}

      {projection && (
        <div className="mt-auto flex flex-col border-t border-border pt-3.5">
          <p className={cn(TILE_SUB_EYEBROW_CLASS, 'mb-0.5')}>Spese a fine mese</p>
          <div className="flex flex-col divide-y divide-border">
            <div className="flex items-center justify-between gap-3 py-[8px]">
              <span className="text-[13px] text-muted-foreground">Al ritmo attuale</span>
              <span className={cn('font-mono text-[13px] tabular-nums', projectionClass)}>
                ~{cachedFormatCurrencyEUR(projection.projected, true)}
              </span>
            </div>
            {/* No last-month figure → no row: a placeholder is not a fact. */}
            {projection.previousExpenses !== null && projection.previousExpenses > 0 && (
              <div className="flex items-center justify-between gap-3 py-[8px]">
                <span className="text-[13px] text-muted-foreground">{projection.previousLabel}</span>
                <span className="font-mono text-[13px] tabular-nums text-foreground">
                  {cachedFormatCurrencyEUR(projection.previousExpenses, true)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </Tile>
  );
}
