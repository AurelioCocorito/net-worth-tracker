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
- **A property is worth to a goal its value NET of the loans that finance it, a loan nothing** (owner, 2026-10-20;
  `lib/utils/goalAssetValue.ts`, wrapped by `goalMath.goalAssetValueOf`): until then the «Quota libera» row printed the
  home GROSS of its mortgage while the «Non assegnato» total already netted the loan's negative value — a row and a total
  that did not add up. Every reader takes the ONE value: `calculateGoalProgress`, `getUnassignedValue`,
  `summarizeAssignments` (a loan is no row and no count), `sumAssetValues`, the Panoramica's `rankGoalProgress`, the
  assignment dialog (which no longer offers a loan), the assistant's «libero». Real estate stays assignable.
- **The free shares are the residual**: `summarizeAssignments` lists an instrument with more than 0,5% and 0,50 € free, sums `freeTotal` over EVERY
  instrument so the «Non assegnato» row adds up, and names an instrument assigned past 100% in the footer's warning tone (the amber card is gone). Orphaned
  quotas are skipped as `goalMath` does; the tab still runs `cleanOrphanedAssignments` before every write, and every write rewrites the document whole.
- **A quota is in PERCENT or in QUOTE** (owner, 2026-10-17; doc/guide/fire.md § FIRE, What If and Goals for the union and `assignmentFraction`; the
  primitive lib/utils/assetSlice.ts): the Assegnazioni rows print a units quota as its units first and its derived percent after («12 quote · 40%»,
  `AssignmentRow.units`/`unitLabel`; euro for an account or a property, whose value lives in `quantity` at price 1), a percent quota as before. The
  dialog (`AssetAssignmentDialog`): pick the instrument, then ONE row with the % | quote switch (`SegmentedPill`, `semantics="radio"`; the figure
  follows the switch, «40%» ↔ «40 quote») and the field, and under it the instrument's split as a computed list — the other goals' quotas each in
  the form it was typed, this one, and «Non assegnate» as the REST, never typed; a total past the instrument reads «Oltre il posseduto» in red and
  «Assegna» lands a refusal in the reading line (`describeModalStatus`, The Status-Is-The-Reading Rule), never a save. A units quota a SALE outgrew
  (the quantity fell below the units, which stay as typed) is declared by the footer in units — «VWCE ha 120 quote assegnate su 100 quote: quote da
  riassegnare.» (`overAssigned[].inUnits`) — and by the landscape answer «quote oltre il 100%»; the group's value is what the quota holds today, never
  rescaled. `goals` is a prop of the dialog since then (the names of the other quotas).
- **The Milestone never shows a deadline as an arrival**: a late goal keeps its projected month with «15 mesi dopo la scadenza di giugno 2029» under it, a goal
  the pace never reaches reads «mai, al ritmo attuale», an open goal is not listed. The old timeline fell back to the target date and called it a milestone.
- Playwright locates the tiles by `role=region` + `aria-label` («Obiettivi», «Milestone», «Allocazione derivata», «Assegnazioni» — pass `exact: true`,
  «Obiettivi» is a prefix of the list's name; the Traiettoria by `/^Traiettoria di /`), the verdict by «Verdetto sugli obiettivi», the rows by the list
  «Obiettivi in ordine di urgenza» (buttons named «{name}, {chip}», `aria-current` on the selected), the residual by the rowheader «Non assegnato», the
  disclosure by `/^Dettaglio/`, the split by the list «Ripartizione del versamento». The base account has no goals: a spec plants its own fixture
  (`goalBasedInvesting/{uid}` + the two settings flags with `merge: true`) and removes it.

## Composizione mobile

Composed on 2026-10-15 (its spec, retired on 2026-10-16, is in `git log -- doc/mobile/`): the page-wide rules — one controller per tab, the cut at the first full stop — are in `doc/guide/fire.md` § Composizione mobile. **No strip** (2026-10-10) and no cut: the verdict is whole on every width. The rules are DESIGN.md's (§ 5 → Small-Screen Composition: The First-Screen, Lifted-Figure, Closed-Row and Binding-Clause Rules); here is what this tab does with them.

- **THE tile**: Obiettivi (`goals` tab), first in the DOM at every width, open and never a row; it has no curve. Off, or without a goal, it is the one tile (see Absences).
- **The strip**: none, by design since 2026-10-10 (`GoalBasedInvestingTab.tsx`, `goalsSummary.ts`): the tab has no `select*Strip` and its `PageVerdict` takes no `strip`; the verdict is whole, so `reveal`, the cells' gesture, has no caller here.
- **Lifted blocks**: none — with no strip and no cut nothing is printed before the tiles, so nothing is lifted; the tab passes no `liftedFigures`.
- **The rows and their aside, in DOM order** (`GOALS_SECTIONS` in the tab, ids `GOALS_SECTION_IDS` in `goalsSummary.ts`, the words `GOALS_CLOSED_ASIDES` in `goalsNarrative.ts`; `resolveGoalsSections` hands the controller the rows present): `goals-traiettoria` the goal's name (the open aside holds the two actions, controls: they open the panel's first row) · `goals-milestone` «al ritmo attuale» · `goals-allocazione` «gap × priorità» (present with goal-driven targets only) · `goals-assegnazioni` the counts (`describeAssegnazioniAside`: «3 strumenti · 2 quote» — counts, never a figure). `PageRest` right after Obiettivi' cell; the Dettaglio after the rows; no `order-*`.
- **Choosing a goal opens the Traiettoria row where it is** (`collapse('goals-traiettoria')?.onOpenChange(true)` from `onSelect`): no scroll and no focus move — the list is where the reader is; `reveal` stays the strip cells' gesture, and this tab has none.
- **`binding` clauses and the `scope`**: none. `buildGoalsVerdict` sets no `leadLength` and marks no segment `binding` — the verdict is whole at every width; the tab passes no `scope` (no lock line, unlike the four other tabs) and no `restCollapse`, so there is no «Il perché».
- **Absences**: a failed read (settings, assets or the goals) is the whole tab's `ErrorNotice`, decided before the wait (`resolveSurfaceState` in `GoalBasedInvestingTab.tsx`); the wait is the tab's `TileGridSkeleton` (`GOALS_TAB_SKELETON_CELLS`). **Off, or without a goal**: one tile, no row, no `PageRest` (the base fixture is off; the census fixture is on with one invented goal since 2026-10-15, doc/guide/prima-schermata.md). Off, the verdict is «Gli obiettivi non sono attivi.» over a tile that links to «Abilita nelle Impostazioni»; on without a goal, «Nessun obiettivo ancora.» over Obiettivi with its empty copy and «Nuovo obiettivo».
- **The memory**: `mobile-sections:fire-simulations:goals` (`useMobileSections({ route: 'fire-simulations', tab: 'goals', … })`) — per device and browser, not per account; absent or unreadable → the tab's defaults: no `defaultOpen`, so every row present starts closed. Off or without a goal the controller is handed `NO_SECTIONS` (`resolveGoalsSections`), so the memory has nothing to open; below `desktop:` choosing a goal writes `goals-traiettoria` open, as a tap on its trigger does.
- **768 and the landscape stage** (since 2026-10-16; `lib/utils/tabletComposition.ts`; DESIGN.md → The First-Screen and Closed-Row Rules, doc/guide/shell.md § The landscape stage — the tablet's spec, retired on 2026-10-16, is in `git log -- doc/mobile/`), with goals: at 768 two columns — Obiettivi on both, «Il resto» on a row of its own, the rows two by two (Traiettoria only with a goal selected, Allocazione derivata only with goal-driven targets), an open row and a closed one left alone whole. **On a tablet in landscape** (a content box ≥ 880px below 1440) the tab is the STAGE of `doc/guide/fire.md` § Composizione mobile: the whole verdict and Obiettivi on the left (sticky when they fit; Obiettivi has no curve), the 360px INDEX on the right with «Il resto» and the rows, each opening in place — choosing a goal opens the Traiettoria where it stands. With the feature off, one tile (an early return); on with no goal, the grid of before: `PLAIN_GRID_CLASS`, and THE tile through `leadCellClass(hasGoals)`.
- **A defect fixed on 2026-10-16** (one of the tablet's three runtime defects of that day): Obiettivi on with no goal kept the bare `LEAD_CELL_CLASS` on the plain grid, whose landscape classes still answer the stage's container — the tile sat in the left column with the right one empty. Now `leadCellClass(composed)`; `__tests__/tabletComposition.test.ts` holds every grid file that holds `PLAIN_GRID_CLASS` to `leadCellClass(`, never a bare `LEAD_CELL_CLASS`.
- **The closed rows answer in the index** (DESIGN.md → The Closed-Row Rule, landscape only, since 2026-10-16; `describeGoalsClosedAnswers({ trajectory, goalCount, milestones, derivedAllocation, assignments })` in `goalsNarrative.ts`, through `RowAnswers`; the tab has no strip):
  - Traiettoria: «previsto {€}» (the hero's value at the deadline) with one goal, «{goal} {€}» with more, only when name and figure fit 22 characters; null without a target, reached, past the deadline or undated.
  - Milestone: «in ritardo di {N} mese/mesi» (the first late dated goal); null when every dated goal is in time.
  - Allocazione derivata: «{class} {%}» (the class the goals ask most); null without the view or a positive share.
  - Assegnazioni: «quote oltre il 100%» with an instrument past 100%, «tutto assegnato» when the free total prints as zero, else «liberi {€}» — never null.
- **The specs**: `e2e/fire.mobile.spec.ts` (`mobile`, base account: the «disattivato» branch — one tile, no `PageRest`, no trigger). The tab has no spec of its own. Vitest: `__tests__/goalsNarrative.test.ts` (`buildGoalsVerdict`, `describeGoalsClosedAnswers`), `__tests__/tabletComposition.test.ts` (Obiettivi through `leadCellClass` beside the plain grid).

## Per-page blind spots

- **FIRE › Obiettivi**: no Playwright spec of its own (its «disattivato» branch in `fire.mobile.spec.ts`); ONE `now` per mount; with three goals the Obiettivi tile leaves air under the rows; a goal past its deadline gets no pace; free shares under 0,5% / 0,50 € are not listed; the selection is session-only; the «assigned» bar counts the reached goals, the derived target does not; the goal form keeps its old chrome; **a units quota on a foreign-currency account is euro of its NATIVE balance** (the quantity is the balance in that currency: «1.200 USD», `sliceUnit`), its value converted like the account's; the «N% libero» of the dialog's list rounds past float noise (`getAvailablePercentage` to six decimals) so «Esaurito» is an exact zero; the census fixture's two quotas stay in percent (no first-screen change).
