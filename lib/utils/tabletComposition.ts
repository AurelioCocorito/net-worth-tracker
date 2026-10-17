/**
 * The tablet composition (2026-10-16; DESIGN.md → The First-Screen Rule, AGENTS.md § Tailwind
 * Breakpoints and Responsive Layout): the same small-screen composition as the phone's, laid out on
 * the widths a tablet gives it.
 *
 *   - 768 (two columns): THE tile on both, «Il resto della pagina» on a row of its own, the closed
 *     rows two by two in DOM order, an OPEN row on the whole grid row. A closed row that would sit
 *     ALONE on its grid row — the last of an odd run before an open one, or the last of the page —
 *     takes the whole row too, so no half cell is left empty. `sparse` flow, never `dense`: a
 *     dense grid would pull a later row up into an earlier hole, a CSS reordering.
 *   - A tablet in landscape (a content box of 880px or more below 1440: 936 at 1024×768 beside the
 *     56px icon rail, `TabletRail`; a 12,9" in portrait too): THE ANSWER on the left — the verdict
 *     and THE tile under it, still while the page scrolls — and on the right ONE tile, the INDEX:
 *     «Il resto della pagina» and every row, flat, one under the other, each opening in place
 *     (the owner's hybrid of two directions drawn on 2026-10-16, after an Impeccable critique of the
 *     first landscape layout of the same day, a 360px column of rows beside THE tile — «a phone made
 *     wider»). THE tile reaches the fold and its
 *     curve grows to fill it; the index is at least as tall, so the two cards start and end on the
 *     same lines.
 *
 * HOW, without moving a node: a page wraps its verdict and its grid in a STAGE (`STAGE_*`), wraps
 * «Il resto» and the rows in an INDEX (`INDEX_CLASS`), and marks the verdict's box and THE tile's
 * cell. Below the landscape width the grid wrapper, the grid and the index are what they were or
 * `display: contents`, so 390, 768 and 1440 lay out exactly as before; in landscape the grid and its
 * wrapper turn `contents` and the stage becomes the grid: the verdict and THE tile share the left
 * column's one cell (both sticky, THE tile pushed under the verdict by `--verdict-h`), the index
 * takes the right column. The heights the CSS cannot know — the fold under the page header, the
 * verdict's box, the left stack — are measured by `useTabletComposition` (`stageRef`) and written as
 * custom properties on the stage.
 *
 * WHY a container query and not a viewport one: Tailwind has `tablet:` (768) and `desktop:` (1440)
 * and nothing between — `lg:` is banned and an arbitrary `min-[…]:` loses to the named breakpoints
 * (AGENTS.md § Tailwind Breakpoints). The stage's width is `main`'s content box, so `@[880px]` is a
 * 1000px landscape viewport beside the rail, and `@[720px]` a 752px one.
 *
 * WHY every class carries `max-desktop:`: Tailwind 4 emits container queries AFTER media queries,
 * so `@[880px]:contents` alone would beat `desktop:grid-cols-12` at 1440 (the cascade, not the
 * width, decides). `max-desktop:@[880px]:` is `@media (width < 1440px) { @container … }`.
 * `__tests__/tabletComposition.test.ts` holds the rules over the constants and the composed grids;
 * `e2e/*.tablet.spec.ts` the widths.
 *
 * WARNING: a class here is a literal, so Tailwind's scanner sees it. Never build one by
 * concatenation.
 */

/**
 * The box the container queries measure: a NEW `div` around the verdict and the grid, never
 * `PageContainer` — `container-type` would make it the anchor of the `fixed` badge it holds
 * (`SavingsRateBadge`). It carries `ref={tablet.stageRef}` and the stage's own class.
 */
export const STAGE_WRAPPER_CLASS = '@container';

/**
 * The stage: the verdict over the grid, 16px apart (the `space-y-4` they had as siblings), and in
 * landscape the two-column grid of the answer and the index — the index at 360px, a phone's column
 * and a little, so a row reads as it does on a phone.
 */
export const STAGE_CLASS =
  'group/stage space-y-4 max-desktop:@[880px]:grid max-desktop:@[880px]:grid-cols-[minmax(0,1fr)_360px] max-desktop:@[880px]:items-start max-desktop:@[880px]:gap-x-4 max-desktop:@[880px]:space-y-0';

/** The verdict's box: in landscape the left column's top, still while the index scrolls. */
export const VERDICT_CELL_CLASS =
  'max-desktop:@[880px]:[grid-column:1] max-desktop:@[880px]:[grid-row:1] max-desktop:@[880px]:self-start max-desktop:@[880px]:mb-[calc(var(--lead-h,0px)+16px)] max-desktop:@[880px]:group-data-[stick=true]/stage:sticky max-desktop:@[880px]:top-4';

/** The grid's old wrapper, kept as a plain box below the landscape width and `contents` in it. */
export const COMPACT_GRID_WRAPPER_CLASS = 'max-desktop:@[880px]:contents';

/** The grid of a composed page: one column, two from `tablet:`, twelve at 1440; in landscape `contents` (the stage is the grid). */
export const COMPACT_GRID_CLASS =
  'grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12 max-desktop:@[880px]:contents';

/**
 * THE tile's cell: both columns at 768; in landscape the left column under the verdict (the verdict's
 * height plus 16px down), still at the same distance, and as tall as the fold leaves it — never less
 * than 360px, more if its content asks — so a tile whose plot is `flex-1` grows its curve to the fold.
 */
export const LEAD_CELL_CLASS =
  'tablet:col-span-2 max-desktop:@[880px]:[grid-column:1] max-desktop:@[880px]:[grid-row:1] max-desktop:@[880px]:self-start max-desktop:@[880px]:group-data-[stick=true]/stage:sticky max-desktop:@[880px]:mt-[calc(var(--verdict-h,0px)+16px)] max-desktop:@[880px]:top-[calc(var(--verdict-h,0px)+32px)] max-desktop:@[880px]:min-h-[max(360px,calc(var(--fold,720px)-var(--verdict-h,0px)-16px))]';

/**
 * The grid of before, for a page's states with no rows (no goal, no run, no budget, the overview
 * unread): one column, two from `tablet:`, twelve at 1440 — no stage behaviour.
 */
export const PLAIN_GRID_CLASS = 'grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12';

/**
 * THE tile's cell on a grid that is composed in some states only: `LEAD_CELL_CLASS` when composed,
 * both columns of the plain grid otherwise. Through this function and never bare: on a plain grid the
 * landscape classes of `LEAD_CELL_CLASS` still answer the stage's container and put the tile in the
 * left column with the right one empty (Obiettivi with no goal, 2026-10-16; `__tests__/tabletComposition.test.ts`).
 */
export function leadCellClass(composed: boolean): string {
  return composed ? LEAD_CELL_CLASS : 'tablet:col-span-2';
}

/**
 * The index: the right column, ONE card (the tile's surface) at least as tall as the left stack, its
 * children one under the other with a hairline between — «Il resto» first, then every row, whose own
 * card turns flat (`section[id]`: the row's section; a tile's inner sections carry no id). Below the
 * landscape width it is `contents`: the rows stay cells of the grid.
 */
export const INDEX_CLASS =
  'contents max-desktop:@[880px]:[grid-column:2] max-desktop:@[880px]:[grid-row:1] max-desktop:@[880px]:flex max-desktop:@[880px]:flex-col max-desktop:@[880px]:min-h-[var(--left-h,var(--fold,720px))] max-desktop:@[880px]:overflow-hidden max-desktop:@[880px]:rounded-2xl max-desktop:@[880px]:border max-desktop:@[880px]:border-border max-desktop:@[880px]:bg-card max-desktop:@[880px]:shadow-sm max-desktop:@[880px]:divide-y max-desktop:@[880px]:divide-border max-desktop:@[880px]:[&>*]:self-stretch max-desktop:@[880px]:[&_section[id]]:rounded-none max-desktop:@[880px]:[&_section[id]]:border-0 max-desktop:@[880px]:[&_section[id]]:bg-transparent max-desktop:@[880px]:[&_section[id]]:shadow-none';

/**
 * A box INSIDE the index that holds several rows and is `contents` elsewhere (Storico's and Rendimenti's
 * desktop columns, Divisione's people): `divide-y` and the stretch act on the index's direct children
 * only, so in landscape the box becomes a column of its own with the same hairlines.
 */
export const INDEX_GROUP_CLASS =
  'max-desktop:@[880px]:flex max-desktop:@[880px]:flex-col max-desktop:@[880px]:divide-y max-desktop:@[880px]:divide-border max-desktop:@[880px]:[&>*]:self-stretch';

/** «Il resto della pagina» (`PageRest`'s `className`): in landscape the index's head, at a row's height. */
export const REST_CELL_CLASS = 'max-desktop:@[880px]:min-h-[52px] max-desktop:@[880px]:pl-5 max-desktop:@[880px]:pr-3';

/**
 * A closed row's ANSWER (the page's `RowAnswers`, read by `TileRowShell` through `useRowAnswer`),
 * shown in the landscape index only — 12px words, the figure mono — and the scope aside it replaces
 * there (`ASIDE_YIELDS_TO_ANSWER_CLASS`).
 */
export const CLOSED_ANSWER_CLASS = 'hidden text-[12px] text-foreground max-desktop:@[880px]:inline-flex';
export const ASIDE_YIELDS_TO_ANSWER_CLASS = 'max-desktop:@[880px]:hidden';

/** A row on the whole grid row at 768: an open one, or a closed one that would sit alone. Inert in landscape (the index is not a grid). */
export const WIDE_CELL_CLASS = 'max-desktop:@[720px]:col-span-full';

export interface TabletLayout {
  /** The rows on the whole grid row at 768: the open ones, and a closed one left alone on its row. */
  wideAt768: ReadonlySet<string>;
}

export interface LayoutTabletSectionsInput {
  /** The rows ON THE PAGE, in DOM order (THE tile excluded). An id in it twice counts once. */
  order: readonly string[];
  /** The open rows; ids not in `order` are ignored. */
  open: ReadonlySet<string>;
}

/**
 * Where each row of a composed page goes at 768. Pure: the hook recomputes it on every render from
 * the page's `order`, so a row that appears (Analisi's Scheda, a loan's row) takes its place and the
 * ones after it slide.
 */
export function layoutTabletSections({ order, open }: LayoutTabletSectionsInput): TabletLayout {
  const ids = [...new Set(order)];

  // At 768 the closed rows pair up between the open ones; the last of an odd run would sit alone.
  const wideAt768 = new Set<string>();
  let run: string[] = [];
  const closeRun = () => {
    if (run.length % 2 === 1) wideAt768.add(run[run.length - 1]);
    run = [];
  };
  for (const id of ids) {
    if (open.has(id)) {
      closeRun();
      wideAt768.add(id);
    } else {
      run.push(id);
    }
  }
  closeRun();

  return { wideAt768 };
}

/** The gap between the verdict and THE tile in landscape: `LEAD_CELL_CLASS`'s 16px, in the measure too. */
const STAGE_GAP_PX = 16;

/** Where the stuck verdict sits under the scroller's top:  of . */
const STICKY_TOP_PX = 16;

export interface StageMetrics {
  /** The scroller's visible height (`main.clientHeight`). */
  mainHeight: number;
  /** The stage's top inside the scroller's content, scroll undone. */
  stageTop: number;
  /** The scroller's bottom padding (the pill's room on a portrait screen, 24px in landscape). */
  mainPaddingBottom: number;
  /** The verdict box's height. */
  verdictHeight: number;
  /** THE tile cell's height. */
  leadHeight: number;
}

/**
 * The custom properties the landscape stage reads (pure, so the arithmetic is tested): `--fold` the
 * height from the stage's top to the first screen's bottom, `--verdict-h` the verdict's box,
 * `--lead-h` THE tile's cell, `--left-h` the left stack — the index's floor, so the two cards end on
 * one line.
 */
export function stageCustomProperties(m: StageMetrics): Record<'--fold' | '--verdict-h' | '--lead-h' | '--left-h', string> {
  const fold = Math.max(0, Math.round(m.mainHeight - m.stageTop - m.mainPaddingBottom));
  const verdict = Math.round(m.verdictHeight);
  const lead = Math.round(m.leadHeight);
  const left = Math.round(m.verdictHeight + STAGE_GAP_PX + m.leadHeight);
  return { '--fold': `${fold}px`, '--verdict-h': `${verdict}px`, '--lead-h': `${lead}px`, '--left-h': `${left}px` };
}

/**
 * Whether the left stack sticks while the index scrolls (`data-stick` on the stage): only when it fits
 * the screen once stuck 16px from the top — a stack taller than the screen would keep its bottom out
 * of reach for the whole scroll, so it scrolls with the page instead. The verdict and THE tile stick
 * as ONE: the verdict's bottom margin spans THE tile (`VERDICT_CELL_CLASS`), so at the end of the
 * index both are pushed up together and THE tile never slides over the verdict (seen on 2026-10-16
 * on Hall of Fame and Previdenza before the margin).
 */
export function leftStackSticks(m: StageMetrics): boolean {
  return STICKY_TOP_PX + m.verdictHeight + STAGE_GAP_PX + m.leadHeight <= m.mainHeight - m.mainPaddingBottom;
}
