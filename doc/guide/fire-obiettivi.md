# FIRE › Obiettivi

> **When to open this guide** — you are touching `components/fire-simulations/GoalBasedInvestingTab.tsx`, `components/goals/*` (`tiles/*`, `GoalsDettaglio`, the chart, the two dialogs, `goalVerdictMeta`), `lib/utils/{goalsSummary,goalsNarrative}.ts`, or the math underneath (`lib/utils/{goalTrajectory,goalMath}.ts`, `lib/services/goalService.ts`). The page-wide rules — the pension unlock, `respectPensionLockInFire`, the bridge model, the config-first collapse, the Ventaglio engine, `deriveMonteCarloAllocation`, the goal math — live in `doc/guide/fire.md § FIRE, What If and Goals` and are not repeated here. In `AGENTS.md` only the stub with the essentials remains (§ FIRE, What If and Goals); modules and files: `doc/guide/fire.md` § *Files*. The Assistant's side of goals — `goalProposal.ts`, `POST /api/goals` — is in `doc/guide/assistente.md`. No Playwright spec covers this tab.

## FIRE › Obiettivi — a verdict over tiles (`components/fire-simulations/GoalBasedInvestingTab.tsx`, `components/goals/tiles/*`, `lib/utils/{goalsSummary,goalsNarrative}.ts`)

- The tab answers «sono in rotta?» and computes nothing: `computeGoalTrajectory` (per goal, ONE `now` per mount) and `calculateGoalProgress` run as
  before, `goalsSummary.ts` chooses what each tile shows (`summarizeGoals` in urgency order with the counts and the assigned share, `summarizeTrajectory`
  with the chart's series, `buildMilestones`, `summarizeDerivedAllocation` over `deriveTargetAllocationFromGoals`, `summarizeAssignments` closed by the
  free shares), `goalsNarrative.ts` puts it into words. The verdict per goal is the trajectory's own (projected value at the deadline against the target,
  1% tolerance); the headline judges the DATED goals only (`counts.dated`) — every one in time positive, some late warning, all late negative, nothing to
  judge neutral — and the sentence gives every goal its clause, the late ones with the EXTRA pace (`required − planned`, the whole pace when nothing is planned).
- **Dates are `{ year, month }`** (`goalDateFromIso` reads the ISO string, never a `Date`): a deadline typed as «2029-06-30» stays in June whatever
  timezone renders it. `monthsBetween` still ceils on 30.44-day months, so «giugno 2029» from 2026-08-26 is 35 months, not 34 — derive a test
  expectation from the function, never by hand (the first cut of the tests lost ten assertions to that and to Intl's ungrouped four-digit amounts, «1531 €»).
- **The selection is a row** (`selectedGoalId`, falling back to the most urgent, following a deletion, session-only); the Traiettoria's actions (Modifica,
  Elimina through `useArmedDelete`, the disarm announced by a `role="status"` span) sit in its aside — the Scheda's ghost buttons from `desktop:`, 44px
  targets below. In demo the aside says «non modificabile in demo» and the Assegnazioni footer «In demo le quote non si modificano».
- **The goal's hex is identity** (dot, track, milestone, projection, the Panoramica's ObiettivoTile); the classes of Allocazione derivata take
  `ASSET_CLASS_CHART_INDEX` through `useChartColors` — the deleted `AllocationComparisonBar` carried a map of its own. Its «assigned» bar aggregates
  every goal's quotas by euro (reached included) while the derived target excludes the reached goals: the footer says the reached do not weigh.
- **The free shares are the residual**: `summarizeAssignments` lists an instrument with more than 0,5% and 0,50 € free, sums `freeTotal` over EVERY
  instrument so the «Non assegnato» row adds up, and names an instrument assigned past 100% in the footer's warning tone (the amber card is gone). Orphaned
  quotas are skipped as `goalMath` does; the tab still runs `cleanOrphanedAssignments` before every write, and every write rewrites the document whole.
- **The Milestone never shows a deadline as an arrival**: a late goal keeps its projected month with «15 mesi dopo la scadenza di giugno 2029» under it, a goal
  the pace never reaches reads «mai, al ritmo attuale», an open goal is not listed. The old timeline fell back to the target date and called it a milestone.
- Playwright locates the tiles by `role=region` + `aria-label` («Obiettivi», «Milestone», «Allocazione derivata», «Assegnazioni» — pass `exact: true`,
  «Obiettivi» is a prefix of the list's name; the Traiettoria by `/^Traiettoria di /`), the verdict by «Verdetto sugli obiettivi», the rows by the list
  «Obiettivi in ordine di urgenza» (buttons named «{name}, {chip}», `aria-current` on the selected), the residual by the rowheader «Non assegnato», the
  disclosure by `/^Dettaglio/`, the split by the list «Ripartizione del versamento». The base account has no goals: a spec plants its own fixture
  (`goalBasedInvesting/{uid}` + the two settings flags with `merge: true`) and removes it.

## Composizione mobile

Composed on 2026-10-15 (MOB-07, retired on 2026-10-16 — its text is in `git log -- doc/mobile/`): the page-wide rules — one controller per tab, the cut at the first full stop — are in `doc/guide/fire.md` § Composizione mobile. **No strip** (decision 47) and no cut: the verdict is whole on every width.

- **THE tile**: Obiettivi (`goals` tab), first in the DOM at every width, open and never a row; it has no curve. **Off, or without a goal**: one tile, no row, no `PageRest` (the base fixture is off; the census fixture is on with one invented goal since 2026-10-15 (MOB-07), doc/mobile/README.md § 9, 60).
- **The rows and their aside, in DOM order** (`GOALS_SECTIONS` in the tab, ids `GOALS_SECTION_IDS` in `goalsSummary.ts`, the words `GOALS_CLOSED_ASIDES` in `goalsNarrative.ts`; `resolveGoalsSections` hands the controller the rows present): `goals-traiettoria` the goal's name (the open aside holds the two actions, controls: they open the panel's first row) · `goals-milestone` «al ritmo attuale» · `goals-allocazione` «gap × priorità» (present with goal-driven targets only) · `goals-assegnazioni` the counts (`describeAssegnazioniAside`: «3 strumenti · 2 quote» — counts, never a figure). `PageRest` right after Obiettivi' cell; the Dettaglio after the rows; no `order-*`.
- **Choosing a goal opens the Traiettoria row where it is** (`collapse('goals-traiettoria')?.onOpenChange(true)` from `onSelect`): no scroll and no focus move — the list is where the reader is; `reveal` stays the strip cells' gesture, and this tab has none.
- **768/1024 and the specs**: since 2026-10-16 (MOB-08, `lib/utils/tabletComposition.ts`; doc/mobile/README.md § 9, 104) the tablet's composition with goals — at 768 two columns: Obiettivi on both, «Il resto» on a row of its own, the rows two by two (Traiettoria only with a goal selected, Allocazione derivata only with goal-driven targets), an open row and a closed one left alone whole; at 1024 Obiettivi on the left and the 360px rail with the rows, each opening in place — choosing a goal opens the Traiettoria where it stands. Without goals, or with the feature off, the grid of before. `e2e/fire.mobile.spec.ts` (`mobile`, base account: the «disattivato» branch — one tile, no `PageRest`, no trigger). The tab has no spec of its own.

## Per-page blind spots

- **FIRE › Obiettivi**: no Playwright spec of its own (its «disattivato» branch in `fire.mobile.spec.ts`); ONE `now` per mount; with three goals the Obiettivi tile leaves air under the rows; a goal past its deadline gets no pace; free shares under 0,5% / 0,50 € are not listed; the selection is session-only; the «assigned» bar counts the reached goals, the derived target does not; the two dialogs keep their old chrome and two pre-existing `react-hooks` errors.
