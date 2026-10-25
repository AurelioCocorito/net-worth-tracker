'use client';

/**
 * ExpenseImportSection — Settings → Spese, the «Import CSV» tile.
 *
 * A 4-phase wizard (idle → preview → committing → done) to migrate historical
 * expense/income data from a standardized CSV. Parsing/validation is delegated to
 * the pure lib/utils/expenseImport.ts layer; the Firestore commit/undo to
 * lib/services/expenseImportService.ts. Every import is undoable via its batch id —
 * right after it, or later from «Import precedenti» (2026-10-24), which lists the
 * batches still in the data. The optional «conto» column links rows to a cash account
 * and moves its balance on each row's date; the preview names the accounts and the
 * net they move by, and an undo gives it back. A `transfer` row (2026-10-25) names its
 * destination in «conto_destinazione» and moves both accounts; into a fondo pensione it is
 * recorded as a voluntary contribution in Previdenza. Investment rows (2026-10-25: acquisto,
 * vendita, correzione, matched on «isin») become trades of the Registro operazioni, creating an
 * instrument the user does not hold yet; the preview counts them and names the instruments.
 * Dividend rows («dividendo», «cedola») land in the Dividendi registry; a payment already there
 * (e.g. scraped from Borsa Italiana) is refused in the preview.
 *
 * The tile's reading line states the phase (settingsNarrative.describeImport): the
 * idle promise, the preview's three counts (import/skip/create — nothing moves
 * without confirmation), the undoable outcome. The preview's figures are flat KPIs
 * (sub-eyebrow · 18px mono · caption), never tinted sub-cards.
 *
 * Owner-scoped like every other Cashflow surface: `ownerId` comes from
 * `useActiveAccount()`, not `user.uid`, so a shared-account delegate imports into
 * the active account's data, not their own.
 */

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Upload, Download, FileText, AlertTriangle, CheckCircle2, Undo2, Loader2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { cachedFormatCurrencyEUR, formatDate } from '@/lib/utils/formatters';
import { describeImport } from '@/lib/utils/settingsNarrative';
import { useQueryClient } from '@tanstack/react-query';
import { categoriesQueryOptions } from '@/lib/hooks/useExpenses';
import { assetsQueryOptions } from '@/lib/hooks/useAssets';
import {
  buildImportPlan,
  parseImportCsv,
  buildTemplateCsv,
  isDividendTypeCell,
  summarizeImportBatches,
  type ImportBatchSummary,
} from '@/lib/utils/expenseImport';
import {
  balanceCorrectionsAsBatchRows,
  commitImportPlan,
  deleteExpensesByImportBatch,
} from '@/lib/services/expenseImportService';
import {
  getExistingDividendsForImport,
  getImportedDividends,
  getImportedTrades,
} from '@/lib/services/investmentImportService';
import { getAllExpenses } from '@/lib/services/expenseService';
import { getAllAssets } from '@/lib/services/assetService';
import { getAssetTransactions } from '@/lib/services/assetTransactionService';
import { computeCashDelta } from '@/lib/utils/assetTransactionUtils';
import { Checkbox } from '@/components/ui/checkbox';
import { queryKeys } from '@/lib/query/queryKeys';
import { ASSET_CLASS_LABELS } from '@/lib/utils/allocationUtils';
import { isLedgerAssetType } from '@/types/assetTransactions';
import {
  ImportCashAccount,
  ImportExistingData,
  ImportExistingDividend,
  ImportInstrument,
  ImportPlan,
  RawRow,
} from '@/types/expenseImport';
import type { ExpenseCategory } from '@/types/expenses';
import { SETTINGS_SECTION_IDS } from '@/lib/constants/navigation';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import {
  describePriceWarning,
  findImplausibleTradePrices,
  type ImportPriceReference,
} from '@/lib/utils/importPriceCheck';

/** The default-account select's value for «no account». */
const NO_DEFAULT_ACCOUNT = '__none__';

type Phase = 'idle' | 'preview' | 'committing' | 'done';

/** A price in the instrument's currency, with up to four decimals, Italian separators. */
function formatPrice(value: number): string {
  return value.toLocaleString('it-IT', { maximumFractionDigits: 4 });
}

/** The held instruments' prices in Patrimonio, by upper-case ISIN: the reference of their rows. */
function heldPriceReferences(assets: { isin?: string; name: string; currentPrice: number }[]): Map<string, ImportPriceReference> {
  const references = new Map<string, ImportPriceReference>();
  for (const a of assets) {
    if (a.isin && a.currentPrice > 0) references.set(a.isin.trim().toUpperCase(), { name: a.name, price: a.currentPrice });
  }
  return references;
}

/** The live quote of a ticker (GET /api/prices/quote), or null when there is none. */
async function fetchQuotedReference(ticker: string, name: string): Promise<ImportPriceReference | null> {
  if (!ticker) return null;
  try {
    const response = await authenticatedFetch(`/api/prices/quote?ticker=${encodeURIComponent(ticker)}`);
    if (!response.ok) return null;
    const quote = (await response.json()) as { price?: number | null };
    return typeof quote.price === 'number' && quote.price > 0 ? { name, price: quote.price } : null;
  } catch {
    return null;
  }
}

interface ExpenseImportSectionProps {
  /** Called after a successful commit or undo, so the parent can refresh categories/expenses. */
  onImported?: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  fixed: 'Spese Fisse',
  variable: 'Spese Variabili',
  debt: 'Debiti',
  income: 'Entrate',
  transfer: 'Trasferimenti',
};

/** «2 acquisti, 1 vendita, 19 correzioni» — the trade rows of the preview, by type. */
function describeTradeCounts(summary: ImportPlan['summary']): string {
  const parts = [
    summary.buyCount > 0 ? `${summary.buyCount} ${summary.buyCount === 1 ? 'acquisto' : 'acquisti'}` : '',
    summary.sellCount > 0 ? `${summary.sellCount} ${summary.sellCount === 1 ? 'vendita' : 'vendite'}` : '',
    summary.adjustmentCount > 0
      ? `${summary.adjustmentCount} ${summary.adjustmentCount === 1 ? 'correzione' : 'correzioni'}`
      : '',
  ].filter(Boolean);
  return `${parts.join(', ')} di titoli`;
}

/** «3 dividendi e 1 cedola (52,40 € netti)» — the payments of the preview. */
function describeDividendCounts(summary: ImportPlan['summary']): string {
  const parts = [
    summary.dividendCount > 0 ? `${summary.dividendCount} ${summary.dividendCount === 1 ? 'dividendo' : 'dividendi'}` : '',
    summary.couponCount > 0 ? `${summary.couponCount} ${summary.couponCount === 1 ? 'cedola' : 'cedole'}` : '',
  ].filter(Boolean);
  return `${parts.join(' e ')} (${cachedFormatCurrencyEUR(summary.totalDividendNet, true)} netti)`;
}

/** A flat KPI of the preview: sub-eyebrow, 18px mono figure, muted caption. */
function PreviewKpi({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <div className="min-w-0">
      <p className={TILE_SUB_EYEBROW_CLASS}>{label}</p>
      <p className="mt-1 font-mono text-[18px] font-bold leading-none tracking-[-0.03em] tabular-nums">{value}</p>
      {caption && <p className="mt-1 text-[11px] leading-[1.4] text-muted-foreground">{caption}</p>}
    </div>
  );
}


/**
 * The registry, read only when the file carries dividend rows: a payment already in it is refused.
 * Outside the component: a conditional inside the handler's try/catch is a value block the React
 * Compiler does not support, and it would skip the whole component.
 */
async function readExistingDividendsFor(rows: RawRow[], ownerId: string): Promise<ImportExistingDividend[]> {
  return rows.some((r) => isDividendTypeCell(r.tipo)) ? getExistingDividendsForImport(ownerId) : [];
}

/**
 * What the file is checked against for rows already in the data (2026-10-25): every cashflow row
 * and every trade of the account, read once when the file is chosen. The same reads give the
 * «saldo» rows what moved after their day.
 */
async function readExistingDataFor(ownerId: string): Promise<Omit<ImportExistingData, 'includeDuplicates'>> {
  const [expenses, trades] = await Promise.all([getAllExpenses(ownerId), getAssetTransactions(ownerId)]);
  return {
    expenses: expenses.map((e) => ({
      date: e.date,
      type: e.type,
      amount: e.amount,
      linkedCashAssetId: e.linkedCashAssetId,
      transferCashAssetId: e.transferCashAssetId,
      balancePending: e.balancePending,
      importRowCode: e.importRowCode,
    })),
    trades: trades.map((t) => ({
      assetId: t.assetId,
      type: t.type,
      date: t.date,
      quantity: t.quantity,
      pricePerUnit: t.pricePerUnit,
      linkedCashAssetId: t.linkedCashAssetId,
      cashDelta: computeCashDelta(t),
    })),
  };
}

/** «3 righe già presenti» — the preview's set-aside count. */
function describeDuplicates(count: number): string {
  return `${count} ${count === 1 ? 'riga già presente' : 'righe già presenti'} nei dati`;
}

/** The «Scartate» caption: where the reasons are, and the rows set aside apart from them. */
function describeSkipped(summary: ImportPlan['summary']): string | undefined {
  const parts = [
    summary.skippedCount > 0 ? 'motivi riga per riga qui sotto' : '',
    summary.duplicateCount > 0 ? `a parte ${describeDuplicates(summary.duplicateCount)}` : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

export default function ExpenseImportSection({ onImported }: ExpenseImportSectionProps) {
  const { ownerId } = useActiveAccount();
  const queryClient = useQueryClient();
  const isDemo = useDemoMode();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [fileName, setFileName] = useState<string>('');
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  // What the preview re-plans from when the default account changes: the parsed rows and
  // the categories / accounts read with them.
  const [source, setSource] = useState<{
    rows: RawRow[];
    categories: ExpenseCategory[];
    cashAccounts: ImportCashAccount[];
    instruments: ImportInstrument[];
    existingDividends: ImportExistingDividend[];
    existing: Omit<ImportExistingData, 'includeDuplicates'>;
  } | null>(null);
  // «Importa anche le righe già presenti»: off by default, a row already in the data is set aside.
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  /** The price each trade row is checked against (importPriceCheck), by upper-case ISIN. */
  const [priceReferences, setPriceReferences] = useState<ReadonlyMap<string, ImportPriceReference>>(new Map());
  const [defaultAccountId, setDefaultAccountId] = useState<string>(NO_DEFAULT_ACCOUNT);
  const [lastBatch, setLastBatch] = useState<{
    importBatchId: string;
    created: number;
    tradeFailure?: { line: number; message: string };
    balancesAligned?: number;
  } | null>(null);
  const [undoing, setUndoing] = useState(false);
  // «Import precedenti»: read on demand, never on mount (it reads every expense).
  const [pastBatches, setPastBatches] = useState<ImportBatchSummary[] | null>(null);
  const [loadingPast, setLoadingPast] = useState(false);
  const [armedBatchId, setArmedBatchId] = useState<string | null>(null);
  const [undoingBatchId, setUndoingBatchId] = useState<string | null>(null);

  const loadPastBatches = async () => {
    if (!ownerId) return;
    setLoadingPast(true);
    try {
      const [expenses, trades, dividends, assets] = await Promise.all([
        getAllExpenses(ownerId),
        getImportedTrades(ownerId),
        getImportedDividends(ownerId),
        getAllAssets(ownerId),
      ]);
      setPastBatches(
        summarizeImportBatches([...expenses, ...trades, ...dividends, ...balanceCorrectionsAsBatchRows(assets)])
      );
    } catch (err) {
      console.error('Past imports read error:', err);
      toast.error('Impossibile leggere gli import precedenti.');
    }
    setLoadingPast(false);
  };

  const handleUndoPast = async (batch: ImportBatchSummary) => {
    if (!ownerId) return;
    // Two taps: the first arms the row, the second deletes — the rows cannot be restored.
    if (armedBatchId !== batch.importBatchId) {
      setArmedBatchId(batch.importBatchId);
      return;
    }
    setUndoingBatchId(batch.importBatchId);
    try {
      const deleted = await deleteExpensesByImportBatch(ownerId, batch.importBatchId);
      toast.success(`Import annullato: ${deleted} transazioni rimosse.`);
      setPastBatches((list) => (list ?? []).filter((b) => b.importBatchId !== batch.importBatchId));
      invalidateTradeCaches();
      if (onImported) onImported();
    } catch (err) {
      console.error('Undo past import error:', err);
      toast.error("Errore durante l'annullamento.");
    }
    setArmedBatchId(null);
    setUndoingBatchId(null);
  };

  // An import may write trades and create instruments: the same triple the trade hooks refresh.
  const invalidateTradeCaches = () => {
    if (!ownerId) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.assetTransactions.all(ownerId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview(ownerId) });
  };

  const reset = () => {
    setPhase('idle');
    setPlan(null);
    setSource(null);
    setDefaultAccountId(NO_DEFAULT_ACCOUNT);
    setIncludeDuplicates(false);
    setPriceReferences(new Map());
    setFileName('');
    setLastBatch(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDownloadTemplate = () => {
    const blob = new Blob([buildTemplateCsv()], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template-import-spese.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !ownerId) return;
    setFileName(file.name);
    try {
      const text = await file.text();
      const rows = parseImportCsv(text);
      // The categories the preview plans against, through the key every reader shares.
      const categories = await queryClient.fetchQuery(categoriesQueryOptions(ownerId));
      // The accounts the «conto» column can name — the same filter as the expense form's.
      const assets = await queryClient.fetchQuery(assetsQueryOptions(ownerId));
      // Plus the pension funds (2026-10-25), a transfer's destination only: the row becomes a
      // voluntary contribution in Previdenza.
      // A cash account's balance is its quantity: what a «saldo» row is compared against.
      const cashAccounts: ImportCashAccount[] = [
        ...assets
          .filter((a) => a.type === 'cash' && a.assetClass === 'cash')
          .map((a) => ({ id: a.id, name: a.name, balance: a.quantity })),
        ...assets.filter((a) => a.type === 'pensionFund').map((a) => ({ id: a.id, name: a.name, kind: 'pensionFund' as const })),
      ];
      // The instruments the investment rows match by ISIN (2026-10-25).
      const instruments: ImportInstrument[] = assets
        .filter((a) => a.isin)
        .map((a) => ({ id: a.id, name: a.name, isin: a.isin, ledger: isLedgerAssetType(a.type) }));
      const existingDividends = await readExistingDividendsFor(rows, ownerId);
      const existing = await readExistingDataFor(ownerId);
      const built = buildImportPlan(rows, categories, cashAccounts, undefined, new Date(), instruments, existingDividends, existing);
      setPriceReferences(heldPriceReferences(assets));
      void addQuotedPriceReferences(built);
      setSource({ rows, categories, cashAccounts, instruments, existingDividends, existing });
      setDefaultAccountId(NO_DEFAULT_ACCOUNT);
      setIncludeDuplicates(false);
      setPlan(built);
      setPhase('preview');
      if (built.summary.validCount === 0) {
        toast.warning('Nessuna riga valida trovata nel file.');
      }
    } catch (err) {
      console.error('CSV parse error:', err);
      toast.error(err instanceof Error ? err.message : 'Impossibile leggere il file CSV.');
      reset();
    }
  };

  // An instrument the file creates has no price in Patrimonio yet: its live quote is the
  // reference, fetched after the preview opens (best effort — no quote, no check).
  const addQuotedPriceReferences = async (built: ImportPlan) => {
    const quoted = await Promise.all(built.instrumentsToCreate.map((i) => fetchQuotedReference(i.ticker, i.name)));
    const found = built.instrumentsToCreate
      .map((i, index) => [i.isin.toUpperCase(), quoted[index]] as const)
      .filter((entry): entry is readonly [string, ImportPriceReference] => entry[1] !== null);
    if (found.length === 0) return;
    setPriceReferences((current) => new Map([...current, ...found]));
  };

  const replan = (accountValue: string, withDuplicates: boolean) => {
    if (!source) return;
    setPlan(
      buildImportPlan(
        source.rows,
        source.categories,
        source.cashAccounts,
        accountValue === NO_DEFAULT_ACCOUNT ? undefined : accountValue,
        new Date(),
        source.instruments,
        source.existingDividends,
        { ...source.existing, includeDuplicates: withDuplicates }
      )
    );
  };

  const handleDefaultAccountChange = (value: string) => {
    setDefaultAccountId(value);
    replan(value, includeDuplicates);
  };

  const handleIncludeDuplicatesChange = (checked: boolean) => {
    setIncludeDuplicates(checked);
    replan(defaultAccountId, checked);
  };

  const handleConfirm = async () => {
    if (!plan || plan.summary.validCount === 0 || !ownerId) return;
    setPhase('committing');
    // Outside the try: a logical expression inside it is a value block the React Compiler refuses.
    const touchesInvestments = plan.tradeRows.length > 0 || plan.dividendRows.length > 0;
    try {
      // Re-read categories right before committing (`staleTime: 0`, never the cache): the preview
      // may be stale if the user edited categories elsewhere while this dialog was open.
      const categories = await queryClient.fetchQuery({ ...categoriesQueryOptions(ownerId), staleTime: 0 });
      const result = await commitImportPlan(ownerId, plan, categories);
      setLastBatch(result);
      setPhase('done');
      if (touchesInvestments) invalidateTradeCaches();
      if (result.tradeFailure) {
        toast.error(`Import fermato alla riga ${result.tradeFailure.line}: ${result.tradeFailure.message}`);
      } else {
        toast.success(`Importate ${result.created} transazioni.`);
      }
      // An `if`, not `?.()`: the React Compiler refuses optional chaining inside a try.
      if (onImported) onImported();
    } catch (err) {
      console.error('Import commit error:', err);
      toast.error("Errore durante l'importazione.");
      setPhase('preview');
    }
  };

  const handleUndo = async () => {
    if (!lastBatch || !ownerId) return;
    setUndoing(true);
    try {
      const deleted = await deleteExpensesByImportBatch(ownerId, lastBatch.importBatchId);
      toast.success(`Import annullato: ${deleted} transazioni rimosse.`);
      invalidateTradeCaches();
      if (onImported) onImported();
      reset();
    } catch (err) {
      console.error('Undo import error:', err);
      toast.error("Errore durante l'annullamento.");
    }
    // After the try/catch rather than in a `finally`: keeps the section compilable by the React Compiler.
    setUndoing(false);
  };

  const priceWarnings = plan ? findImplausibleTradePrices(plan.tradeRows, priceReferences, new Date()) : [];

  const reading =
    phase === 'preview' && plan
      ? describeImport({
          phase: 'preview',
          fileName,
          validCount: plan.summary.validCount,
          skippedCount: plan.summary.skippedCount,
          newCategoriesCount: plan.summary.newCategoriesCount,
        })
      : phase === 'done' && lastBatch
        ? describeImport({ phase: 'done', created: lastBatch.created })
        : describeImport({ phase: 'idle' });

  return (
    <Tile id={SETTINGS_SECTION_IDS.import} className="scroll-mt-24 desktop:scroll-mt-4" eyebrow="Import CSV" aside="anteprima obbligatoria" reading={reading}>
      {phase === 'idle' && (
        <>
          <div className="mt-3.5 flex flex-col gap-3 sm:flex-row">
            <Button variant="outline" onClick={handleDownloadTemplate} className="w-full sm:w-auto">
              <Download className="mr-2 h-4 w-4" />
              Scarica template CSV
            </Button>
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isDemo}
              className="w-full sm:w-auto"
            >
              <Upload className="mr-2 h-4 w-4" />
              Carica file CSV
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFile}
              aria-label="Carica file CSV storico spese"
            />
          </div>
          {isDemo && (
            <p className="mt-2 text-[11px] leading-[1.4] text-muted-foreground">
              Il caricamento non è disponibile in modalità demo.
            </p>
          )}
          <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
            Una riga per transazione; le categorie mancanti vengono create. Senza la colonna «conto» i saldi non si
            muovono; con «conto», ogni riga muove il saldo di quel conto alla sua data, come una voce inserita a mano.
            Un trasferimento ha tipo «transfer», «conto» di partenza e «conto_destinazione» di arrivo; verso un fondo
            pensione diventa un versamento volontario in Previdenza. Acquisti, vendite e correzioni di titoli hanno
            tipo «acquisto», «vendita» o «correzione», l&apos;«isin», la «quantita» e il «prezzo»: finiscono nel
            Registro operazioni, e un titolo che non hai ancora viene creato da «titolo», «strumento» e «simbolo».
            Dividendi e cedole hanno tipo «dividendo» o «cedola», l&apos;«isin», la «quantita», l&apos;«importo» lordo e
            la ritenuta in «tasse»: un pagamento già presente in Dividendi viene scartato. Una riga già nei dati
            (stessa data, stesso importo, stesso conto, o lo stesso «codice») viene messa da parte, così un file
            caricato due volte non raddoppia nulla. Una riga di tipo «saldo» con «conto» e «importo» porta quel conto
            al saldo dell&apos;estratto a fine giornata.
          </div>
          <Collapsible
            className="mt-3 border-t border-border pt-3"
            onOpenChange={(open) => {
              if (open && pastBatches === null) void loadPastBatches();
            }}
          >
            <CollapsibleTrigger className="text-[13px] text-muted-foreground hover:underline">
              Import precedenti
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              {loadingPast && (
                <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Lettura in corso…
                </p>
              )}
              {!loadingPast && pastBatches !== null && pastBatches.length === 0 && (
                <p className="text-[13px] text-muted-foreground">Nessun import nei dati.</p>
              )}
              {!loadingPast && pastBatches !== null && pastBatches.length > 0 && (
                <ul className="divide-y divide-border rounded-md border border-border text-[13px]">
                  {pastBatches.map((b) => (
                    <li key={b.importBatchId} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                      <span>
                        Importato il {formatDate(b.importedAt)}: {b.count} {b.count === 1 ? 'voce' : 'voci'} dal{' '}
                        {formatDate(b.dateFrom)} al {formatDate(b.dateTo)}
                        {b.linkedCount > 0 && (
                          <span className="text-muted-foreground"> · {b.linkedCount} collegate a un conto</span>
                        )}
                      </span>
                      <Button
                        variant={armedBatchId === b.importBatchId ? 'destructive' : 'outline'}
                        size="sm"
                        onClick={() => void handleUndoPast(b)}
                        disabled={isDemo || undoingBatchId !== null}
                        className="w-full shrink-0 sm:w-auto"
                      >
                        {undoingBatchId === b.importBatchId ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Undo2 className="mr-2 h-4 w-4" />
                        )}
                        {armedBatchId === b.importBatchId ? `Conferma: elimina ${b.count} voci` : 'Annulla import'}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CollapsibleContent>
          </Collapsible>
        </>
      )}

      {phase === 'preview' && plan && (
        <>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="truncate">{fileName}</span>
          </div>

          <div className="mt-3.5 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
            <PreviewKpi
              label="Da importare"
              value={String(plan.summary.validCount)}
              caption={
                `${cachedFormatCurrencyEUR(plan.summary.totalIncome, true)} entrate · ${cachedFormatCurrencyEUR(plan.summary.totalExpense, true)} uscite` +
                (plan.summary.transferCount > 0
                  ? ` · ${plan.summary.transferCount} ${plan.summary.transferCount === 1 ? 'trasferimento' : 'trasferimenti'} (${cachedFormatCurrencyEUR(plan.summary.totalTransfer, true)})`
                  : '') +
                (plan.summary.pensionContributionCount > 0
                  ? `, di cui ${plan.summary.pensionContributionCount} ${plan.summary.pensionContributionCount === 1 ? 'versamento' : 'versamenti'} alla previdenza`
                  : '') +
                (plan.tradeRows.length > 0 ? ` · ${describeTradeCounts(plan.summary)}` : '') +
                (plan.dividendRows.length > 0 ? ` · ${describeDividendCounts(plan.summary)}` : '')
              }
            />
            <PreviewKpi
              label="Scartate"
              value={String(plan.summary.skippedCount)}
              caption={describeSkipped(plan.summary)}
            />
            <PreviewKpi
              label="Da creare"
              value={String(plan.summary.newCategoriesCount)}
              caption={
                plan.summary.dateFrom && plan.summary.dateTo
                  ? `periodo ${formatDate(plan.summary.dateFrom)} → ${formatDate(plan.summary.dateTo)}`
                  : undefined
              }
            />
          </div>

          {source && source.cashAccounts.length > 0 && (
            <div className="mt-3.5 border-t border-border pt-3">
              <label htmlFor="import-default-account" className={TILE_SUB_EYEBROW_CLASS}>
                Conto per le righe senza conto
              </label>
              <Select value={defaultAccountId} onValueChange={handleDefaultAccountChange}>
                <SelectTrigger id="import-default-account" className="mt-1.5 w-full sm:w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_DEFAULT_ACCOUNT}>Nessuno: i saldi non si muovono</SelectItem>
                  {source.cashAccounts.filter((a) => a.kind !== 'pensionFund').map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {plan.summary.accounts.length > 0 && (
            <div className="mt-3.5 border-t border-border pt-3">
              <p className={TILE_SUB_EYEBROW_CLASS}>Saldi che si muovono</p>
              <ul className="mt-1.5 space-y-0.5 text-[13px] text-muted-foreground">
                {plan.summary.accounts.map((a) => (
                  <li key={a.assetId}>
                    • {a.name}: {a.count} {a.count === 1 ? 'voce' : 'voci'}, saldo{' '}
                    {a.net >= 0 ? '+' : '−'}
                    {cachedFormatCurrencyEUR(Math.abs(a.net), true)} (ogni voce alla sua data
                    {a.tradeCount ? `, di cui ${a.tradeCount} su titoli` : ''})
                  </li>
                ))}
              </ul>
            </div>
          )}

          {plan.balanceRows.length > 0 && (
            <div className="mt-3.5 border-t border-border pt-3">
              <p className={TILE_SUB_EYEBROW_CLASS}>Saldi allineati all&apos;estratto</p>
              <ul className="mt-1.5 space-y-0.5 text-[13px] text-muted-foreground">
                {plan.balanceRows.map((b) => (
                  <li key={b.assetId}>
                    • {b.accountName} al {formatDate(b.date)}: estratto{' '}
                    {cachedFormatCurrencyEUR(b.statementBalance, true)}, app{' '}
                    {cachedFormatCurrencyEUR(b.appBalance, true)}
                    {Math.abs(b.delta) < 0.005
                      ? ': già allineato, nessuna correzione'
                      : ` → correzione ${b.delta > 0 ? '+' : '−'}${cachedFormatCurrencyEUR(Math.abs(b.delta), true)}`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {priceWarnings.length > 0 && (
            <div className="mt-3.5 border-t border-border pt-3" data-testid="import-price-warnings">
              <p className={`${TILE_SUB_EYEBROW_CLASS} flex items-center gap-1.5 text-warning-foreground`}>
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {priceWarnings.length === 1 ? 'Un prezzo da controllare' : `${priceWarnings.length} prezzi da controllare`}
              </p>
              <ul className="mt-1.5 space-y-0.5 text-[13px] text-muted-foreground">
                {priceWarnings.map((w) => (
                  <li key={w.line}>
                    <span className="font-mono">Riga {w.line}</span> · {describePriceWarning(w, formatPrice)}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[12px] text-muted-foreground">
                È solo un avviso: le righe si importano comunque. Se il prezzo è sbagliato, correggi il file e ricaricalo.
              </p>
            </div>
          )}

          {plan.duplicates.length > 0 && (
            <div className="mt-3.5 border-t border-border pt-3">
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-2 text-[13px] text-muted-foreground hover:underline">
                  <Info className="h-4 w-4" aria-hidden="true" />
                  {describeDuplicates(plan.duplicates.length)}
                  {includeDuplicates ? ': verranno importate comunque' : ': non verranno importate'}
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border text-[13px]">
                    {plan.duplicates.map((d) => (
                      <div key={d.line} className="flex gap-3 px-3 py-2">
                        <span className="shrink-0 font-mono text-muted-foreground">Riga {d.line}</span>
                        <span>{d.reason}</span>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
              <div className="mt-2 flex items-center gap-2">
                <Checkbox
                  id="import-include-duplicates"
                  checked={includeDuplicates}
                  onCheckedChange={(checked) => handleIncludeDuplicatesChange(checked === true)}
                />
                <label htmlFor="import-include-duplicates" className="text-[13px]">
                  Importa anche le righe già presenti
                </label>
              </div>
            </div>
          )}

          {plan.instrumentsToCreate.length > 0 && (
            <div className="mt-3.5 border-t border-border pt-3">
              <p className={TILE_SUB_EYEBROW_CLASS}>Titoli che verranno creati in Patrimonio</p>
              <ul className="mt-1.5 space-y-0.5 text-[13px] text-muted-foreground">
                {plan.instrumentsToCreate.map((i) => (
                  <li key={i.isin}>
                    • {i.name}{' '}
                    <span className="opacity-70">
                      ({i.isin} · {i.ticker} · {ASSET_CLASS_LABELS[i.assetClass] ?? i.assetClass} · aliquota {i.taxRate}%)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {plan.categoriesToCreate.length > 0 && (
            <div className="mt-3.5 border-t border-border pt-3">
              <p className={TILE_SUB_EYEBROW_CLASS}>Categorie che verranno create</p>
              <ul className="mt-1.5 space-y-0.5 text-[13px] text-muted-foreground">
                {plan.categoriesToCreate.map((c) => (
                  // Keyed by (type, name): two same-named categories of different
                  // types can legitimately be created by the same import.
                  <li key={`${c.type}::${c.name}`}>
                    • {c.name} <span className="opacity-70">({TYPE_LABELS[c.type] ?? c.type})</span>
                    {c.subCategories.length > 0 && (
                      <span className="opacity-70"> — {c.subCategories.join(', ')}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Deterministic choices the user must SEE before committing — e.g. two
              same-named same-typed categories, rows attaching to the oldest one. */}
          {plan.notices.length > 0 && (
            <div className="mt-3.5 border-t border-border pt-3">
              <p className={`${TILE_SUB_EYEBROW_CLASS} flex items-center gap-1.5`}>
                <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Da sapere prima di importare
              </p>
              <ul className="mt-1.5 space-y-0.5 text-[13px] text-muted-foreground">
                {plan.notices.map((n) => (
                  <li key={`${n.type}::${n.categoryName}`}>• {n.message}</li>
                ))}
              </ul>
            </div>
          )}

          {plan.errors.length > 0 && (
            <Collapsible className="mt-3.5 border-t border-border pt-3">
              <CollapsibleTrigger className="flex items-center gap-2 text-[13px] text-warning-foreground hover:underline">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                Mostra {plan.errors.length} righe scartate
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <div className="max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border text-[13px]">
                  {plan.errors.map((err, i) => (
                    <div key={i} className="flex gap-3 px-3 py-2">
                      <span className="shrink-0 font-mono text-muted-foreground">Riga {err.line}</span>
                      <span>{err.reason}</span>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          <div className="mt-auto flex flex-col gap-3 border-t border-border pt-3.5 sm:flex-row">
            <Button
              onClick={handleConfirm}
              disabled={isDemo || plan.summary.validCount === 0}
              className="w-full sm:w-auto"
            >
              Importa {plan.summary.validCount} voci
            </Button>
            <Button variant="outline" onClick={reset} className="w-full sm:w-auto">
              Annulla
            </Button>
          </div>
        </>
      )}

      {phase === 'committing' && (
        <div className="mt-3.5 flex items-center gap-3 py-4 text-[13px] text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Importazione in corso…
        </div>
      )}

      {phase === 'done' && lastBatch && (
        <>
          <div className="mt-3.5 flex items-center gap-2 text-[13px]">
            <CheckCircle2 className="h-5 w-5 text-positive" aria-hidden="true" />
            <span className="font-medium">Importate {lastBatch.created} transazioni.</span>
          </div>
          {(lastBatch.balancesAligned ?? 0) > 0 && (
            <p className="mt-2 text-[13px] text-muted-foreground">
              {lastBatch.balancesAligned === 1
                ? 'Un conto portato al saldo dell’estratto.'
                : `${lastBatch.balancesAligned} conti portati al saldo dell’estratto.`}
            </p>
          )}
          {lastBatch.tradeFailure && (
            <p className="mt-2 flex gap-2 text-[13px] text-warning-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Le operazioni su titoli e i dividendi si sono fermati alla riga {lastBatch.tradeFailure.line}:{' '}
                {lastBatch.tradeFailure.message} Le righe successive non sono state scritte; puoi annullare
                l&apos;import, correggere il file e ricaricarlo.
              </span>
            </p>
          )}
          <div className="mt-auto flex flex-col gap-3 border-t border-border pt-3.5 sm:flex-row">
            <Button
              variant="outline"
              onClick={handleUndo}
              disabled={undoing || isDemo}
              className="w-full sm:w-auto"
            >
              {undoing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Undo2 className="mr-2 h-4 w-4" />}
              Annulla import
            </Button>
            <Button variant="ghost" onClick={reset} className="w-full sm:w-auto">
              Importa un altro file
            </Button>
          </div>
        </>
      )}
    </Tile>
  );
}
