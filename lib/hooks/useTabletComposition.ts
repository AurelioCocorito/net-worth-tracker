'use client';

/**
 * The tablet layer over `useMobileSections` (MOB-08, 2026-10-16; `lib/utils/tabletComposition.ts`
 * holds the layout and the WHY of every class): where each row of a composed grid sits at 768 and
 * 1024. Layout only — opening, closing, the memory and `reveal` stay the controller's, untouched:
 * at 1024 a row opens in place in the rail, so nothing moves away from a tap or a strip cell.
 *
 * What a page does: `const tablet = useTabletComposition({ sections, order })` with `order` the
 * rows it RENDERS, in DOM order (a row of the controller missing from the DOM would leave an empty
 * track and its gap); `style={tablet.gridStyle}` on the grid (`COMPACT_GRID_CLASS`, inside a
 * `COMPACT_GRID_WRAPPER_CLASS` div), `LEAD_CELL_CLASS` on THE tile's cell, `className={REST_CELL_CLASS}`
 * on `PageRest`, and on each row's cell `tablet.cellClass(id)` + `style={tablet.cellStyle(id)}`. At
 * 1440 (`!sections.compact`) everything is neutral: no style, no class — the grid of today.
 */

import type { CSSProperties } from 'react';
import type { MobileSections } from '@/lib/hooks/useMobileSections';
import { layoutTabletSections, RAIL_CELL_CLASS, WIDE_CELL_CLASS } from '@/lib/utils/tabletComposition';

export interface UseTabletCompositionOptions {
  sections: MobileSections;
  /** The rows the page RENDERS, in DOM order, THE tile excluded. */
  order: readonly string[];
}

export interface TabletComposition {
  /** `--beside` and `--lead-rows` on the grid; `undefined` at 1440. */
  gridStyle: CSSProperties | undefined;
  /** A row cell's classes: the rail at 1024, the whole grid row at 768 when open or alone; `''` at 1440 or for an id not in `order`. */
  cellClass(id: string): string;
  /** A row cell's `--row` in the rail; `undefined` at 1440. */
  cellStyle(id: string): CSSProperties | undefined;
}

export function useTabletComposition({ sections, order }: UseTabletCompositionOptions): TabletComposition {
  const { compact } = sections;
  const open = new Set(order.filter((id) => sections.collapse(id)?.open));
  const layout = layoutTabletSections({ order, open });

  const cellClass = (id: string): string => {
    if (!compact || !layout.railRow.has(id)) return '';
    return layout.wideAt768.has(id) ? `${RAIL_CELL_CLASS} ${WIDE_CELL_CLASS}` : RAIL_CELL_CLASS;
  };

  const cellStyle = (id: string): CSSProperties | undefined => {
    const row = compact ? layout.railRow.get(id) : undefined;
    return row === undefined ? undefined : ({ '--row': row } as CSSProperties);
  };

  const gridStyle = compact
    ? ({ '--beside': layout.railTracks, '--lead-rows': layout.railTracks + 1 } as CSSProperties)
    : undefined;

  return { gridStyle, cellClass, cellStyle };
}
