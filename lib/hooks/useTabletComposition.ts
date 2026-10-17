'use client';

/**
 * The tablet layer over `useMobileSections` (2026-10-16; `lib/utils/tabletComposition.ts` holds the
 * layout and the WHY of every class): where each row of a composed grid sits at 768, and the heights
 * the landscape stage needs. Layout only — opening, closing, the memory and `reveal` stay the
 * controller's, untouched: in landscape a row opens in place in the index, so nothing moves away
 * from a tap or a strip cell.
 *
 * What a page does: `const tablet = useTabletComposition({ sections, order })` with `order` the
 * rows it RENDERS, in DOM order, and `const stageRef = useTabletStage()`; the verdict and the grid
 * inside `<div className={STAGE_WRAPPER_CLASS}><div ref={stageRef} className={STAGE_CLASS}>`; the
 * verdict's box `data-stage="verdict"` with `VERDICT_CELL_CLASS`; THE tile's cell `data-stage="lead"`
 * with `LEAD_CELL_CLASS`; «Il resto» and the rows inside `<div className={INDEX_CLASS}>`;
 * `className={REST_CELL_CLASS}` on `PageRest`, and on each row's cell `tablet.cellClass(id)`. At 1440
 * (`!sections.compact`) every class is neutral.
 *
 * Two hooks, not one object: a ref read during render is what the React Compiler refuses
 * (`react-hooks/refs`), and an object carrying the ref made every `tablet.cellClass(…)` in the JSX
 * look like one (2026-10-16, seen as lint errors on every composed page).
 */

import { useCallback, useEffect, useRef } from 'react';
import type { MobileSections } from '@/lib/hooks/useMobileSections';
import { layoutTabletSections, leftStackSticks, stageCustomProperties, WIDE_CELL_CLASS } from '@/lib/utils/tabletComposition';

export interface UseTabletCompositionOptions {
  sections: MobileSections;
  /** The rows the page RENDERS, in DOM order, THE tile excluded. */
  order: readonly string[];
}

export interface TabletComposition {
  /** A row cell's classes: the whole grid row at 768 when open or alone; `''` at 1440 or for an id not in `order`. */
  cellClass(id: string): string;
}

export function useTabletComposition({ sections, order }: UseTabletCompositionOptions): TabletComposition {
  const { compact } = sections;
  const open = new Set(order.filter((id) => sections.collapse(id)?.open));
  const layout = layoutTabletSections({ order, open });

  const cellClass = (id: string): string => (compact && layout.wideAt768.has(id) ? WIDE_CELL_CLASS : '');

  return { cellClass };
}

/**
 * Measures a stage and keeps `--fold`, `--verdict-h`, `--lead-h`, `--left-h` and `data-stick` current:
 * when the scroller, the verdict or THE tile resize, and when the verdict's box or THE tile's cell is
 * replaced (a page whose lead changes with its data — Budget's Tetto or Categorie a rischio, the first
 * goal, the first run — swaps the node under the same stage).
 */
function observeStage(stage: HTMLDivElement): () => void {
  const main = stage.closest('main');
  if (!main) return () => {};
  let verdict: HTMLElement | null = null;
  let lead: HTMLElement | null = null;

  const write = () => {
    if (!verdict || !lead) return;
    const mainRect = main.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const metrics = {
      mainHeight: main.clientHeight,
      stageTop: stageRect.top - mainRect.top + main.scrollTop,
      mainPaddingBottom: parseFloat(getComputedStyle(main).paddingBottom) || 0,
      verdictHeight: verdict.offsetHeight,
      leadHeight: lead.offsetHeight,
    };
    for (const [name, value] of Object.entries(stageCustomProperties(metrics))) {
      if (stage.style.getPropertyValue(name) !== value) stage.style.setProperty(name, value);
    }
    const stick = String(leftStackSticks(metrics));
    if (stage.dataset.stick !== stick) stage.dataset.stick = stick;
  };

  const resize = new ResizeObserver(write);
  resize.observe(main);
  const attach = () => {
    const nextVerdict = stage.querySelector<HTMLElement>('[data-stage="verdict"]');
    const nextLead = stage.querySelector<HTMLElement>('[data-stage="lead"]');
    if (nextVerdict === verdict && nextLead === lead) return;
    if (verdict) resize.unobserve(verdict);
    if (lead) resize.unobserve(lead);
    verdict = nextVerdict;
    lead = nextLead;
    if (verdict) resize.observe(verdict);
    if (lead) resize.observe(lead);
    write();
  };
  attach();
  const mutations = new MutationObserver(attach);
  mutations.observe(stage, { childList: true, subtree: true });
  return () => {
    resize.disconnect();
    mutations.disconnect();
  };
}

/** The callback ref of a page's stage (`STAGE_CLASS`): a page mounts it once its data is read, and the observer follows the node. */
export function useTabletStage(): (node: HTMLDivElement | null) => void {
  const cleanup = useRef<(() => void) | null>(null);
  const stageRef = useCallback((node: HTMLDivElement | null) => {
    cleanup.current?.();
    cleanup.current = node ? observeStage(node) : null;
  }, []);
  useEffect(() => () => cleanup.current?.(), []);
  return stageRef;
}
