/**
 * The measures of the tablet composition (MOB-08, 2026-10-16), shared by `overview.tablet.spec.ts`
 * and `cashflow.tablet.spec.ts`: both run in the `tablet` (768×1024) and `tablet-landscape`
 * (1024×768) projects and branch on the width. Geometry only — what a row SAYS is the phone specs'
 * and Vitest's (`__tests__/tabletComposition.test.ts` holds where each row goes).
 *
 * A helper, not a spec: no project collects it (`testMatch`), it only exports.
 */

import { expect, type Locator, type Page } from '@playwright/test';

/** `gap-3` of the grid, and the 1px a subpixel layout may round either way. */
export const GAP = 12;
/** The closed row's trigger (`TileRowShell`, `min-h-[52px]`) and its section's 1px border top and bottom. */
export const TRIGGER_HEIGHT = 52;
export const BORDER = 2;
/** The house floor for a touch target (PRODUCT.md → Accessibility & Inclusion). */
export const TOUCH_FLOOR = 44;
/** The landscape bar: `py-1` + the 44px trigger + `border-b` (doc/guide/shell.md § Navigation). */
export const BAR_HEIGHT = 53;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

/** Whether this project is the landscape one: three columns, no pill. */
export const isLandscape = (page: Page): boolean => (page.viewportSize()?.width ?? 0) >= 992;

export async function rectOf(locator: Locator): Promise<Rect> {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
  });
}

/** The composed grid: the parent of THE tile's cell. */
export const gridOf = (page: Page, leadId: string): Locator => page.locator(`#${leadId}`).locator('xpath=../..');

/** The column count and rows template the browser computed for the grid, and its custom properties. */
export async function gridTracks(grid: Locator): Promise<{ columns: number; rows: string; beside: string; leadRows: string }> {
  return grid.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      columns: style.gridTemplateColumns.split(' ').filter(Boolean).length,
      rows: style.gridTemplateRows,
      beside: (el as HTMLElement).style.getPropertyValue('--beside'),
      leadRows: (el as HTMLElement).style.getPropertyValue('--lead-rows'),
    };
  });
}

/** Where the first screen ends: the pill's top edge at 768, `main`'s bottom edge at 1024 (no pill). */
export async function foldOf(page: Page): Promise<number> {
  if (!isLandscape(page)) {
    return page.locator('nav[aria-label="Navigazione principale"]').evaluate((el) => el.getBoundingClientRect().top);
  }
  return page.locator('#page-main').evaluate((el) => el.getBoundingClientRect().top + el.clientHeight);
}

/** The landscape bar as `page.evaluate` reads it: its height, `main`'s top and first screen, the trigger. */
export async function barGeometry(page: Page) {
  return page.evaluate(() => {
    const trigger = document.querySelector<HTMLElement>('[data-sidebar="trigger"]');
    const main = document.getElementById('page-main')!;
    const bar = trigger?.parentElement ?? null;
    const visible = !!bar && bar.getBoundingClientRect().height > 0;
    const triggerRect = trigger?.getBoundingClientRect();
    return {
      visible,
      barHeight: visible ? bar!.getBoundingClientRect().height : 0,
      mainTop: main.getBoundingClientRect().top,
      mainClientHeight: main.clientHeight,
      trigger: triggerRect ? { width: triggerRect.width, height: triggerRect.height } : null,
    };
  });
}

/** Nothing in `main` runs past its right edge (the guard of `e2e/fire.mobile.spec.ts`; AGENTS.md § Tailwind). */
export async function expectNoOverflow(page: Page): Promise<void> {
  const measurement = await page.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) throw new Error('no <main> in the dashboard shell');
    const limit = main.getBoundingClientRect().left + main.clientWidth;
    const offenders = Array.from(main.querySelectorAll('*'))
      .filter((el) => !el.closest('.sr-only') && !el.closest('.overflow-x-auto'))
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        return (rect.width > 0 || rect.height > 0) && rect.right > limit + 1;
      })
      .map((el) => `<${el.tagName.toLowerCase()} class="${el.getAttribute('class') ?? ''}">`)
      .slice(0, 5);
    return { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth, offenders };
  });
  expect(measurement.offenders, `elements past main's right edge (${measurement.clientWidth}px)`).toEqual([]);
  expect(measurement.scrollWidth).toBe(measurement.clientWidth);
}


/** The rail's width at 1024 (`COMPACT_GRID_CLASS`: `grid-cols-[minmax(0,1fr)_360px]`). */
export const RAIL_WIDTH = 360;

/**
 * At 1024, the rail beside THE tile: «Il resto della pagina» and then EVERY row, in DOM order, in
 * a 360px column right of THE tile, 12px apart, a closed one as tall as its trigger plus the border
 * — the flexible track took THE tile's height, so nothing drifts apart.
 */
export async function expectRail(page: Page, lead: Locator, rest: Locator, ids: readonly string[]): Promise<void> {
  const theTile = await rectOf(lead);
  let previous = await rectOf(rest);
  expect(previous.x, 'Il resto della pagina, in the rail').toBeGreaterThanOrEqual(theTile.right);
  expect(previous.y, 'Il resto della pagina, on the first track').toBeLessThanOrEqual(theTile.y + 1);
  for (const id of ids) {
    const [section, trigger, expanded] = await Promise.all([
      rectOf(page.locator(`#${id}`)),
      rectOf(page.locator(`#${id}-trigger`)),
      page.locator(`#${id}-trigger`).getAttribute('aria-expanded'),
    ]);
    expect(section.x, `${id} in the rail`).toBeGreaterThanOrEqual(theTile.right);
    expect(Math.abs(section.width - RAIL_WIDTH), `${id}: the rail's width`).toBeLessThanOrEqual(1);
    expect(Math.abs(section.y - previous.bottom - GAP), `${id}: ${GAP}px under the one before`).toBeLessThanOrEqual(1);
    if (expanded === 'false') {
      expect(Math.abs(trigger.height - TRIGGER_HEIGHT), `${id}: the trigger`).toBeLessThanOrEqual(1);
      expect(Math.abs(section.height - trigger.height - BORDER), `${id}: the trigger plus the border`).toBeLessThanOrEqual(1);
    }
    previous = section;
  }
}

export interface OpenedRow {
  /** The row's box before the tap, and `main`'s scroll then. */
  before: Rect;
  scrollTop: number;
}

/** Taps a row's trigger and waits for it to open; returns where it stood. */
export async function openRow(page: Page, id: string): Promise<OpenedRow> {
  const [before, scrollTop] = await Promise.all([
    rectOf(page.locator(`#${id}`)),
    page.locator('#page-main').evaluate((main) => main.scrollTop),
  ]);
  await page.locator(`#${id}-trigger`).click();
  await expect(page.locator(`#${id}-trigger`)).toHaveAttribute('aria-expanded', 'true');
  return { before, scrollTop };
}

/**
 * An opened row. At 1024 it opens IN PLACE: the same left edge, top and width in the rail, nothing
 * scrolled, the rows after it in the DOM still in the rail and under it (the owner's ask, decision
 * 104). At 768 it spans the grid under the row before it, the rows after it under it.
 */
export async function expectOpenedRow(
  page: Page,
  grid: Locator,
  opened: string,
  where: OpenedRow,
  before: string,
  after: readonly string[],
): Promise<void> {
  const [gridRect, row, previous, scrollTop] = await Promise.all([
    rectOf(grid),
    rectOf(page.locator(`#${opened}`)),
    rectOf(page.locator(`#${before}`)),
    page.locator('#page-main').evaluate((main) => main.scrollTop),
  ]);
  if (isLandscape(page)) {
    expect(Math.abs(row.x - where.before.x), 'the open row did not leave the rail').toBeLessThanOrEqual(1);
    expect(Math.abs(row.y - where.before.y), 'the open row did not move').toBeLessThanOrEqual(1);
    expect(Math.abs(row.width - RAIL_WIDTH), 'the open row keeps the rail\'s width').toBeLessThanOrEqual(1);
    expect(scrollTop, 'nothing scrolled').toBe(where.scrollTop);
  } else {
    expect(Math.abs(row.width - gridRect.width), 'the open row spans the grid').toBeLessThanOrEqual(1);
    expect(row.y, 'the open row starts under the row before it').toBeGreaterThanOrEqual(previous.bottom);
  }
  for (const id of after) {
    const next = await rectOf(page.locator(`#${id}`));
    expect(next.y, `${id}, after it in the DOM, under it`).toBeGreaterThanOrEqual(row.bottom);
    if (isLandscape(page)) expect(Math.abs(next.x - row.x), `${id}, still in the rail`).toBeLessThanOrEqual(1);
  }
}

/**
 * At 768 no grid row is half empty: every row either shares its top with another (two side by side)
 * or spans the grid — a closed row left alone, before an open one or at the end, takes the row.
 */
export async function expectNoHalfCells(page: Page, grid: Locator, ids: readonly string[]): Promise<void> {
  const gridRect = await rectOf(grid);
  const rects = await Promise.all(ids.map((id) => rectOf(page.locator(`#${id}`))));
  rects.forEach((rect, index) => {
    const paired = rects.some((other, j) => j !== index && Math.abs(other.y - rect.y) <= 1);
    const whole = Math.abs(rect.width - gridRect.width) <= 1;
    expect(paired || whole, `${ids[index]}: alone on half a grid row`).toBe(true);
  });
}
