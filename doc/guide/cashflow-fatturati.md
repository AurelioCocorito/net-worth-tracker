# Cashflow › Fatturati

> **Quando aprire questa guida** — chi tocca `components/cashflow/Revenue*.tsx`, `lib/utils/revenue*.ts`,
> `lib/services/revenueService.ts` o la collezione `revenueEntries`.

«Quanto fatturo, e in quali mesi?» — what was INVOICED by month of competence, not what reached the account.
Added on 2026-10-25 at the owner's request: a self-employed professional with several clients, who keeps the
figures in a spreadsheet and wants, over the years, the strongest months and what a month usually invoices.

## Files

- `types/revenue.ts` — `RevenueEntry` (`month` `YYYY-MM`, `client`, `amount`, `note`), `RevenueEntryInput`
- `lib/services/revenueService.ts` — read, upsert, edit-that-moves, batch import, delete
- `lib/utils/revenueStats.ts` — `summarizeRevenue`, `summarizeRevenueClients`, `revenueEntryId`, `revenueClientKey`, `median`
- `lib/utils/revenueNarrative.ts` — the verdict and the tiles' readings
- `lib/utils/revenueImport.ts` — `parseRevenueCsv`, `parseRevenueMonth`, `parseRevenueAmount`, the template
- `lib/hooks/useRevenueEntries.ts` — `queryKeys.revenue.all(ownerId)`, not persisted
- `components/cashflow/{RevenueTab,RevenueEntryDialog,RevenueImportDialog}.tsx`
- `firestore.rules` → `match /revenueEntries/{entryId}` (owner or delegated member, `userId` immutable)
- Tests: `__tests__/revenueStats.test.ts`, `__tests__/revenueImport.test.ts`

## Rules

- **A register of its own, never an expense row.** The cash a client pays is already an «Entrata» in Tracciamento;
  a second row for the same work would count it twice in every cashflow total. Nothing outside this tab reads
  `revenueEntries` (the assistant, the emails and Panoramica do not).
- **One document per (owner, month, client)**: the id is derived (`revenueEntryId`, the client slugged through
  `revenueClientKey`, so case and spacing never make two clients). The form's «Salva» and the CSV import are the
  same upsert: a file imported twice replaces its figures. Two rows of one file for the same pair are SUMMED
  (two invoices to one clinic in a month). An edit that changes month or client deletes the old document in the
  same batch (`updateRevenueEntry`). The form warns before an overwrite; the import preview counts them.
- **The client is optional**: '' is the month's total recorded as one figure («Senza datore», listed last).
- **An unrecorded month is not a zero** (DESIGN.md → The Absence-Has-Three-Names Rule): `null` in the grid, out of
  every statistic. A recorded 0 is a measured zero and counts.
- **The measures**: per calendar month the MEDIAN across the years (robust to one odd year), the mean beside it,
  min and max with their year; the SHARE OF THE YEAR measured on complete years only (twelve months recorded) — the
  reading of seasonality that a growing revenue does not distort. The verdict says that with one or two years the
  median is the mean. The year-to-date comparison stops at the latest recorded month of the latest year, in both years.
- **Stagionalità** (2026-10-25): each bar is coloured by band — the measured months ranked by median and cut in
  thirds (`revenueMonthTiers`: with twelve, the four weakest `--destructive`, the four in the middle `--chart-3`,
  the four strongest `--positive`, a legend under the plot); no band under three measured months or when all are
  alike. The pointer, or a TAP on a phone (`useChartHover(12, 'slot', { tap: true })`, DESIGN.md → The Hover
  Reading Rule), opens the month's tip (`describeRevenueMonthTip`): the median, then the mean, the lowest and the
  highest year, the share of the year; with one year it names the year and nothing else.
- **The client filter** (the Select beside the verdict, or a row of «Per datore») narrows every tile but «Per datore»,
  which always shows the whole register.
- **The read has no `orderBy`** (no composite index): the register is small and sorted in memory.
- **CSV**: `mese;datore;importo;nota` (aliases: competenza, cliente, committente, fatturato, note). The month reads
  `2025-03`, `03/2025`, `marzo 2025`, `mar 2025` or a whole date; the amount goes through `parseItalianNumber`
  (a lone comma is ALWAYS the decimal separator, the owner's rule) and a leading minus or brackets make a credit
  note. An unreadable row is listed with its line and left out; the rest imports.

## Per-page blind spots

- The tab is always on (no setting): the owner asked for a tab of its own, and an empty register shows how to start.
- The tab has no phone composition of its own yet (no `useMobileSections`, no strip): the tiles stack, the grid
  scrolls sideways inside its tile with the year column sticky.
- The rule ships with the code, but production reads it only once it is PUBLISHED (console Firebase › Firestore ›
  Regole, or `npx firebase deploy --only firestore:rules --project <the owner's project>` — `.firebaserc` points
  elsewhere). Until then every read and write of the tab is refused.
