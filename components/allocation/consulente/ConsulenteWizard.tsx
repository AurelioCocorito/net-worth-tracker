'use client';

/**
 * The PATH: one question per screen, «Indietro» always, the draft on this browser. Every
 * screen is the same card — eyebrow «Passo n di 8 · {tema}», the question as the headline, a
 * help line, the controls, the footer with the two buttons — so the reader learns the shape
 * once. The goals screen walks one goal per sub-screen and ends on «cosa manca?».
 *
 * The reducer is `lib/utils/allocationAdviceDraft.ts` (pure, tested); the loss scenario of the
 * second screen is computed on the base of today's Allocazione (`currentAllocationOnBase`).
 * The last screen hands the answers to `ConsulenteRun`.
 */

import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { ALLOCATION_ADVICE_STEPS } from '@/types/allocationAdvice';
import type { AllocationAdviceDocument } from '@/types/allocationAdvice';
import type { Asset, AssetAllocationSettings } from '@/types/assets';
import type { GoalBasedInvestingData } from '@/types/goals';
import type { AllocationAdviceAnswers, AnswerGoal } from '@/lib/utils/allocationAdviceProposal';
import {
  allocationAdviceDraftReducer,
  clearStoredDraft,
  describeStepBlock,
  initialAnswers,
  reconcileDraftGoals,
  initialDraft,
  readStoredDraft,
  stepOf,
  writeStoredDraft,
} from '@/lib/utils/allocationAdviceDraft';
import { currentAllocationOnBase, lossScenarios } from '@/lib/utils/allocationAdviceApply';
import {
  DISTRIBUTION_POLICY_OPTIONS,
  EXCHANGE_OPTIONS,
  EXCHANGE_OTHER,
  EXCHANGE_OTHER_LABEL,
  LOSS_TOLERANCE_OPTIONS,
  isListedExchange,
  STEP_COPY,
  describeLossScenario,
} from '@/lib/utils/allocationAdviceNarrative';
import { calculateAssetValue } from '@/lib/services/assetService';
import { formatCurrency } from '@/lib/utils/formatters';
import { NarrativeText } from '@/components/ui/narrative-text';
import { TILE_EYEBROW_CLASS, TILE_SUB_EYEBROW_CLASS, TILE_SURFACE_CLASS } from '@/components/ui/tile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { ConsulenteRun } from './ConsulenteRun';
import { useConsulenteRun } from './useConsulenteRun';

interface ConsulenteWizardProps {
  ownerId: string;
  configured: boolean;
  settings: AssetAllocationSettings | null;
  goalData: GoalBasedInvestingData | null;
  assets: Asset[];
  lastDocument: AllocationAdviceDocument | null;
}

const HEADLINE_CLASS = 'text-[24px] font-semibold leading-[1.15] tracking-[-0.025em] text-foreground desktop:text-[30px]';
const HELP_CLASS = 'text-[14px] leading-[1.6] text-muted-foreground desktop:text-[15px]';
const BUTTON_CLASS = 'h-11 desktop:h-9';

/**
 * The exchange: a closed list of the four the instrument agent knows plus «Altra…», which opens a
 * free text field (owner, 2026-10-20: the datalist's arrow looked like a dropdown and was not one).
 * «Altra…» is local state, so the field stays open while the text is still empty; a draft that
 * comes back with an unlisted exchange reopens it.
 */
function ExchangeField({ value, onChange }: { value: string; onChange: (exchange: string) => void }) {
  const [other, setOther] = useState(() => !isListedExchange(value));
  const showOther = other || !isListedExchange(value);
  const selected = showOther ? EXCHANGE_OTHER : value;
  const pick = (next: string) => {
    if (next === EXCHANGE_OTHER) {
      setOther(true);
      onChange('');
      return;
    }
    setOther(false);
    onChange(next);
  };
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="consulente-exchange">Borsa di riferimento</Label>
        <Select value={selected} onValueChange={pick}>
          <SelectTrigger id="consulente-exchange" className={BUTTON_CLASS}>
            <SelectValue placeholder="Scegli la borsa…" />
          </SelectTrigger>
          <SelectContent>
            {EXCHANGE_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>{option}</SelectItem>
            ))}
            <SelectItem value={EXCHANGE_OTHER}>{EXCHANGE_OTHER_LABEL}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {showOther && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="consulente-exchange-other">Quale borsa</Label>
          <Input id="consulente-exchange-other" value={value} onChange={(event) => onChange(event.target.value)} placeholder="es. SIX Swiss Exchange (Zurigo)" autoFocus />
        </div>
      )}
    </>
  );
}

/** A choice as a 44px row: a radio, the label, the description — never a dropdown for three options. */
function ChoiceRows<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string; description: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <RadioGroup value={value} onValueChange={(next) => onChange(next as T)} className="divide-y divide-border rounded-xl border border-border">
      {options.map((option) => {
        const id = `${name}-${option.value}`;
        return (
          <div key={option.value} className="flex items-start gap-3 px-4 py-3">
            <RadioGroupItem value={option.value} id={id} className="mt-1" />
            <Label htmlFor={id} className="flex min-h-11 flex-1 cursor-pointer flex-col items-start justify-center gap-0.5 text-left desktop:min-h-0">
              <span className="text-[14px] font-medium text-foreground">{option.label}</span>
              <span className="text-[13px] font-normal leading-[1.45] text-muted-foreground">{option.description}</span>
            </Label>
          </div>
        );
      })}
    </RadioGroup>
  );
}

const ROLE_OPTIONS_HOME = [
  { value: 'excluded' as const, label: 'Esclusa', description: 'Fuori dalla base e dai piani: la casa in cui vivi non si vende per ribilanciare.' },
  { value: 'frozen' as const, label: 'Non negoziabile', description: 'Conta negli Immobili della base; i piani non la toccano.' },
];
const ROLE_OPTIONS_FROZEN_FIRST = [
  { value: 'frozen' as const, label: 'Non negoziabile', description: 'Conta nella base (abbassa quanto comprare di quella classe); i piani non lo toccano.' },
  { value: 'excluded' as const, label: 'Escluso', description: 'Fuori dalla base: le percentuali si misurano solo sul resto.' },
];

function numberOrNull(value: string): number | null {
  const parsed = Number(value);
  return value.trim() === '' || !Number.isFinite(parsed) ? null : parsed;
}

export function ConsulenteWizard({ ownerId, configured, settings, goalData, assets, lastDocument }: ConsulenteWizardProps) {
  const storage = typeof window !== 'undefined' ? window.localStorage : null;
  const [draft, dispatch] = useReducer(
    allocationAdviceDraftReducer,
    null,
    // A draft that comes back follows FIRE › Obiettivi: goals added since are added, deleted ones dropped.
    () => reconcileDraftGoals(readStoredDraft(storage, ownerId) ?? initialDraft(lastDocument?.answers ?? initialAnswers(settings, goalData, assets)), goalData)
  );
  // The run belongs to the click that starts it (useConsulenteRun): a finished run clears the draft.
  const onFinished = useCallback(() => clearStoredDraft(storage, ownerId), [storage, ownerId]);
  const run = useConsulenteRun(ownerId, onFinished);

  // The draft follows every change onto this browser; a finished run clears it.
  useEffect(() => {
    writeStoredDraft(storage, ownerId, draft);
  }, [storage, ownerId, draft]);

  const base = useMemo(() => currentAllocationOnBase(assets, calculateAssetValue), [assets]);
  const scenarios = useMemo(() => lossScenarios(base.baseTotal), [base.baseTotal]);
  const heldNames = useMemo(() => assets.filter((asset) => asset.quantity > 0 && asset.type !== 'loan' && asset.type !== 'cash').map((asset) => asset.name), [assets]);

  const step = stepOf(draft);
  const copy = STEP_COPY[step];
  const stepNumber = draft.step + 1;
  const block = describeStepBlock(draft);
  const { answers } = draft;
  const patch = (next: Partial<AllocationAdviceAnswers>) => dispatch({ type: 'patch', patch: next });

  if (run.state.kind !== 'idle') {
    const { state } = run;
    return <ConsulenteRun state={state} onRetry={run.retry} onBack={run.reset} />;
  }

  const onGoalsScreen = step === 'obiettivi';
  const goalIndex = draft.goalIndex;
  const currentGoal: AnswerGoal | null = onGoalsScreen && goalIndex < answers.goals.length ? answers.goals[goalIndex] : null;
  const subEyebrow = onGoalsScreen
    ? currentGoal
      ? `Obiettivo ${goalIndex + 1} di ${answers.goals.length}`
      : answers.goals.length === 0
        ? 'Nessun obiettivo registrato'
        : 'Cosa manca'
    : null;

  return (
    <section className={cn(TILE_SURFACE_CLASS, 'mx-auto w-full max-w-[720px] p-5 desktop:p-6')} aria-label={`Passo ${stepNumber} di ${ALLOCATION_ADVICE_STEPS.length}: ${copy.eyebrow}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={TILE_EYEBROW_CLASS}>
          Passo {stepNumber} di {ALLOCATION_ADVICE_STEPS.length} · {copy.eyebrow}
        </h2>
        {subEyebrow && <span className={cn(TILE_SUB_EYEBROW_CLASS, 'shrink-0')}>{subEyebrow}</span>}
      </div>
      <p className={cn(HEADLINE_CLASS, 'mt-3')}>{currentGoal ? (currentGoal.goalId ? `«${currentGoal.name}» è ancora un tuo obiettivo?` : 'Un nuovo obiettivo.') : copy.question}</p>
      <p className={cn(HELP_CLASS, 'mt-2 max-w-[600px]')}>{copy.help}</p>

      <div className="mt-5 flex flex-col gap-4">
        {step === 'profilo' && (
          <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="consulente-age">Età</Label>
              <Input id="consulente-age" type="number" inputMode="numeric" min={18} max={100} value={answers.age ?? ''} onChange={(event) => patch({ age: numberOrNull(event.target.value) })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="consulente-horizon">Orizzonte, in anni</Label>
              <Input id="consulente-horizon" type="number" inputMode="numeric" min={1} max={60} value={answers.horizonYears ?? ''} onChange={(event) => patch({ horizonYears: numberOrNull(event.target.value) })} />
            </div>
          </div>
        )}

        {step === 'tolleranza' && (
          <>
            <ul className="divide-y divide-border rounded-xl border border-border bg-muted/40 px-4" aria-label="Scenari di perdita sulla tua base">
              {scenarios.map((scenario) => (
                <li key={scenario.pct} className="py-2.5">
                  <NarrativeText segments={describeLossScenario(scenario.pct, scenario.eur)} className="text-[13px] leading-[1.45] text-foreground" />
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-muted-foreground">Base di oggi: {formatCurrency(base.baseTotal)} (negoziabile e non negoziabile, al netto dei debiti).</p>
            <ChoiceRows name="loss" value={answers.lossTolerance} options={LOSS_TOLERANCE_OPTIONS} onChange={(lossTolerance) => patch({ lossTolerance })} />
          </>
        )}

        {step === 'borsa' && (
          <>
            <ExchangeField value={answers.exchange} onChange={(exchange) => patch({ exchange })} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="consulente-broker">Broker (facoltativo)</Label>
              <Input id="consulente-broker" value={answers.broker} onChange={(event) => patch({ broker: event.target.value })} placeholder="es. Directa, Fineco, Degiro" />
            </div>
          </>
        )}

        {step === 'politica' && (
          <ChoiceRows name="policy" value={answers.distributionPolicy} options={DISTRIBUTION_POLICY_OPTIONS} onChange={(distributionPolicy) => patch({ distributionPolicy })} />
        )}

        {step === 'obiettivi' && currentGoal && (
          <GoalFields goal={currentGoal} index={goalIndex} onChange={(fields) => dispatch({ type: 'updateGoal', index: goalIndex, patch: fields })} onRemove={() => dispatch({ type: 'removeGoal', index: goalIndex })} />
        )}

        {step === 'obiettivi' && !currentGoal && (
          <>
            {answers.goals.length > 0 && (
            <div className="flex items-start gap-3">
              <Checkbox id="consulente-reflect" checked={answers.goalsReflectReality} onCheckedChange={(checked) => patch({ goalsReflectReality: checked === true })} className="mt-0.5" />
              <Label htmlFor="consulente-reflect" className="min-h-11 cursor-pointer leading-[1.45] desktop:min-h-0">
                Gli obiettivi di sopra rispecchiano la realtà.
              </Label>
            </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="consulente-missing">Cosa manca, nelle tue parole (facoltativo)</Label>
              <Textarea id="consulente-missing" rows={3} value={answers.newGoalsNote} onChange={(event) => patch({ newGoalsNote: event.target.value })} placeholder="es. vorrei mettere da parte per cambiare auto fra tre anni" />
            </div>
            <Button type="button" variant="outline" className={cn(BUTTON_CLASS, 'w-fit gap-1.5')} onClick={() => dispatch({ type: 'addGoal' })}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Aggiungi un obiettivo
            </Button>
          </>
        )}

        {step === 'ruoli' && (
          <div className="flex flex-col gap-4">
            <RoleBlock title="La casa in cui vivi" name="home" value={answers.homeRole} options={ROLE_OPTIONS_HOME} onChange={(homeRole) => patch({ homeRole })} />
            <RoleBlock title="I fondi pensione" name="pension" value={answers.pensionRole} options={ROLE_OPTIONS_FROZEN_FIRST} onChange={(pensionRole) => patch({ pensionRole })} />
            <RoleBlock title="Private equity e altri illiquidi" name="pe" value={answers.privateEquityRole} options={ROLE_OPTIONS_FROZEN_FIRST} onChange={(privateEquityRole) => patch({ privateEquityRole })} />
          </div>
        )}

        {step === 'vincoli' && (
          <>
            {heldNames.length > 0 && (
              <fieldset className="flex flex-col gap-2">
                <legend className={cn(TILE_SUB_EYEBROW_CLASS, 'mb-1')}>Strumenti da tenere comunque</legend>
                <div className="grid grid-cols-1 gap-1 tablet:grid-cols-2">
                  {heldNames.map((name) => {
                    const id = `keep-${name.replace(/\W+/g, '-')}`;
                    const checked = answers.keepAssets.includes(name);
                    return (
                      <div key={name} className="flex items-center gap-3">
                        <Checkbox
                          id={id}
                          checked={checked}
                          onCheckedChange={(next) => patch({ keepAssets: next === true ? [...answers.keepAssets, name] : answers.keepAssets.filter((kept) => kept !== name) })}
                        />
                        <Label htmlFor={id} className="min-h-11 cursor-pointer truncate text-[13px] font-normal desktop:min-h-8">
                          {name}
                        </Label>
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="consulente-avoid">Da evitare (facoltativo)</Label>
              <Input id="consulente-avoid" value={answers.avoid} onChange={(event) => patch({ avoid: event.target.value })} placeholder="es. niente leva, niente singole azioni" />
            </div>
            <div className="flex items-start gap-3">
              <Checkbox id="consulente-esg" checked={answers.esg} onCheckedChange={(checked) => patch({ esg: checked === true })} className="mt-0.5" />
              <Label htmlFor="consulente-esg" className="min-h-11 cursor-pointer leading-[1.45] desktop:min-h-0">
                Preferisco strumenti ESG quando esistono.
              </Label>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="consulente-notes">Altre note per il Consulente (facoltativo)</Label>
              <Textarea id="consulente-notes" rows={3} value={answers.notes} onChange={(event) => patch({ notes: event.target.value })} />
            </div>
          </>
        )}

        {step === 'riepilogo' && <Summary answers={answers} onGoto={(index) => dispatch({ type: 'goto', step: index })} />}
      </div>

      <div className="mt-6 flex flex-col-reverse gap-2 border-t border-border pt-4 tablet:flex-row tablet:items-center tablet:justify-between">
        <Button type="button" variant="outline" className={BUTTON_CLASS} onClick={() => dispatch({ type: 'back' })} disabled={draft.step === 0 && goalIndex === 0}>
          Indietro
        </Button>
        <div className="flex flex-col gap-2 tablet:items-end">
          {block && (
            <p role="status" className="text-[12px] text-warning-foreground">
              {block}
            </p>
          )}
          {step === 'riepilogo' ? (
            <Button type="button" className={BUTTON_CLASS} disabled={!configured} onClick={() => run.start(answers)}>
              {configured ? 'Avvia la ricerca' : 'Servizio AI non configurato'}
            </Button>
          ) : (
            <Button type="button" className={BUTTON_CLASS} disabled={block !== null} onClick={() => dispatch({ type: 'next' })}>
              Avanti
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function RoleBlock<T extends string>({
  title,
  name,
  value,
  options,
  onChange,
}: {
  title: string;
  name: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string; description: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className={TILE_SUB_EYEBROW_CLASS}>{title}</p>
      <ChoiceRows name={name} value={value} options={options} onChange={onChange} />
    </div>
  );
}

function GoalFields({ goal, index, onChange, onRemove }: { goal: AnswerGoal; index: number; onChange: (patch: Partial<AnswerGoal>) => void; onRemove: () => void }) {
  const idOf = (field: string) => `goal-${index}-${field}`;
  return (
    <div className="flex flex-col gap-4">
      {goal.goalId && (
        <div className="flex items-start gap-3">
          <Checkbox id={idOf('keep')} checked={goal.keep} onCheckedChange={(checked) => onChange({ keep: checked === true })} className="mt-0.5" />
          <Label htmlFor={idOf('keep')} className="min-h-11 cursor-pointer leading-[1.45] desktop:min-h-0">
            Sì, lo tengo. {goal.keep ? '' : 'Deselezionato: il Consulente lo propone da eliminare.'}
          </Label>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
        <div className="flex flex-col gap-1.5 tablet:col-span-2">
          <Label htmlFor={idOf('name')}>Nome</Label>
          <Input id={idOf('name')} value={goal.name} onChange={(event) => onChange({ name: event.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={idOf('target')}>Importo target in euro (facoltativo)</Label>
          <Input id={idOf('target')} type="number" inputMode="decimal" min={1} value={goal.targetAmount ?? ''} onChange={(event) => onChange({ targetAmount: numberOrNull(event.target.value) })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={idOf('date')}>Scadenza (facoltativa)</Label>
          <Input id={idOf('date')} type="date" value={goal.targetDateIso ?? ''} onChange={(event) => onChange({ targetDateIso: event.target.value || null })} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className={TILE_SUB_EYEBROW_CLASS}>Priorità</p>
        <ChoiceRows
          name={idOf('priority')}
          value={goal.priority}
          options={[
            { value: 'alta' as const, label: 'Alta', description: 'Va raggiunto: meno rischio man mano che si avvicina.' },
            { value: 'media' as const, label: 'Media', description: 'Importante, ma può slittare.' },
            { value: 'bassa' as const, label: 'Bassa', description: 'Tollera molto rischio e tempo.' },
          ]}
          onChange={(priority) => onChange({ priority })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={idOf('note')}>Nota per il Consulente (facoltativa)</Label>
        <Textarea id={idOf('note')} rows={2} value={goal.note} onChange={(event) => onChange({ note: event.target.value })} placeholder="es. le quote di SWDA sono metà per ciascuna figlia" />
      </div>
      {!goal.goalId && (
        <Button type="button" variant="ghost" className={cn(BUTTON_CLASS, 'w-fit gap-1.5 text-destructive')} onClick={onRemove}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Rimuovi questo obiettivo
        </Button>
      )}
    </div>
  );
}

const LOSS_LABEL: Record<AllocationAdviceAnswers['lossTolerance'], string> = { bassa: 'bassa', media: 'media', alta: 'alta' };
const POLICY_LABEL: Record<AllocationAdviceAnswers['distributionPolicy'], string> = { accumulazione: 'accumulazione', distribuzione: 'distribuzione', indifferente: 'scelga il Consulente' };
const ROLE_LABEL = { tradable: 'negoziabile', frozen: 'non negoziabile', excluded: 'escluso' } as const;

/** «tieni 2 · evita: niente leva · ESG», or «nessuno». A plain loop: a ternary inside a `||` is a block the React Compiler skips. */
function describeConstraints(answers: AllocationAdviceAnswers): string {
  const parts: string[] = [];
  if (answers.keepAssets.length > 0) parts.push(`tieni ${answers.keepAssets.length}`);
  if (answers.avoid.trim()) parts.push(`evita: ${answers.avoid.trim()}`);
  if (answers.esg) parts.push('ESG');
  return parts.length > 0 ? parts.join(' · ') : 'nessuno';
}

/** The answers as rows, each a link back to its screen. */
function Summary({ answers, onGoto }: { answers: AllocationAdviceAnswers; onGoto: (step: number) => void }) {
  const rows: { step: number; label: string; value: string }[] = [
    { step: 0, label: 'Età e orizzonte', value: `${answers.age ?? '—'} anni · ${answers.horizonYears ?? '—'} anni di orizzonte` },
    { step: 1, label: 'Tolleranza alle perdite', value: LOSS_LABEL[answers.lossTolerance] },
    { step: 2, label: 'Borsa e broker', value: `${answers.exchange}${answers.broker ? ` · ${answers.broker}` : ''}` },
    { step: 3, label: 'Proventi', value: POLICY_LABEL[answers.distributionPolicy] },
    {
      step: 4,
      label: 'Obiettivi',
      value: answers.goals.length === 0 ? 'nessuno' : answers.goals.map((goal) => `${goal.name}${goal.keep ? '' : ' (da eliminare)'}`).join(', '),
    },
    { step: 5, label: 'Casa · pensione · illiquidi', value: `${ROLE_LABEL[answers.homeRole]} · ${ROLE_LABEL[answers.pensionRole]} · ${ROLE_LABEL[answers.privateEquityRole]}` },
    { step: 6, label: 'Vincoli', value: describeConstraints(answers) },
  ];
  return (
    <ul className="divide-y divide-border" aria-label="Le tue risposte">
      {rows.map((row) => (
        <li key={row.step}>
          <button type="button" onClick={() => onGoto(row.step)} className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left hover:underline desktop:min-h-9">
            <span className="text-[13px] text-muted-foreground">{row.label}</span>
            <span className="min-w-0 truncate text-[13px] text-foreground">{row.value}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
