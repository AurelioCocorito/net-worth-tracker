/**
 * Dialog for assigning a slice of an asset to a goal — in PERCENT of the asset or in UNITS
 * (quote of an instrument, euro of an account or a property; lib/utils/assetSlice.ts, owner's
 * decision of 2026-10-17). Shows the assets with their value and what is still free; once one
 * is picked, one row with the % | quote switch and the field, and under it the asset's split
 * as a computed list: the quotas the other goals already hold (each in its own form), this one,
 * and «non assegnate» as the REST — never typed. A total past the asset is a refusal in the
 * reading line (The Status-Is-The-Reading Rule), never a save.
 *
 * The reset runs on every opening: a useState initializer fires once per mount, and an effect
 * setting state is banned (react-hooks/set-state-in-effect), so it is an adjust-during-render
 * keyed on `open`.
 */

'use client';

import { useState, useMemo } from 'react';
import { Asset } from '@/types/assets';
import { GoalAssetAssignment, InvestmentGoal } from '@/types/goals';
import { getAvailablePercentage } from '@/lib/services/goalService';
import { assignmentSlice, goalAssetValueOf } from '@/lib/utils/goalMath';
import { isGoalAsset } from '@/lib/utils/goalAssetValue';
import { sliceBase, sliceFraction, sliceUnit, sliceUnitLabel, sliceUnits, summarizeSlices, type AssetSlice } from '@/lib/utils/assetSlice';
import { describeModalStatus, type ModalStatus } from '@/lib/utils/dialogNarrative';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency, formatNumberIt, formatPercentageIt } from '@/lib/utils/formatters';
import { getAssetDisplayTicker } from '@/lib/utils/assetDisplay';
import { Search, Loader2 } from 'lucide-react';

type QuotaMode = 'percent' | 'units';

const MODE_OPTIONS: ReadonlyArray<{ value: QuotaMode; label: string }> = [
  { value: 'percent', label: '%' },
  { value: 'units', label: 'quote' },
];

interface AssetAssignmentDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (goalId: string, assetId: string, slice: AssetSlice) => Promise<void>;
  goalId: string;
  /** The goals, for the names of the other quotas in the split. */
  goals: InvestmentGoal[];
  assets: Asset[];
  assignments: GoalAssetAssignment[];
}

const IDLE_READING = {
  idle: [{ text: "Una quota assegnata esce dalle quote libere e finisce nella traiettoria di questo obiettivo, in percentuale o in quote. Lo strumento resta dov'è: cambia solo a chi è destinato." }],
  submitting: 'Salvataggio in corso…',
};

/** «12 quote» / «5.000 €» — the typed units with their word. */
function unitsText(units: number, asset: Asset): string {
  const unit = sliceUnit(asset);
  if (unit.kind === 'currency') return formatCurrency(units, unit.currency, 0);
  return `${formatNumberIt(units, Number.isInteger(units) ? 0 : 2)} ${sliceUnitLabel(unit, units === 1 ? 1 : 2)}`;
}

export function AssetAssignmentDialog({
  open,
  onClose,
  onSave,
  goalId,
  goals,
  assets,
  assignments,
}: AssetAssignmentDialogProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [mode, setMode] = useState<QuotaMode>('percent');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<ModalStatus>({ phase: 'idle' });

  // Reset fields each time the dialog opens, during render (React's adjust-state-during-render)
  // rather than in an effect (react-hooks/set-state-in-effect): the blank form is the one
  // painted, never the previous draft for a frame. Closing keeps the draft, as before.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSearchTerm('');
      setSelectedAssetId(null);
      setMode('percent');
      setAmount('');
      setStatus({ phase: 'idle' });
    }
  }

  const filteredAssets = useMemo(() => {
    const term = searchTerm.toLowerCase();
    // A loan is never offered: a goal holds what it finances, net of it (lib/utils/goalAssetValue.ts).
    return assets.filter(isGoalAsset).filter(
      (a) =>
        a.name.toLowerCase().includes(term) ||
        a.ticker.toLowerCase().includes(term) ||
        getAssetDisplayTicker(a).toLowerCase().includes(term)
    );
  }, [assets, searchTerm]);

  const selectedAsset = assets.find((a) => a.id === selectedAssetId) ?? null;
  const goalName = (id: string) => goals.find((g) => g.id === id)?.name ?? id;

  // The other goals' quotas on this asset, each in the form it was typed; this goal's own is
  // replaced by what is being typed. The rest is computed, never typed.
  const otherQuotas = selectedAsset ? assignments.filter((a) => a.assetId === selectedAsset.id && a.goalId !== goalId) : [];
  const existingAssignment = selectedAsset ? assignments.find((a) => a.assetId === selectedAsset.id && a.goalId === goalId) ?? null : null;
  const typed = parseFloat(amount);
  const typedSlice: AssetSlice | null = selectedAsset && Number.isFinite(typed) && typed > 0 ? (mode === 'units' ? { units: typed } : { percent: typed }) : null;
  const quantity = selectedAsset?.quantity ?? 0;
  const budget = selectedAsset ? summarizeSlices([...otherQuotas.map(assignmentSlice), ...(typedSlice ? [typedSlice] : [])], quantity) : null;
  const overAssigned = budget?.needsReassignment ?? false;
  const unit = selectedAsset ? sliceUnit(selectedAsset) : null;

  const pickAsset = (asset: Asset) => {
    setSelectedAssetId(asset.id);
    setStatus({ phase: 'idle' });
    const current = assignments.find((a) => a.assetId === asset.id && a.goalId === goalId);
    if (current && 'units' in current) {
      setMode('units');
      setAmount(String(current.units));
    } else {
      setMode('percent');
      setAmount(current ? String(current.percentage) : '');
    }
  };

  const switchMode = (next: QuotaMode) => {
    // The figure follows the switch, so what is typed keeps its meaning («40%» ↔ «40 quote»).
    if (selectedAsset && typedSlice) {
      const converted = next === 'units' ? sliceUnits(typedSlice, quantity) : sliceFraction(typedSlice, quantity) * 100;
      setAmount(String(Math.round(converted * 10000) / 10000));
    }
    setMode(next);
  };

  const handleSave = async () => {
    if (!selectedAsset || !typedSlice) return;
    if (overAssigned && budget) {
      const label = unit ? unitsText(budget.assignedUnits, selectedAsset) : '';
      setStatus({ phase: 'error', message: `Le quote assegnate (${label}) superano quelle possedute (${unitsText(sliceBase(quantity), selectedAsset)}): riduci questa o un'altra quota.` });
      return;
    }
    setStatus({ phase: 'submitting' });
    // `.finally` on a promise, not a try/finally: the React Compiler cannot lower the statement.
    // A failed save still rejects to the caller, as it did.
    const save = async () => {
      await onSave(goalId, selectedAsset.id, typedSlice);
      onClose();
    };
    await save().finally(() => setStatus({ phase: 'idle' }));
  };

  const saving = status.phase === 'submitting';

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      eyebrow="FIRE · Obiettivi"
      title="Assegna uno strumento"
      reading={describeModalStatus(status, IDLE_READING)}
      width="md"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || !selectedAsset || !typedSlice}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {saving ? 'Salvataggio...' : existingAssignment ? 'Aggiorna' : 'Assegna'}
          </Button>
        </>
      }
    >
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cerca asset per nome o ticker..."
              className="pl-9"
            />
          </div>

          {/* Asset list */}
          <div className="border border-border rounded-lg max-h-[250px] overflow-y-auto divide-y divide-border">
            {filteredAssets.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4 text-center">
                Nessun asset trovato
              </p>
            ) : (
              filteredAssets.map((asset) => {
                const value = goalAssetValueOf(asset, assets);
                // trueAvail: truly free space across ALL goals (no exclusion)
                const trueAvail = getAvailablePercentage(asset, assignments);
                const isSelected = selectedAssetId === asset.id;
                const alreadyAssigned = assignments.find(
                  (a) => a.assetId === asset.id && a.goalId === goalId
                );

                // Availability status: based on truly free space, not goal-scoped available
                const availabilityInfo =
                  trueAvail === 0 && !alreadyAssigned
                    ? { label: 'Esaurito', cls: 'text-destructive' }
                    : trueAvail === 0 && alreadyAssigned
                      ? { label: 'Nessuna quota libera', cls: 'text-muted-foreground' }
                      : trueAvail < 50
                        ? { label: `${formatPercentageIt(trueAvail, 0)} libero`, cls: 'text-warning-foreground' }
                        : { label: `${formatPercentageIt(trueAvail, 0)} libero`, cls: 'text-positive' };

                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => pickAsset(asset)}
                    className={`w-full text-left px-3 py-2.5 hover:bg-muted/30 transition-colors ${
                      isSelected ? 'bg-accent' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {asset.name}
                        </p>
                        <p className="text-xs text-muted-foreground">{getAssetDisplayTicker(asset)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono tabular-nums text-foreground/80">
                          {formatCurrency(value)}
                        </p>
                        <p className={`text-xs ${availabilityInfo.cls}`}>
                          {availabilityInfo.label}
                          {alreadyAssigned && (
                            <span className="text-muted-foreground ml-1">
                              ({'units' in alreadyAssigned ? unitsText(alreadyAssigned.units, asset) : `${alreadyAssigned.percentage}%`} assegnato)
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* The quota — visible when an asset is selected: the switch, the field, the split. */}
          {selectedAsset && budget && unit && (
            <div className="space-y-3 p-3 bg-muted/50 rounded-lg border border-border">
              <p className="text-sm font-medium text-foreground">
                {selectedAsset.name} ({getAssetDisplayTicker(selectedAsset)}) · {unitsText(sliceBase(quantity), selectedAsset)}
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label htmlFor="assignAmount" className="text-xs text-muted-foreground">
                    {mode === 'units' ? `Quota in ${sliceUnitLabel(unit)}` : 'Quota in percentuale'}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="assignAmount"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={amount}
                      onChange={(e) => {
                        setAmount(e.target.value);
                        if (status.phase === 'error') setStatus({ phase: 'idle' });
                      }}
                      className="w-32 font-mono tabular-nums"
                      aria-describedby="assignSplit"
                    />
                    <SegmentedPill
                      options={MODE_OPTIONS}
                      value={mode}
                      onChange={switchMode}
                      layoutId="assign-quota-mode"
                      ariaLabel="Forma della quota"
                      semantics="radio"
                    />
                  </div>
                </div>
                {typedSlice && (
                  <div className="ml-auto text-right">
                    <p className="text-xs text-muted-foreground">Equivale a</p>
                    <p className="text-sm font-semibold font-mono tabular-nums text-foreground">
                      {formatCurrency(goalAssetValueOf(selectedAsset, assets) * sliceFraction(typedSlice, quantity))}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        {mode === 'units' ? formatPercentageIt(sliceFraction(typedSlice, quantity) * 100, 1) : unitsText(sliceUnits(typedSlice, quantity), selectedAsset)}
                      </span>
                    </p>
                  </div>
                )}
              </div>

              {/* The asset's split: the other goals as typed, this one, the rest computed. */}
              <ul id="assignSplit" className="divide-y divide-border border-t border-border text-[12px]" aria-label={`Riparto di ${selectedAsset.name}`}>
                {otherQuotas.map((quota) => (
                  <li key={quota.goalId} className="flex items-center justify-between py-1.5">
                    <span className="text-muted-foreground">{goalName(quota.goalId)}</span>
                    <span className="font-mono tabular-nums text-foreground">
                      {'units' in quota ? `${unitsText(quota.units, selectedAsset)} · ${formatPercentageIt(sliceFraction(quota, quantity) * 100, 1)}` : `${formatPercentageIt(quota.percentage, 1)}`}
                    </span>
                  </li>
                ))}
                <li className="flex items-center justify-between py-1.5">
                  <span className="text-foreground">{goalName(goalId)}</span>
                  <span className="font-mono tabular-nums text-foreground">
                    {typedSlice ? (mode === 'units' ? `${unitsText(typedSlice && 'units' in typedSlice ? typedSlice.units : 0, selectedAsset)} · ${formatPercentageIt(sliceFraction(typedSlice, quantity) * 100, 1)}` : formatPercentageIt(sliceFraction(typedSlice, quantity) * 100, 1)) : '—'}
                  </span>
                </li>
                <li className={`flex items-center justify-between py-1.5 ${overAssigned ? 'text-destructive' : 'text-muted-foreground'}`}>
                  <span>{overAssigned ? 'Oltre il posseduto' : 'Non assegnate'}</span>
                  <span className="font-mono tabular-nums">
                    {overAssigned ? `−${unitsText(budget.overBy, selectedAsset)}` : `${unitsText(budget.freeUnits, selectedAsset)} · ${formatPercentageIt(sliceBase(quantity) > 0 ? (budget.freeUnits / sliceBase(quantity)) * 100 : 0, 1)}`}
                  </span>
                </li>
              </ul>
            </div>
          )}
        </div>
    </ResponsiveModal>
  );
}
