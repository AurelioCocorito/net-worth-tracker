'use client';

/**
 * Cashflow › Fatturati — the form of ONE (month, client) figure, new or edited.
 *
 * The save is an upsert on the pair (`revenueEntryId`): a month and a client already recorded are
 * overwritten, and the reading says so before the save, so a figure is never replaced by surprise.
 * An edit that moves the row to another pair removes the old one in the same batch
 * (`updateRevenueEntry`).
 */

import { useId, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { describeModalStatus, describeWriteError, type ModalStatus } from '@/lib/utils/dialogNarrative';
import { parseRevenueAmount, parseRevenueMonth } from '@/lib/utils/revenueImport';
import { revenueClientKey } from '@/lib/utils/revenueStats';
import { deleteRevenueEntry, saveRevenueEntry, updateRevenueEntry } from '@/lib/services/revenueService';
import { queryKeys } from '@/lib/query/queryKeys';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import type { RevenueEntry, RevenueEntryInput } from '@/types/revenue';

interface RevenueEntryDialogProps {
  open: boolean;
  onClose: () => void;
  ownerId: string;
  /** The row being edited; absent for a new one. */
  entry: RevenueEntry | null;
  /** The register as it stands: the overwrite warning and the clients the field suggests. */
  entries: readonly RevenueEntry[];
  /** The month a new row opens on, `YYYY-MM`. */
  defaultMonth: string;
  disabled?: boolean;
}

/** A new pair, or an edit that may move the row (outside the component: the compiler keeps a try block flat). */
function writeEntry(ownerId: string, entry: RevenueEntry | null, input: RevenueEntryInput): Promise<void> {
  return entry ? updateRevenueEntry(ownerId, entry.id, input) : saveRevenueEntry(ownerId, input);
}

function RevenueEntryForm({ onClose, ownerId, entry, entries, defaultMonth, disabled }: Omit<RevenueEntryDialogProps, 'open'>) {
  const queryClient = useQueryClient();
  const ids = useId();
  const [month, setMonth] = useState(entry?.month ?? defaultMonth);
  const [client, setClient] = useState(entry?.client ?? '');
  const [amount, setAmount] = useState(entry ? String(entry.amount).replace('.', ',') : '');
  const [note, setNote] = useState(entry?.note ?? '');
  const [status, setStatus] = useState<ModalStatus>({ phase: 'idle' });

  const parsedMonth = parseRevenueMonth(month);
  const parsedAmount = parseRevenueAmount(amount);
  const clientNames = [...new Set(entries.map((e) => e.client).filter((c) => c !== ''))].sort((a, b) => a.localeCompare(b, 'it'));
  // The pair already holds a figure that is not this row: the save replaces it.
  const overwritten = parsedMonth
    ? entries.find((e) => e.month === parsedMonth && revenueClientKey(e.client) === revenueClientKey(client) && e.id !== entry?.id)
    : undefined;

  const idle = overwritten
    ? `${overwritten.client || 'Il totale senza datore'} ha già ${cachedFormatCurrencyEUR(overwritten.amount)} in questo mese: il salvataggio lo sostituisce.`
    : 'Il fatturato del mese di competenza, non quello incassato sul conto. Senza datore è il totale del mese.';

  const invalid = !parsedMonth || parsedAmount === null;
  const busy = status.phase === 'submitting';

  const handleSave = async () => {
    if (!parsedMonth || parsedAmount === null) return;
    setStatus({ phase: 'submitting' });
    const input = { month: parsedMonth, client, amount: parsedAmount, note };
    const done = entry ? 'Fatturato aggiornato' : 'Fatturato registrato';
    try {
      await writeEntry(ownerId, entry, input);
      await queryClient.invalidateQueries({ queryKey: queryKeys.revenue.all(ownerId) });
      toast.success(done);
      onClose();
    } catch (error) {
      setStatus({ phase: 'error', message: describeWriteError(error) });
    }
  };

  const handleDelete = async () => {
    if (!entry) return;
    setStatus({ phase: 'submitting' });
    try {
      await deleteRevenueEntry(entry.id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.revenue.all(ownerId) });
      toast.success('Riga eliminata');
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
      title={entry ? 'Modifica fatturato' : 'Nuovo fatturato'}
      reading={describeModalStatus(status, { idle: [{ text: idle }], submitting: 'Salvataggio…' })}
      width="sm"
      footer={
        <>
          {entry && (
            <Button variant="outline" onClick={handleDelete} disabled={busy || disabled} className="desktop:mr-auto text-destructive">
              Elimina
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Annulla
          </Button>
          <Button onClick={handleSave} disabled={busy || invalid || disabled}>
            {busy ? 'Salvataggio…' : 'Salva'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor={`${ids}-month`}>Mese di competenza</Label>
          <Input
            id={`${ids}-month`}
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            placeholder="2025-03"
            aria-invalid={month !== '' && !parsedMonth}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${ids}-client`}>Datore</Label>
          <Input
            id={`${ids}-client`}
            value={client}
            onChange={(e) => setClient(e.target.value)}
            list={`${ids}-clients`}
            placeholder="Facoltativo"
            autoComplete="off"
          />
          <datalist id={`${ids}-clients`}>
            {clientNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${ids}-amount`}>Importo fatturato (€)</Label>
          <Input
            id={`${ids}-amount`}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="2500,00"
            className="font-mono tabular-nums"
            aria-invalid={amount !== '' && parsedAmount === null}
          />
          <p className="text-[11px] leading-[1.4] text-muted-foreground">La virgola separa i decimali; un importo negativo è una nota di credito.</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${ids}-note`}>Nota</Label>
          <Input id={`${ids}-note`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Facoltativa" />
        </div>
      </div>
    </ResponsiveModal>
  );
}

/** Mounted only while open, so every opening starts from the row it edits. */
export function RevenueEntryDialog({ open, ...props }: RevenueEntryDialogProps) {
  if (!open) return null;
  return <RevenueEntryForm key={props.entry?.id ?? 'new'} {...props} />;
}
