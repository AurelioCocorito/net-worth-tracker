# FIRE › What If

> **When to open this guide** — you are touching `components/fire-simulations/WhatIfAnalysisTab.tsx`, `components/fire-simulations/whatif/*` (`tiles/*`, `WhatIfProjectionChart`, `incomeSelection.ts`), `lib/utils/{whatIfSummary,whatIfNarrative}.ts`, `lib/services/whatIfService.ts` or `types/whatIf.ts`. The page-wide rules — the pension unlock, `respectPensionLockInFire`, the bridge model, the config-first collapse, the Ventaglio engine, `deriveMonteCarloAllocation`, the goal math — live in `doc/guide/fire.md § FIRE, What If and Goals` and are not repeated here. In `AGENTS.md` only the stub with the essentials remains (§ FIRE, What If and Goals); modules and files: `doc/guide/fire.md` § *Files*. No Playwright spec covers this tab.

## FIRE › What If — a verdict over tiles (`components/fire-simulations/WhatIfAnalysisTab.tsx`, `components/fire-simulations/whatif/*`, `lib/utils/{whatIfSummary,whatIfNarrative}.ts`)

- The tab answers «cosa cambia se…?» and computes nothing: `calculateWhatIfImpact` (service) perturbs and diffs, `whatIfSummary.ts`
  turns the impact into the event as stated, the before/after pairs, the merged series, the divergence and the sensitivity reading,
  `whatIfNarrative.ts` puts them into words (the DOM ids of the phone composition in the summary, § Composizione mobile). The service now RETURNS the two base-scenario walks it runs (`projections`), so the
  chart draws the series the years were read from — never a third walk in a component. The job-loss decomposition (retained income
  covers the expenses first, the portfolio pays the uncovered part) is `decomposeJobLossHit`, out of the component.
- **The headline and the tone come from the delta in years** (`timelineCase`: keeps · loses · gains · neverBoth · leaves · returns ·
  same · moves), shared by the verdict and the Prima e dopo reading; a `yearsToFIRE` of 0 means reached, null means beyond the
  50-year horizon (`WHAT_IF_HORIZON_YEARS`, the Calcolatore's). **Only the deltas carry a sign** (`signedAmount`), by the direction
  that is good for the row (`buildDeltaRows`: net worth and income higherBetter, FIRE number, Coast number and gap lowerBetter);
  a change under half a unit is «invariato», never «+0 €». **An empty perturbation** (`WhatIfEvent.isEmpty`: no months or no lost
  income, a lump sum of 0, both cashflow deltas 0) gets «Nessun evento da simulare.» with today's plan, not a zero delta.
- **The baseline carries the honest inputs** (2026-09-24, `WhatIfBaseline.honest`, built like the Calcolatore's: the tax profile of the
  FIRE-eligible assets minus the locked funds, the Coast pensions dated by the saved age): both sides of every event read
  `resolveFireRequirement` and the walk with `honest`, so «prima» agrees with the Calcolatore's number. The basis MOVES with the event
  (`honestFor`): money that arrives — a windfall — is basis, money that leaves — a purchase, the months without income — is sold at the
  portfolio's own gain share, so the basis shrinks in proportion. Pinned: a 50k windfall on 200k/100k lowers the number (1/(1−0,104)), a 50k
  purchase keeps it (still half gain).
- **The event clause is household-agnostic**: months, the lost amount and its share of expenses + savings (`lostShareOfIncomePct`,
  null when the household earns nothing, and the clause drops). The names of the sources live only in the Evento tile's picker.
- **The Prima e dopo tile has no hero on purpose** (the canvas's proposal): the year is the verdict's headline and the Delta's first
  row. Its one figure is the divergence — the phone's second cell, § Composizione mobile — — both capitals at the FIRE year of the plan of today (`summarizeDivergence`; the
  after-event year when today's never gets there; null when neither does or the target is already reached), read from the merged
  series (`buildWhatIfComparisonSeries`: the union of the years, null where a walk stops — a walk ends five years after its last
  scenario reaches FIRE, so a purchase lengthens the after side and `connectNulls={false}` leaves the gap). The plan of today is
  `--muted-foreground` (a baseline is neutral), the plan after the event `--chart-1`; the before target is drawn only when the
  event moves the FIRE number (`targetsDiffer`). Reference lines mark the two FIRE years, none for a side reached today.
- **The Sensibilità matrix runs on the plan of TODAY**, centred on the actual or the typed reference expenses, never on the event —
  the aside says «piano di oggi», the footer says why. Cells: the baseline outlined (`border-foreground`), better `bg-positive/15`,
  worse `bg-destructive/15` — the sign tokens, not chart slots. Below `desktop:` it is one block per expense level with the savings
  cells in two columns (a cardified matrix needs its own labels). `summarizeSensitivity` reads the −10% row at the baseline column
  and the column right after the baseline (`+25%`, or `€5k` on the zero-savings fallback, whose label starts without `+`).
- **Every Delta row is `flex-wrap`**: «Raggiunto → Raggiunto» in a 3-column tile drops under the label, right-aligned, instead of
  splitting «Numero Coast oggi» over three lines (the Per classe row's rule).
- Playwright locates the tiles by `role=region` + `aria-label` («Prima e dopo l'evento», «Delta dell'evento», «Evento simulato»,
  «Sensibilità degli anni al FIRE»), the verdict by «Verdetto sul What If» (its sentence is the `p` under the heading — the region's
  text starts with the headline), the event switch by `role=group` «Tipo di evento» (`aria-pressed` buttons), the rows by the lists
  «Prima e dopo per il FIRE» / «…per il Coast FIRE», the picker by «Fonti di reddito», the matrix by its `table` (1440) or the
  list «Anni al FIRE per livello di spesa» (390). On the base account the target is REACHED (small expenses), so a spec asserts the
  headline against the set of live phrasings and the deltas against a typed amount, never a year.

## Composizione mobile

Composed on 2026-10-15 (MOB-07, retired on 2026-10-16 — its text is in `git log -- doc/mobile/`): the page-wide rules — one controller per tab, the lock as the scope line, the cut at the first full stop — are in `doc/guide/fire.md` § Composizione mobile.

- **THE tile is the Evento** (decision 43): **first in the DOM at every width since 2026-10-15** — the left cell of the first row at 1440 (Evento 4 | Prima e dopo 5 | Delta 3, then Sensibilità 12; until then Prima e dopo 5 | Delta 3 | Evento 4 with `order-1` on a phone) — open and never a row. The Input Tile Rule's desktop sentence is MOB-09's to rewrite. It has no curve: the first closed row ends under the pill at 390, registered `false` with `raisedBy: "MOB-07: Evento è un modulo"` (decision 19).
- **The strip** (`selectWhatIfStrip({ event, summary, divergence })`, `lib/utils/whatIfSummary.ts`): «Patrimonio FIRE scende|sale» → `Math.abs(netWorth.delta)` (`currency`, `tone` from the sign; «Patrimonio FIRE oggi», neutral, when the delta is under the threshold — owner, 2026-10-16: until then «sale» stood over «invariato», a word no sentence printed) → opens `whatif-delta`; «Distanza|Vantaggio nel {anno}» → `Math.abs(gapThen)` of the divergence (`currency`, `tone` from the sign; «Al FIRE di oggi» as the label of a `null` cell) → opens `whatif-prima-dopo`. The direction words are the sentences' own («scende», «di distanza allora», «di vantaggio»): the builders write no «+»/«−». A change under the threshold, or no divergence, is a `null` cell «invariato» — `isWhatIfChange(delta, unit = 0.5)`, exported from `whatIfSummary.ts` and the ONE threshold of the verdict's clauses, the Delta rows and the cells (`whatIfNarrative.ts` imports it in place of its private `changed`). `[]` on an empty event. Identity in `__tests__/whatIfNarrative.test.ts`.
- **The cut** (`buildWhatIfVerdict`): the event and its clauses under the title; the Coast sentence and the bridge note behind «Il perché · il Coast FIRE» (« e il fondo pensione» with the bridge; «il fondo pensione» alone); without an event «Il piano resta quello di oggi: FIRE nel 2033.» under the title and «Scegli un evento e inserisci un importo.» behind «Il perché · come simulare»; «What If non calcolabile» is one sentence. The scope line is passed only with `summary.isBridge` — the bridge note (`BRIDGE_NOTE`) and the line always come together.
- **The rows and their aside, in DOM order** (`WHAT_IF_SECTIONS` in the tab, ids `WHAT_IF_SECTION_IDS` in `whatIfSummary.ts`, the words `WHAT_IF_CLOSED_ASIDES` in `whatIfNarrative.ts`): `whatif-prima-dopo` «le due traiettorie» (the open aside «scenario base · crescita 7% · inflazione 2,5%» carries figures) · `whatif-delta` «prima → dopo» · `whatif-sensibilita` «spese e risparmio» (the open aside is the reference-expenses field, a control: it opens the panel's first row). `PageRest` right after the Evento's cell. Without a base there is no row, no `PageRest`, and the controller knows none (`NO_SECTIONS`, since 2026-10-16); with an empty event the rows are there and the strip is empty. Prima e dopo's chart is in the tab's chunk (PERF-04): it mounts on the row's first opening without a download.
- **768/1024 and the specs**: since 2026-10-16 (MOB-08, `lib/utils/tabletComposition.ts`; doc/mobile/README.md § 9, 104) the tablet's composition — at 768 two columns: Evento on both, «Il resto» on a row of its own, Prima e dopo beside Delta and Sensibilità, alone, on the whole row, an open row whole; at 1024 Evento on the left and the 360px rail with «Il resto» and the three rows, each opening in place. At 768 the first closed row ends 113px under the pill on the fixture — Evento has no curve (103); at 1024 it is above `main`'s bottom. `e2e/fire.mobile.spec.ts` (`mobile`: the Evento first in the DOM and first on screen with no `order-*` in `main` — seen red with `order-1` back on the Evento, 2026-10-16 —, the three rows closed), `e2e/fire.spec.ts` (1440: the Evento the left cell of the first row, first in the DOM). The tab has no spec of its own.

## Per-page blind spots

- **FIRE › What If**: no Playwright spec of its own (its composition in `fire{,.mobile}.spec.ts`); every event is a year-0 perturbation, nothing persisted; the Coast block reads the SAVED age and pensions (no age → no block); the job-loss picker seeds from `laborIncomeCategoryIds` once per mount; the «Prima e dopo» walk of today stops five years after its last scenario reaches FIRE (a gap after a big purchase, by design); with the bridge on the FIRE numbers are bridge numbers while the chart reads `baseNetWorth`; the Sensibilità reference expenses are session-only; `isPrimaryResidence` is informational.
