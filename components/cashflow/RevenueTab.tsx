/**
 * CASHFLOW › FATTURATI — «quanto fatturo, e in quali mesi?»
 *
 * What was INVOICED by month of competence, not what reached the account: a register of its own
 * (`revenueEntries`, lib/services/revenueService.ts) that never enters a cashflow total. The tab
 * orchestrates and computes nothing: every number comes from `revenueStats.ts`, every sentence
 * from `revenueNarrative.ts`.
 *
 * The tiles: «Mese per mese» (years × months, an empty cell is a month nobody recorded, not a
 * zero), «Stagionalità» (each calendar month's median across the years, its range from the
 * lowest to the highest year), «Per datore» (which also filters the page), «Anni» and
 * «Registrazioni» (the rows, each one opening its form). The figures are entered by hand or
 * imported from a CSV of the owner's spreadsheet (lib/utils/revenueImport.ts).
 */

'use client';

import { useMemo, useState } from 'react';
import { Pencil, Plus, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tile, TILE_CELL_CLASS } from '@/components/ui/tile';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorNotice } from '@/components/ui/error-notice';
import { PageVerdict, type PendingVerdict } from '@/components/ui/page-verdict';
import { RankedRows, type RankedRow } from '@/components/ui/ranked-rows';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { describeReadFailure, resolveSurfaceState } from '@/lib/utils/statesNarrative';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useRevenueEntries } from '@/lib/hooks/useRevenueEntries';
import { cachedFormatCurrencyEUR, formatEuroMinus, formatPercentageIt, formatSignedPercentIt, printedSign } from '@/lib/utils/formatters';
import { MONTH_NAMES_SHORT } from '@/lib/utils/period';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';
import { ALL_CLIENTS, revenueMonthTiers, summarizeRevenue, UNSPECIFIED_CLIENT_LABEL, type RevenueMonthStat, type RevenueMonthTier, type RevenueSummary } from '@/lib/utils/revenueStats';
import {
  buildRevenueVerdict,
  describeRevenueClients,
  describeRevenueGrid,
  describeRevenueMonthTip,
  describeRevenueSeasonality,
  describeRevenueYears,
  revenueMonthName,
} from '@/lib/utils/revenueNarrative';
import { ChartHoverTip, useChartHover } from '@/components/ui/chart-hover';
import { RevenueEntryDialog } from '@/components/cashflow/RevenueEntryDialog';
import { RevenueImportDialog } from '@/components/cashflow/RevenueImportDialog';
import type { RevenueEntry } from '@/types/revenue';
import { REVENUE_SKELETON_CELLS } from '@/lib/constants/cashflowTabSkeletons';

const EMPTY_ENTRIES: RevenueEntry[] = [];
/** The Select's value for the client-less rows: Radix refuses an empty item value. */
const NO_CLIENT_VALUE = '__none__';
/** How many rows «Registrazioni» shows before «Mostra tutte». */
const ROWS_PREVIEW = 12;

const euro = (value: number) => formatEuroMinus(value);

/** The month a new row opens on: the last one that ended. */
function previousMonthIso(): string {
  const [y, m] = getItalyDateIso(new Date()).split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

function monthLabel(month: string): string {
  return `${MONTH_NAMES_SHORT[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

/** The grid's cell shade: the month's weight against the largest month, never below a trace. */
function cellBackground(value: number | null, max: number): string | undefined {
  if (value === null || max <= 0 || value <= 0) return undefined;
  const pct = Math.round(8 + (value / max) * 42);
  return `color-mix(in oklab, var(--chart-1) ${pct}%, transparent)`;
}

function RevenueGrid({ summary }: { summary: RevenueSummary }) {
  const years = [...summary.years].reverse();
  const statRow = (label: string, pick: (m: RevenueMonthStat) => string | null) => (
    <tr className="border-t border-border">
      <th scope="row" className="sticky left-0 bg-card py-1.5 pr-3 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </th>
      {summary.months.map((m) => (
        <td key={m.month} className="px-1.5 py-1.5 text-right font-mono text-[12px] tabular-nums text-muted-foreground">
          {pick(m) ?? <span aria-label="non disponibile">—</span>}
        </td>
      ))}
      <td />
    </tr>
  );
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-[12px]">
        <caption className="sr-only">Fatturato per anno e mese di competenza</caption>
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="sticky left-0 bg-card py-1.5 pr-3 text-left font-medium">Anno</th>
            {MONTH_NAMES_SHORT.map((name) => (
              <th key={name} scope="col" className="px-1.5 py-1.5 text-right font-medium">
                {name}
              </th>
            ))}
            <th scope="col" className="py-1.5 pl-3 text-right font-medium">Totale</th>
          </tr>
        </thead>
        <tbody>
          {years.map((year) => (
            <tr key={year.year} className="border-t border-border">
              <th scope="row" className="sticky left-0 bg-card py-1.5 pr-3 text-left font-mono text-[12px] font-medium tabular-nums">
                {year.year}
              </th>
              {year.months.map((value, i) => (
                <td
                  key={i}
                  className="px-1.5 py-1.5 text-right font-mono tabular-nums"
                  style={{ background: cellBackground(value, summary.gridMax) }}
                >
                  {value === null ? <span className="text-muted-foreground" aria-label="non registrato">·</span> : euro(value)}
                </td>
              ))}
              <td className="py-1.5 pl-3 text-right font-mono font-medium tabular-nums">
                {euro(year.total)}
                {!year.complete && <span className="ml-1 text-[10px] font-normal text-muted-foreground">({year.recordedMonths}/12)</span>}
              </td>
            </tr>
          ))}
          {summary.years.length > 1 && (
            <>
              {statRow('Mediana', (m) => (m.median === null ? null : euro(m.median)))}
              {statRow('Media', (m) => (m.mean === null ? null : euro(m.mean)))}
            </>
          )}
          {summary.completeYears > 0 && statRow("Quota dell'anno", (m) => (m.shareMedian === null ? null : formatPercentageIt(m.shareMedian, 1)))}
        </tbody>
      </table>
    </div>
  );
}

/** The bands of Stagionalità: the sign colours for the ends, the amber slot for the middle. */
const TIER_FILL: Record<RevenueMonthTier, string> = {
  low: 'var(--destructive)',
  mid: 'var(--chart-3)',
  high: 'var(--positive)',
};
const TIER_LEGEND: { tier: RevenueMonthTier; label: string }[] = [
  { tier: 'high', label: 'migliori' },
  { tier: 'mid', label: 'intermedi' },
  { tier: 'low', label: 'peggiori' },
];

const VIEW_W = 600;
const VIEW_H = 140;

/**
 * Each calendar month's median as a bar, the lowest-to-highest year as a line through it. The
 * pointer — or a tap, on a phone — opens the month's tip (`describeRevenueMonthTip`).
 */
function SeasonalityBars({ summary }: { summary: RevenueSummary }) {
  const hover = useChartHover(12, 'slot', { tap: true });
  const tip = hover.index !== null ? describeRevenueMonthTip(summary.months[hover.index]) : null;
  const tiers = revenueMonthTiers(summary.months);
  const banded = tiers.some((t) => t !== null);
  const top = Math.max(...summary.months.map((m) => m.max?.amount ?? 0), 1);
  const slot = VIEW_W / 12;
  const barW = slot * 0.6;
  const yOf = (v: number) => VIEW_H - (Math.max(v, 0) / top) * VIEW_H;
  const label = summary.months
    .map((m) =>
      m.median === null
        ? `${revenueMonthName(m.month)}: non registrato`
        : `${revenueMonthName(m.month)}: mediana ${euro(m.median)}${m.min && m.max && m.values.length > 1 ? `, da ${euro(m.min.amount)} a ${euro(m.max.amount)}` : ''}`
    )
    .join('; ');
  return (
    <div className="mt-4">
      <div className="relative h-[150px]" {...(hover.enabled ? hover.handlers : {})}>
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" role="img" aria-label={`Mediana per mese. ${label}`}>
          {hover.index !== null && <rect x={hover.index * slot} y={0} width={slot} height={VIEW_H} fill="var(--foreground)" opacity={0.06} />}
          {summary.months.map((m, i) => {
            if (m.median === null) return null;
            const x = i * slot + (slot - barW) / 2;
            const tier = tiers[i];
            const isStrong = summary.strongest?.month === m.month;
            return (
              <g key={m.month}>
                <rect
                  x={x}
                  y={yOf(m.median)}
                  width={barW}
                  height={VIEW_H - yOf(m.median)}
                  rx={2}
                  fill={tier ? TIER_FILL[tier] : 'var(--chart-1)'}
                  opacity={tier ? 0.85 : isStrong ? 1 : 0.55}
                />
                {m.min && m.max && m.values.length > 1 && (
                  <line
                    x1={i * slot + slot / 2}
                    x2={i * slot + slot / 2}
                    y1={yOf(m.min.amount)}
                    y2={yOf(m.max.amount)}
                    stroke="var(--foreground)"
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                    opacity={0.6}
                  />
                )}
              </g>
            );
          })}
        </svg>
        {tip && hover.index !== null && (
          <ChartHoverTip x={(hover.index + 0.5) / 12} label={tip.title}>
            <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground">{tip.headline}</span>
            {tip.rows.map((row) => (
              <span key={row.label} className="flex justify-between gap-3 text-muted-foreground">
                <span>{row.label}</span>
                <span className="font-mono tabular-nums text-foreground">{row.value}</span>
              </span>
            ))}
          </ChartHoverTip>
        )}
      </div>
      <div className="mt-1.5 grid grid-cols-12 text-center font-mono text-[10px] uppercase text-muted-foreground" aria-hidden="true">
        {MONTH_NAMES_SHORT.map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>
      {banded && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          {TIER_LEGEND.map(({ tier, label }) => (
            <span key={tier} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2 rounded-[2px]" style={{ background: TIER_FILL[tier] }} />
              {label}
            </span>
          ))}
        </div>
      )}
      <p className="mt-2 text-[11px] leading-[1.4] text-muted-foreground">
        Barra: la mediana del mese sugli anni registrati{banded ? ', colorata per fascia (un terzo dei mesi ciascuna)' : ''}. Linea: dal valore più basso al più alto.
      </p>
    </div>
  );
}

export function RevenueTab() {
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const { data: entries = EMPTY_ENTRIES, isLoading, isError, refetch } = useRevenueEntries(ownerId);
  const [client, setClient] = useState<string>(ALL_CLIENTS);
  const [editing, setEditing] = useState<RevenueEntry | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [showAllRows, setShowAllRows] = useState(false);
  const [defaultMonth] = useState(previousMonthIso);

  const summary = useMemo(() => summarizeRevenue(entries, client), [entries, client]);
  // A filter on a client that left the register (its last row deleted) falls back to everyone.
  const activeClient = client !== ALL_CLIENTS && !summary.clients.some((c) => c.key === client) ? ALL_CLIENTS : client;
  const clientLabel = activeClient === ALL_CLIENTS ? null : (summary.clients.find((c) => c.key === activeClient)?.label ?? null);
  const verdict = useMemo(() => buildRevenueVerdict(summary, clientLabel), [summary, clientLabel]);

  const visibleRows = useMemo(() => {
    const filtered = activeClient === ALL_CLIENTS ? entries : entries.filter((e) => e.client.trim().replace(/\s+/g, ' ').toLowerCase() === activeClient);
    return [...filtered].sort((a, b) => b.month.localeCompare(a.month) || a.client.localeCompare(b.client, 'it'));
  }, [entries, activeClient]);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (entry: RevenueEntry) => {
    setEditing(entry);
    setFormOpen(true);
  };

  const surface = resolveSurfaceState({ loading: isLoading, failed: isError });
  const pending: PendingVerdict | undefined =
    surface === 'failed'
      ? {
          kind: 'failed',
          notice: (
            <ErrorNotice
              notice={describeReadFailure({
                consequence: 'Il fatturato non è stato letto: senza di esso la pagina non ha cifre da mostrare.',
                untouched: 'Le righe registrate non sono state toccate.',
              })}
              onRetry={() => refetch()}
            />
          ),
        }
      : surface === 'loading'
        ? { kind: 'loading' }
        : undefined;

  const actions = (
    <div className="grid grid-cols-2 gap-2 desktop:flex desktop:items-center">
      {summary.clients.length > 1 && (
        <Select value={activeClient || NO_CLIENT_VALUE} onValueChange={(value) => setClient(value === NO_CLIENT_VALUE ? '' : value)}>
          <SelectTrigger aria-label="Filtra per datore" className="col-span-2 h-11 w-full desktop:h-9 desktop:w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CLIENTS}>Tutti i datori</SelectItem>
            {summary.clients.map((c) => (
              <SelectItem key={c.key || NO_CLIENT_VALUE} value={c.key || NO_CLIENT_VALUE}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} disabled={isDemo || !ownerId} className="h-11 desktop:h-9">
        <Upload className="h-4 w-4" />
        Importa CSV
      </Button>
      <Button size="sm" onClick={openNew} disabled={isDemo || !ownerId} className="h-11 desktop:h-9">
        <Plus className="h-4 w-4" />
        Aggiungi
      </Button>
    </div>
  );

  const dialogs = ownerId ? (
    <>
      <RevenueEntryDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        ownerId={ownerId}
        entry={editing}
        entries={entries}
        defaultMonth={defaultMonth}
        disabled={isDemo}
      />
      <RevenueImportDialog open={importOpen} onClose={() => setImportOpen(false)} ownerId={ownerId} entries={entries} disabled={isDemo} />
    </>
  ) : null;

  const verdictRow = (
    <div className="flex flex-col gap-4 pt-1 desktop:flex-row desktop:items-start desktop:justify-between desktop:gap-6">
      <div className="min-w-0 flex-1">
        <PageVerdict verdict={verdict} ariaLabel="Verdetto sul fatturato" pending={pending} />
      </div>
      {surface === 'ready' && <div className="shrink-0">{actions}</div>}
    </div>
  );

  if (surface !== 'ready') {
    return (
      <div className="space-y-4">
        {verdictRow}
        {surface === 'loading' && <TileGridSkeleton verdict={false} cells={REVENUE_SKELETON_CELLS} />}
      </div>
    );
  }

  if (summary.recordedMonths === 0 && entries.length === 0) {
    return (
      <div className="space-y-4">
        {verdictRow}
        <Tile eyebrow="Come iniziare" reading={[{ text: 'Due strade, e si possono usare insieme.' }]}>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13px] leading-[1.5] text-foreground">
            <li>
              <strong className="font-medium">Lo storico</strong>: dal foglio Google, File › Scarica › CSV, con le colonne mese, datore, importo e
              nota; poi «Importa CSV». Reimportare lo stesso mese e datore aggiorna la cifra, non la duplica.
            </li>
            <li>
              <strong className="font-medium">I mesi nuovi</strong>: «Aggiungi», tre campi.
            </li>
          </ul>
        </Tile>
        {dialogs}
      </div>
    );
  }

  const clientRows: RankedRow[] = summary.clients
    .filter((c) => c.total > 0)
    .map((c) => ({ key: c.key, label: c.label, caption: `${c.months} ${c.months === 1 ? 'mese' : 'mesi'}`, amount: c.total, percentage: c.percentage }));
  const gridReading = describeRevenueGrid(summary);
  const seasonReading = describeRevenueSeasonality(summary);
  const yearsReading = describeRevenueYears(summary);
  const clientsReading = describeRevenueClients(summary);
  const rows = showAllRows ? visibleRows : visibleRows.slice(0, ROWS_PREVIEW);

  return (
    <div className="space-y-4">
      {verdictRow}

      <div className="grid grid-cols-1 gap-3 desktop:grid-cols-12">
        <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-12')}>
          <Tile eyebrow="Mese per mese" aside={clientLabel ?? 'tutti i datori'} reading={gridReading}>
            <RevenueGrid summary={summary} />
          </Tile>
        </div>

        <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-7')}>
          <Tile eyebrow="Stagionalità" aside="mediana per mese" reading={seasonReading}>
            {summary.recordedMonths > 0 ? <SeasonalityBars summary={summary} /> : <EmptyState className="mt-3" message="Nessun mese registrato per questo datore." />}
          </Tile>
        </div>

        <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-5')}>
          <Tile eyebrow="Per datore" aside="tutto il registro" reading={clientsReading}>
            {clientRows.length > 0 && (
              <div className="mt-4">
                <RankedRows
                  rows={clientRows}
                  color="var(--chart-1)"
                  ariaLabel="Fatturato per datore"
                  activeKey={activeClient === ALL_CLIENTS ? null : activeClient}
                  onRowClick={(row) => setClient(row.key === activeClient ? ALL_CLIENTS : row.key)}
                />
                <p className="mt-3 text-[11px] leading-[1.4] text-muted-foreground">
                  Tocca un datore per vedere la pagina solo sul suo fatturato; di nuovo per tornare a tutti.
                </p>
              </div>
            )}
          </Tile>
        </div>

        <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-5')}>
          <Tile eyebrow="Anni" aside={clientLabel ?? undefined} reading={yearsReading}>
            <dl className="mt-3 flex flex-col divide-y divide-border">
              {[...summary.years].reverse().map((year, i, list) => {
                const prev = list[i + 1];
                const delta = prev && prev.complete && year.complete && prev.total > 0 ? ((year.total - prev.total) / prev.total) * 100 : null;
                const sign = delta === null ? 0 : printedSign(delta, 0);
                return (
                  <div key={year.year} className="flex items-baseline justify-between gap-3 py-[9px]">
                    <dt className="font-mono text-[13px] tabular-nums text-foreground">
                      {year.year}
                      {!year.complete && <span className="ml-2 font-sans text-[11px] text-muted-foreground">{year.recordedMonths} mesi su 12</span>}
                    </dt>
                    <dd className="m-0 flex items-baseline gap-3 font-mono text-[13px] tabular-nums">
                      {delta !== null && (
                        <span className={cn('text-[11px]', sign > 0 ? 'text-positive' : sign < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                          {formatSignedPercentIt(delta, 0)}
                        </span>
                      )}
                      {cachedFormatCurrencyEUR(year.total, true)}
                    </dd>
                  </div>
                );
              })}
            </dl>
            {summary.yearToDate && (
              <p className="mt-auto pt-4 text-[11px] leading-[1.4] text-muted-foreground">
                {summary.yearToDate.year} fino a {revenueMonthName(summary.yearToDate.upToMonth)}: {euro(summary.yearToDate.current)} contro{' '}
                {euro(summary.yearToDate.previous)} nello stesso periodo del {summary.yearToDate.previousYear}.
              </p>
            )}
          </Tile>
        </div>

        <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-7')}>
          <Tile
            eyebrow="Registrazioni"
            aside={`${visibleRows.length} righe`}
            reading={[{ text: 'Una riga per mese e datore; tocca una riga per correggerla o eliminarla.' }]}
          >
            <ul className="mt-3 flex flex-col divide-y divide-border" aria-label="Righe di fatturato">
              {rows.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => openEdit(entry)}
                    disabled={isDemo}
                    className="flex min-h-[44px] w-full items-center gap-3 py-[9px] text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset desktop:-mx-2 desktop:min-h-0 desktop:w-[calc(100%+16px)] desktop:rounded-md desktop:px-2"
                    aria-label={`Modifica ${monthLabel(entry.month)}, ${entry.client || UNSPECIFIED_CLIENT_LABEL}, ${euro(entry.amount)}`}
                  >
                    <span className="w-[72px] shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground">{monthLabel(entry.month)}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                      {entry.client || <span className="text-muted-foreground">{UNSPECIFIED_CLIENT_LABEL}</span>}
                      {entry.note && <span className="ml-2 text-[11px] text-muted-foreground">{entry.note}</span>}
                    </span>
                    <span className="shrink-0 font-mono text-[13px] tabular-nums">{cachedFormatCurrencyEUR(entry.amount)}</span>
                    <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
            {visibleRows.length > ROWS_PREVIEW && (
              <div className="mt-3">
                <Button variant="ghost" size="sm" onClick={() => setShowAllRows((v) => !v)}>
                  {showAllRows ? 'Mostra meno' : `Mostra tutte (${visibleRows.length})`}
                </Button>
              </div>
            )}
          </Tile>
        </div>
      </div>

      {dialogs}
    </div>
  );
}
