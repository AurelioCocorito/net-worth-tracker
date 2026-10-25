'use client';

/**
 * Cashflow › Fatturati — the CSV import, with its preview before any write.
 *
 * The file is read in the browser (`parseRevenueCsv`); the preview names how many months it
 * holds, how many rows it summed, which lines it could not read and how many (month, client)
 * pairs it will REPLACE — the write is an upsert, so a file imported twice replaces its figures
 * instead of doubling them.
 */

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { describeModalStatus, describeWriteError, type ModalStatus } from '@/lib/utils/dialogNarrative';
import { buildRevenueTemplateCsv, parseRevenueCsv, type RevenueImportPlan } from '@/lib/utils/revenueImport';
import { revenueClientKey } from '@/lib/utils/revenueStats';
import { importRevenueEntries } from '@/lib/services/revenueService';
import { queryKeys } from '@/lib/query/queryKeys';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import type { RevenueEntry } from '@/types/revenue';

interface RevenueImportDialogProps {
  open: boolean;
  onClose: () => void;
  ownerId: string;
  entries: readonly RevenueEntry[];
  disabled?: boolean;
}

function downloadTemplate() {
  const blob = new Blob([buildRevenueTemplateCsv()], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'template-import-fatturato.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/** The file's plan, or the reason it has none (outside the component: the compiler keeps a try block flat). */
async function readPlan(file: File): Promise<{ plan: RevenueImportPlan | null; error: string | null }> {
  try {
    return { plan: parseRevenueCsv(await file.text()), error: null };
  } catch (error) {
    return { plan: null, error: error instanceof Error ? error.message : 'Il file non è leggibile.' };
  }
}

function RevenueImportForm({ onClose, ownerId, entries, disabled }: Omit<RevenueImportDialogProps, 'open'>) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [plan, setPlan] = useState<RevenueImportPlan | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [status, setStatus] = useState<ModalStatus>({ phase: 'idle' });

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFileName(file.name);
    setStatus({ phase: 'idle' });
    const read = await readPlan(file);
    setPlan(read.plan);
    setParseError(read.error);
  };

  const existing = new Set(entries.map((e) => `${e.month}|${revenueClientKey(e.client)}`));
  const replaced = plan ? plan.rows.filter((r) => existing.has(`${r.month}|${revenueClientKey(r.client)}`)).length : 0;
  const total = plan ? plan.rows.reduce((sum, r) => sum + r.amount, 0) : 0;
  const months = plan ? new Set(plan.rows.map((r) => r.month)).size : 0;
  const busy = status.phase === 'submitting';

  const idle = parseError
    ? parseError
    : plan
      ? plan.rows.length === 0
        ? 'Nessuna riga leggibile nel file.'
        : `${plan.rows.length} righe su ${months} mesi, ${cachedFormatCurrencyEUR(total, true)} in tutto${replaced > 0 ? `; ${replaced} ${replaced === 1 ? 'sostituisce' : 'sostituiscono'} una cifra già registrata` : ''}.`
      : 'Una riga per mese e datore: mese, datore (facoltativo), importo, nota. Dal foglio Google: File › Scarica › CSV.';

  const handleImport = async () => {
    if (!plan || plan.rows.length === 0) return;
    setStatus({ phase: 'submitting' });
    try {
      const count = await importRevenueEntries(ownerId, plan.rows);
      await queryClient.invalidateQueries({ queryKey: queryKeys.revenue.all(ownerId) });
      toast.success(`${count} righe di fatturato importate`);
      onClose();
    } catch (error) {
      setStatus({ phase: 'error', message: describeWriteError(error) });
    }
  };

  return (
    <ResponsiveModal
      open
      onClose={onClose}
      eyebrow="Cashflow · Fatturati"
      title="Importa fatturato da CSV"
      reading={
        parseError
          ? { narrative: [{ text: parseError }], tone: 'negative' }
          : describeModalStatus(status, { idle: [{ text: idle }], submitting: 'Importazione…' })
      }
      width="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Annulla
          </Button>
          <Button onClick={handleImport} disabled={busy || disabled || !plan || plan.rows.length === 0}>
            {busy ? 'Importazione…' : plan && plan.rows.length > 0 ? `Importa ${plan.rows.length} righe` : 'Importa'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button variant="outline" onClick={downloadTemplate} className="w-full sm:w-auto">
          <Download className="mr-2 h-4 w-4" />
          Scarica template CSV
        </Button>
        <Button onClick={() => fileInputRef.current?.click()} disabled={busy || disabled} className="w-full sm:w-auto">
          <Upload className="mr-2 h-4 w-4" />
          {fileName ? 'Scegli un altro file' : 'Carica file CSV'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleFile}
          aria-label="Carica file CSV del fatturato"
        />
      </div>
      {fileName && <p className="mt-3 truncate font-mono text-[11px] text-muted-foreground">{fileName}</p>}

      {plan && plan.errors.length > 0 && (
        <div className="mt-4">
          <p className="text-[13px] font-medium text-destructive">
            {plan.errors.length} {plan.errors.length === 1 ? 'riga non letta' : 'righe non lette'} (restano fuori dall&apos;import)
          </p>
          <ul className="mt-1 max-h-32 overflow-y-auto text-[12px] leading-[1.5] text-muted-foreground">
            {plan.errors.map((err) => (
              <li key={err.line}>
                Riga {err.line}: {err.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {plan && plan.merged > 0 && (
        <p className="mt-3 text-[12px] leading-[1.5] text-muted-foreground">
          {plan.merged} {plan.merged === 1 ? 'riga sommata' : 'righe sommate'} a un&apos;altra dello stesso mese e datore.
        </p>
      )}
      {plan && plan.rows.length > 0 && (
        <div className="mt-4 max-h-64 overflow-y-auto rounded-md border border-border">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-card text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Mese</th>
                <th className="px-3 py-2 font-medium">Datore</th>
                <th className="px-3 py-2 text-right font-medium">Importo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {plan.rows.map((row) => (
                <tr key={`${row.month}|${row.client}`}>
                  <td className="px-3 py-1.5 font-mono tabular-nums">{row.month}</td>
                  <td className="px-3 py-1.5">{row.client || <span className="text-muted-foreground">senza datore</span>}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{cachedFormatCurrencyEUR(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ResponsiveModal>
  );
}

/** Mounted only while open, so every opening starts from an empty preview. */
export function RevenueImportDialog({ open, ...props }: RevenueImportDialogProps) {
  if (!open) return null;
  return <RevenueImportForm {...props} />;
}
