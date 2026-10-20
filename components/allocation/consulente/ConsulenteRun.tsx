'use client';

/**
 * The RUN's screen: the three stages of the two agents as rows that light up in turn, the
 * page's one live region saying which is on. Presentational — the stream and its state are
 * `useConsulenteRun`, started by the gesture that asked for the run; a drop of the connection
 * leaves the document where the run was, and the query that reads it (`useAllocationAdvice`)
 * rereads so the report shows what landed.
 */

import { Check, Loader2 } from 'lucide-react';
import { ALLOCATION_ADVICE_STAGES } from '@/types/allocationAdvice';
import { STAGE_COPY, describeRunHeadline } from '@/lib/utils/allocationAdviceNarrative';
import { TILE_EYEBROW_CLASS, TILE_SURFACE_CLASS } from '@/components/ui/tile';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ConsulenteRunState } from './useConsulenteRun';

interface ConsulenteRunProps {
  state: Exclude<ConsulenteRunState, { kind: 'idle' }>;
  /** Starts the run again on the same answers, from the stage that failed, after a retryable failure. */
  onRetry: () => void;
  /** Back to the summary after a failure. */
  onBack: () => void;
}

export function ConsulenteRun({ state, onRetry, onBack }: ConsulenteRunProps) {
  const stage = state.kind === 'running' ? state.stage : null;
  const reached = stage === null ? -1 : ALLOCATION_ADVICE_STAGES.indexOf(stage);

  return (
    <section className={cn(TILE_SURFACE_CLASS, 'mx-auto w-full max-w-[720px] p-5 desktop:p-6')} aria-label="Corsa del Consulente">
      <h2 className={TILE_EYEBROW_CLASS}>Consulente · in corso</h2>
      <p className="mt-3 text-[24px] font-semibold leading-[1.15] tracking-[-0.025em] text-foreground desktop:text-[30px]" role="status" aria-live="polite">
        {state.kind === 'failed' ? 'Il percorso non si è concluso.' : state.kind === 'done' ? 'La proposta è pronta.' : describeRunHeadline(stage)}
      </p>
      {state.kind === 'failed' && <p className="mt-2 text-[14px] leading-[1.6] text-destructive">{state.error}</p>}
      <ol className="mt-5 divide-y divide-border rounded-xl border border-border" aria-label="Le fasi">
        {ALLOCATION_ADVICE_STAGES.map((item, index) => {
          const done = state.kind === 'done' || index < reached;
          const active = state.kind === 'running' && index === reached;
          return (
            <li key={item} className="flex items-start gap-3 px-4 py-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
                {done ? <Check className="h-4 w-4 text-positive" /> : active ? <Loader2 className="h-4 w-4 animate-spin text-foreground" /> : <span className="h-2 w-2 rounded-full bg-border" />}
              </span>
              <div className="min-w-0">
                <p className={cn('text-[14px] font-medium', done || active ? 'text-foreground' : 'text-muted-foreground')}>{STAGE_COPY[item].label}</p>
                <p className="text-[13px] leading-[1.45] text-muted-foreground">{STAGE_COPY[item].detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-[11px] text-muted-foreground">Puoi lasciare la pagina: ogni fase viene salvata appena finisce.</p>
      {state.kind === 'failed' && (
        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-border pt-4 tablet:flex-row tablet:justify-between">
          <Button type="button" variant="outline" className="h-11 desktop:h-9" onClick={onBack}>
            Torna al riepilogo
          </Button>
          {state.retryable && (
            <Button type="button" className="h-11 desktop:h-9" onClick={onRetry}>
              Riprova
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
