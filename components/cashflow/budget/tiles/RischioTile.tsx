'use client';

import type { Narrative } from '@/lib/utils/narrative';
import type { BudgetRiskSummary } from '@/types/budget';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { Tile, type TileCollapse } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';

interface RischioTileProps {
  risk: BudgetRiskSummary;
  aside: Narrative;
  reading: Narrative;
  footer: Narrative;
  /** THE tile's anchor when the account has no ceiling (`bud-rischio`); exclusive with `collapse`. */
  id?: string;
  /** The row below `desktop:` while the Tetto is THE tile; `undefined` at 1440. */
  collapse?: TileCollapse;
  /** What the closed row says beside its eyebrow («a fine mese»). */
  asideWhenClosed?: string;
  className?: string;
}

/**
 * "Quali categorie stanno per sforare?" — the monthly budgets whose month-end projection
 * exceeds their amount, largest overrun first. The aside names the horizon («a fine mese»)
 * and the footer the scope, because neither is guessable from the rows: these are
 * projections, not money spent, and only over the categories the user gave a budget to.
 * The crossed thresholds live in the Avvisi tile — no row appears in both.
 */
export function RischioTile({ risk, aside, reading, footer, id, collapse, asideWhenClosed, className }: RischioTileProps) {
  // A tile is THE tile (an `id`) or a row (a `collapse`), never both: the union is `Tile`'s own.
  const anchor = collapse ? { collapse, asideWhenClosed } : { id };
  return (
    <Tile eyebrow="Categorie a rischio" aside={<NarrativeText segments={aside} figureClassName="font-medium" />} reading={reading} className={className} {...anchor}>
      {risk.atRisk.length > 0 && (
        <ul className="mt-2 flex flex-col divide-y divide-border">
          {risk.atRisk.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-3 py-[9px]">
              <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{row.label}</span>
              <span className="shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground">
                ~{cachedFormatCurrencyEUR(row.projectedTotal, true)} su {cachedFormatCurrencyEUR(row.budgetAmount, true)}
              </span>
              <span className="w-[60px] shrink-0 text-right font-mono text-[13px] tabular-nums text-destructive">
                +{cachedFormatCurrencyEUR(row.overBy, true)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <NarrativeText
        segments={footer}
        className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground"
        figureClassName="font-medium"
      />
    </Tile>
  );
}
