'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Narrative } from '@/lib/utils/narrative';

/**
 * What each closed row of a composed page ANSWERS in the landscape index (since 2026-10-16,
 * DESIGN.md → The Closed-Row Rule): the row id → a short phrase with at most ONE figure, one the strip
 * and THE tile do not print (The Lifted-Figure Rule), or `null` where the row keeps its scope aside
 * (an empty state, a failed read, an inventory, a figure that would repeat another). Below the
 * landscape width the rows keep their scope; the answer shows in the index only (`CLOSED_ANSWER_CLASS`).
 *
 * A context and not a prop, so the page that owns the figures says them once, by row id, and every
 * tile that is a row picks its own (`Tile` and `ErrorNotice` know their `collapse.id`) — no prop
 * threaded through some sixty tile components.
 */
export type RowAnswerMap = Readonly<Record<string, Narrative | null | undefined>>;

const RowAnswersContext = createContext<RowAnswerMap>({});

/** The page's answers, around its composed grid; built by a pure function of the page's narrative module. */
export function RowAnswers({ value, children }: { value: RowAnswerMap; children: ReactNode }) {
  return <RowAnswersContext.Provider value={value}>{children}</RowAnswersContext.Provider>;
}

/** The answer of the row `id`, if its page gave one. */
export function useRowAnswer(id: string): Narrative | null {
  return useContext(RowAnswersContext)[id] ?? null;
}
