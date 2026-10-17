/**
 * The loading layout of the two Cashflow tabs whose wait is more than a tile grid, drawn by the
 * page as the `lazyComponent` fallback while the tab's chunk is on its way.
 *
 * Dividendi and Divisione draw a control row of their own while their data loads (Dividendi the
 * phone's axis — the period pill and the «+» — Divisione the period picker beside the verdict on
 * desktop and under the title below it, in the verdict's `axis` slot since 2026-10-12). A
 * fallback of verdict and cells alone made everything under that row jump when the chunk landed
 * — on a deep link (`?tab=dividends`, `?tab=split`) or a click before the preload. So the
 * fallback draws the same rows:
 *   - Dividendi's loading state IS `DividendsTabSkeleton` (the tab renders it too), the axis a
 *     placeholder of the pill's and the button's size in the skeleton's `axis` slot;
 *   - Divisione keeps its LIVE picker mounted while it reads (a new period is a new read, and the
 *     picker that asked for it keeps its place and focus), so `SplitTabSkeleton` mirrors the
 *     tab's row with a placeholder of the picker's size in the same slot — `ExpenseSplitTab`'s
 *     `periodRows` and `PeriodPicker`'s `h-11 desktop:h-9`: change one, change this.
 * Budget and Centri di Costo wait on a tile grid alone, so their fallback is the grid of
 * `lib/constants/cashflowTabSkeletons.ts`. Held by `e2e/lazyTabLanding.ts` (the grid's first cell
 * where the fallback drew it, once the tab is in its own loading state), seen red without this.
 *
 * This module imports no tab: a value imported from a lazy module puts it back in the page's
 * initial JavaScript (AGENTS.md § Dynamic Imports and Module Hygiene).
 */
import { Skeleton } from '@/components/ui/skeleton';
import { TileGridSkeleton, VerdictSkeleton } from '@/components/ui/tile-grid-skeleton';
import { DIVIDENDS_SKELETON_CELLS, SPLIT_SKELETON_CELLS } from '@/lib/constants/cashflowTabSkeletons';

export function DividendsTabSkeleton() {
  return (
    <TileGridSkeleton
      cells={DIVIDENDS_SKELETON_CELLS}
      className="pt-1"
      axis={
        <div className="flex items-center gap-2">
          <Skeleton className="h-11 min-w-0 flex-1 rounded-lg" />
          <Skeleton className="h-11 w-11 shrink-0 rounded-md" />
        </div>
      }
    />
  );
}

export function SplitTabSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-6 pt-1">
        <VerdictSkeleton className="flex-1" axis={<Skeleton className="h-11 w-[190px] rounded-md" />} />
        <Skeleton className="hidden h-9 w-[190px] shrink-0 rounded-md desktop:block" />
      </div>
      <TileGridSkeleton verdict={false} cells={SPLIT_SKELETON_CELLS} />
    </div>
  );
}
