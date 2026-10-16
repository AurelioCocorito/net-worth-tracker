/**
 * The tablet composition (MOB-08, 2026-10-16; doc/mobile/README.md § 9, decisions 1, 48–51 and
 * 101–104): the same small-screen composition as the phone's, laid out on the widths a tablet
 * gives it.
 *
 *   - 768 (two columns): THE tile on both, «Il resto della pagina» on a row of its own, the closed
 *     rows two by two in DOM order, an OPEN row on the whole grid row. A closed row that would sit
 *     ALONE on its grid row — the last of an odd run before an open one, or the last of the page —
 *     takes the whole row too, so no half cell is left empty. `sparse` flow, never `dense`: a
 *     dense grid would pull a later row up into an earlier hole, a CSS reordering (decision 1).
 *   - 1024 landscape (a container of 992px): THE tile on the left, and on the right a 360px RAIL
 *     holding «Il resto della pagina» and EVERY row, in DOM order. A row opens IN PLACE in the rail:
 *     the rows after it slide down, nothing leaves the rail, nothing scrolls (the owner, 2026-10-16,
 *     after an Impeccable critique: decision 104 — the first version sent an opened row under THE
 *     tile and left the rail empty, 446px of void on the Panoramica).
 *
 * WHY a container query and not a viewport one: Tailwind has `tablet:` (768) and `desktop:` (1440)
 * and nothing between — `lg:` is banned and an arbitrary `min-[…]:` loses to the named breakpoints
 * (AGENTS.md § Tailwind Breakpoints). The grid's width is `main`'s content box (the viewport minus
 * `p-4`, no sidebar below `desktop:`), so `@[960px]` is a 992px viewport and `@[720px]` a 752px one.
 *
 * WHY every class carries `max-desktop:`: Tailwind 4 emits container queries AFTER media queries,
 * so `@[960px]:grid-cols-…` alone would beat `desktop:grid-cols-12` at 1440 (the cascade, not the
 * width, decides). `max-desktop:@[960px]:` is `@media (width < 1440px) { @container … }`. Among
 * container queries Tailwind emits the smaller size first, so at 992px the rail's
 * `@[960px]:[grid-column:2]` beats the whole-row `@[720px]:col-span-full`: a row that spans the
 * grid at 768 stays in the rail at 1024. `__tests__/tabletComposition.test.ts` holds the rules over
 * the constants and the composed grids; `e2e/*.tablet.spec.ts` the widths.
 *
 * WHY THE tile spans one track MORE than the rail (`--lead-rows` = `--beside` + 1): a spanning
 * item's extra height goes to the tracks it crosses UP TO THEIR LIMITS (CSS Grid § 12.5.1,
 * «distribute space up to limits»): an occupied track is limited by its own row, the last one —
 * which nothing else occupies — is not, so it takes all of it and the rail's rows stay as tall as
 * their trigger and 12px apart. Measured on 2026-10-16 (`e2e/*.tablet.spec.ts`): spanning only the
 * occupied tracks spread THE tile over them (the rows drifted apart, red); the template's `1fr`
 * replaced by `auto`, or no `--beside` at all, stayed GREEN — the empty track is what holds, the
 * `repeat(var(--beside), auto) 1fr` template only names it. When the rail is taller than THE tile
 * the last track is 0 and THE tile keeps its own height (`self-start`).
 *
 * WARNING: a class here is a literal, so Tailwind's scanner sees it. Never build one by
 * concatenation.
 */

/**
 * The box the container queries measure: a NEW `div` around the grid, never `PageContainer` —
 * `container-type` would make it the anchor of the `fixed` badge it holds (`SavingsRateBadge`).
 */
export const COMPACT_GRID_WRAPPER_CLASS = '@container';

/**
 * The grid of a composed page: one column, two from `tablet:`, THE tile and the 360px rail (a
 * phone's column and a little: a row reads as it does on a phone) in a 960px container, twelve at 1440; at 1024 `--beside` auto tracks and the flexible one THE tile
 * ends on (see above).
 */
export const COMPACT_GRID_CLASS =
  'grid grid-cols-1 gap-3 tablet:grid-cols-2 max-desktop:@[960px]:grid-cols-[minmax(0,1fr)_360px] max-desktop:@[960px]:grid-rows-[repeat(var(--beside),auto)_1fr] desktop:grid-cols-12';

/** THE tile's cell: both columns at 768; at 1024 the left track, from the first track through the flexible one, at its natural height. */
export const LEAD_CELL_CLASS =
  'tablet:col-span-2 max-desktop:@[960px]:[grid-column:1] max-desktop:@[960px]:[grid-row:1/span_var(--lead-rows)] max-desktop:@[960px]:self-start';

/** «Il resto della pagina» (`PageRest`'s `className`): the rail's first track at 1024. */
export const REST_CELL_CLASS = 'max-desktop:@[960px]:[grid-column:2] max-desktop:@[960px]:row-start-1';

/** Every row at 1024: the rail, on the track `--row` names — open or closed, it never leaves it. */
export const RAIL_CELL_CLASS = 'max-desktop:@[960px]:[grid-column:2] max-desktop:@[960px]:[grid-row:var(--row)]';

/** A row on the whole grid row at 768: an open one, or a closed one that would sit alone. Inert at 1024 (the rail wins, see above). */
export const WIDE_CELL_CLASS = 'max-desktop:@[720px]:col-span-full';

export interface TabletLayout {
  /** Every row → its track in the rail at 1024 (2…, in DOM order); track 1 is `PageRest`'s. */
  railRow: ReadonlyMap<string, number>;
  /** The rows on the whole grid row at 768: the open ones, and a closed one left alone on its row. */
  wideAt768: ReadonlySet<string>;
  /** The rail's tracks at 1024 (`--beside`): `PageRest`'s plus one per row. THE tile spans one more (`--lead-rows`). */
  railTracks: number;
}

export interface LayoutTabletSectionsInput {
  /** The rows ON THE PAGE, in DOM order (THE tile excluded). An id in it twice counts once. */
  order: readonly string[];
  /** The open rows; ids not in `order` are ignored. */
  open: ReadonlySet<string>;
}

/**
 * Where each row of a composed page goes on a tablet. Pure: the hook recomputes it on every render
 * from the page's `order`, so a row that appears (Analisi's Scheda, a loan's row) takes its place
 * and the ones after it slide.
 */
export function layoutTabletSections({ order, open }: LayoutTabletSectionsInput): TabletLayout {
  const ids = [...new Set(order)];
  const railRow = new Map(ids.map((id, index) => [id, index + 2] as const));

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

  return { railRow, wideAt768, railTracks: ids.length + 1 };
}
