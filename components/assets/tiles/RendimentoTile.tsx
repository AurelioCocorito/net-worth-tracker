'use client';

import Link from 'next/link';
import type { DashboardOverviewTopAsset } from '@/types/dashboardOverview';
import { cachedFormatCurrencyEUR, formatSignedEuro, printedSign } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { describeInstrumentReturns, pluralArticleFor } from '@/lib/utils/patrimonioNarrative';
import type { InstrumentReturnRanking, UnrealizedGainsSummary } from '@/lib/utils/patrimonioSummary';
import { signTextClass } from '@/lib/utils/metricColors';
import { cn } from '@/lib/utils';
import { LIFTED_FIGURE_CLASS, Tile, TILE_FOOTER_ACTION_CLASS, TILE_SUB_EYEBROW_CLASS, type TileCollapse } from '@/components/ui/tile';

/**
 * The block of this tile a phone's strip repeats (The Lifted-Figure Rule; since 2026-10-14): the
 * «G/P non realizzato» KPI, which the strip's first cell prints with its cents. Its percentage over
 * the cost basis stays.
 */
export type AssetRendimentoLiftedBlock = 'gain';

/** Narrows the `string[]` of `liftedBlocks(strip, section)` to this tile's blocks at the call site. */
export function isAssetRendimentoLiftedBlock(block: string): block is AssetRendimentoLiftedBlock {
  return block === 'gain';
}

interface RendimentoTileProps {
  gains: UnrealizedGainsSummary;
  ranking: InstrumentReturnRanking;
  /** How many positions the ranking was drawn from (the overview's topAssets). */
  rankedFrom: number;
  /** The row below `desktop:` (`useMobileSections().collapse(id)`); `undefined` at 1440. */
  collapse?: TileCollapse;
  /** What the closed row says beside its eyebrow («vs PMC»). */
  asideWhenClosed?: string;
  /** The blocks the page's strip prints, hidden below `desktop:`. Default none. */
  liftedFigures?: readonly AssetRendimentoLiftedBlock[];
  className?: string;
}

function ReturnRow({ asset }: { asset: DashboardOverviewTopAsset }) {
  const value = asset.returnPercent ?? 0;
  return (
    <div className="flex items-center gap-3 py-[7px]">
      <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{asset.name}</span>
      <span className="w-[84px] shrink-0 text-right font-mono text-[13px] tabular-nums text-foreground">
        {cachedFormatCurrencyEUR(asset.totalValue, true)}
      </span>
      <span className={cn('w-[56px] shrink-0 text-right font-mono text-[12px] font-semibold tabular-nums', signTextClass(value))}>
        {value >= 0 ? '+' : '−'}
        {formatPercentage(Math.abs(value), 1)}
      </span>
    </div>
  );
}

/**
 * "Cosa rende?" — the unrealized gain over the cost basis as the KPI, then the best positions
 * and the worst one by return over PMC. Returns come from the overview's `topAssets`, computed
 * server-side: the tile never recomputes a return.
 */
export function RendimentoTile({ gains, ranking, rankedFrom, collapse, asideWhenClosed, liftedFigures = [], className }: RendimentoTileProps) {
  const best = ranking.best[0]
    ? { name: ranking.best[0].name, returnPercent: ranking.best[0].returnPercent ?? 0 }
    : null;
  const subject = gains.count === 1 ? 'strumento con costo' : 'strumenti con costo';
  // A row keeps a TEXT aside beside its eyebrow (`Tile`): the same words there, without the mono span.
  const aside =
    gains.count === 0 ? undefined : collapse ? (
      `vs PMC · ${gains.count} ${subject}`
    ) : (
      <span>
        vs PMC · <span className="font-mono tabular-nums">{gains.count}</span> {subject}
      </span>
    );

  return (
    <Tile
      eyebrow="Rendimento"
      collapse={collapse}
      asideWhenClosed={asideWhenClosed}
      aside={aside}
      reading={describeInstrumentReturns(gains.gainPercent, best)}
      className={className}
    >
      {gains.count === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">
          Nessuna posizione con un prezzo di carico: il rendimento si misura sul PMC.
        </p>
      ) : (
        <>
          <div className="mt-3.5 flex flex-col gap-1.5">
            {/* The KPI the strip's «G/P non realizzato» cell prints, lifted on a phone with its label;
                the percentage under it stays (The Lifted-Figure Rule). ONE formatter with the cell: a zero as
                printed takes no sign and no colour (the printed-zero rule). */}
            <p className={cn(TILE_SUB_EYEBROW_CLASS, liftedFigures.includes('gain') && LIFTED_FIGURE_CLASS)}>G/P non realizzato</p>
            <p
              className={cn(
                'font-mono text-[22px] font-bold leading-none tracking-[-0.03em] tabular-nums',
                printedSign(gains.gainLoss, 2) === 0 ? 'text-foreground' : signTextClass(gains.gainLoss),
                liftedFigures.includes('gain') && LIFTED_FIGURE_CLASS,
              )}
            >
              {formatSignedEuro(gains.gainLoss)}
            </p>
            {gains.gainPercent !== null && (
              <p className="text-[11px] text-muted-foreground">
                <span className={cn('font-mono tabular-nums', signTextClass(gains.gainPercent))}>
                  {gains.gainPercent >= 0 ? '+' : '−'}
                  {formatPercentage(Math.abs(gains.gainPercent), 1)}
                </span>{' '}
                su{' '}
                <span className="font-mono tabular-nums text-foreground">
                  {cachedFormatCurrencyEUR(gains.costBasis, true)}
                </span>{' '}
                di costo di carico
              </p>
            )}
          </div>
          {ranking.best.length > 0 && (
            <>
              <p className={cn(TILE_SUB_EYEBROW_CLASS, 'mt-3')}>
                {ranking.best.length === 1 ? 'Migliore' : 'Migliori'}
              </p>
              <div className="mt-0.5 flex flex-col divide-y divide-border">
                {ranking.best.map((asset) => (
                  <ReturnRow key={asset.id} asset={asset} />
                ))}
              </div>
            </>
          )}
          {ranking.worst && (
            <>
              <p className={cn(TILE_SUB_EYEBROW_CLASS, 'mt-2.5')}>Peggiore</p>
              <div className="mt-0.5 flex flex-col">
                <ReturnRow asset={ranking.worst} />
              </div>
            </>
          )}
        </>
      )}
      <p className="mt-auto border-t border-border pt-3.5 text-[11px] text-muted-foreground">
        {ranking.measuredCount > 0 && `Tra ${pluralArticleFor(rankedFrom)} ${rankedFrom} strumenti maggiori · `}
        TWR e benchmark in{' '}
        <Link href="/dashboard/performance" className={TILE_FOOTER_ACTION_CLASS}>
          Rendimenti
        </Link>
        .
      </p>
    </Tile>
  );
}
