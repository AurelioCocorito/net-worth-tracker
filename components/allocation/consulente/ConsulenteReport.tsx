'use client';

/**
 * The REPORT: the verdict on the run, then one column of tiles — the proposal against today,
 * the instruments the search found, the goals, the roles, the agents' text — and the «Applica»
 * tile, one checkbox per thing it writes, the plans shown before anything moves. A failed run
 * shows its sentence and the way back; a run still going shows its stage and rereads.
 *
 * The writes go through the app's own services (`setSettings`, `updateAssetAllocationRole`,
 * `saveGoalData`) and then the «applied» route records them; every reader's key is invalidated.
 */

import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useQueryClient } from '@tanstack/react-query';
import { Globe } from 'lucide-react';
import type { AllocationAdviceDocument } from '@/types/allocationAdvice';
import type { Asset } from '@/types/assets';
import type { GoalBasedInvestingData } from '@/types/goals';
import { ALLOCATION_ADVICE_STAGES } from '@/types/allocationAdvice';
import { calculateAssetValue, updateAssetAllocationRole } from '@/lib/services/assetService';
import { setSettings } from '@/lib/services/assetAllocationService';
import { saveGoalData } from '@/lib/services/goalService';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { queryKeys } from '@/lib/query/queryKeys';
import { useAllocationAdvice } from '@/lib/hooks/useAllocationAdvice';
import { useConsulenteRevision } from './useConsulenteRevision';
import { buildTargetsFromProposal, currentAllocationOnBase, planGoalDocument, planRoleChanges } from '@/lib/utils/allocationAdviceApply';
import { removedGoalIds } from '@/lib/utils/allocationAdviceDraft';
import { buildConsulenteVerdict, buildProposalRows, describeApplySummary, describeProposalReading, describeRunHeadline, REVISION_COPY, STAGE_COPY } from '@/lib/utils/allocationAdviceNarrative';
import { describeWriteError } from '@/lib/utils/dialogNarrative';
import { formatDate, formatPercentageIt, formatSignedPoints, formatCurrency } from '@/lib/utils/formatters';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';
import { PageVerdict } from '@/components/ui/page-verdict';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface ConsulenteReportProps {
  ownerId: string;
  document: AllocationAdviceDocument;
  assets: Asset[];
  goalData: GoalBasedInvestingData | null;
  onRedo: () => void;
}

const ROLE_LABEL = { tradable: 'negoziabile', frozen: 'non negoziabile', excluded: 'escluso' } as const;

/** Module-level, as ReactMarkdown wants: a stable map keeps the tree mounted across renders. */
const MARKDOWN_COMPONENTS: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  h1: ({ children }) => <h3 className="mt-5 text-[15px] font-semibold text-foreground first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-5 text-[15px] font-semibold text-foreground first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-4 text-[14px] font-semibold text-foreground">{children}</h4>,
  p: ({ children }) => <p className="mt-2 text-[14px] leading-[1.6] text-foreground">{children}</p>,
  ul: ({ children }) => <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] leading-[1.6] text-foreground">{children}</ul>,
  ol: ({ children }) => <ol className="mt-2 list-decimal space-y-1 pl-5 text-[14px] leading-[1.6] text-foreground">{children}</ol>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
      {children}
    </a>
  ),
  code: ({ children }) => <code className="rounded bg-muted px-1 font-mono text-[12px]">{children}</code>,
  table: ({ children }) => (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-[13px]">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-border px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-b border-border px-2 py-1 align-top">{children}</td>,
};

type ApplyState = { phase: 'idle' } | { phase: 'writing' } | { phase: 'error'; message: string } | { phase: 'done' };

/** The report's «applied» record, or the route's refusal as a failure. */
async function markApplied(ownerId: string, applied: { targetsWritten: boolean; rolesChanged: number; goalsWritten: number }): Promise<void> {
  const response = await authenticatedFetch('/api/allocation-advice/applied', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: ownerId, applied }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? "Impossibile registrare l'applicazione del percorso");
  }
}

export function ConsulenteReport({ ownerId, document, assets, goalData, onRedo }: ConsulenteReportProps) {
  const queryClient = useQueryClient();
  // A run still going rereads the document while it lasts.
  useAllocationAdvice(ownerId, { enabled: document.status === 'running' });
  const revision = useConsulenteRevision(ownerId);
  const [revisionRequest, setRevisionRequest] = useState('');
  const revising = revision.state.kind === 'running';
  const proposal = document.report?.proposal ?? document.strategy?.proposal ?? null;
  // Today's Italian day once per mount: the applied verdict says when the review is near or due.
  const [todayIso] = useState(() => getItalyDateIso());
  const verdict = useMemo(() => buildConsulenteVerdict(document, todayIso), [document, todayIso]);
  const base = useMemo(() => currentAllocationOnBase(assets, calculateAssetValue), [assets]);
  const rows = useMemo(() => (proposal ? buildProposalRows(proposal, base.pctByClass) : []), [proposal, base.pctByClass]);
  const roles = useMemo(() => (proposal ? planRoleChanges(proposal, assets) : { changes: [], unmatched: [] }), [proposal, assets]);
  const goalPlan = useMemo(
    () => (proposal ? planGoalDocument(proposal, goalData, assets, removedGoalIds(document.answers), new Date()) : null),
    [proposal, goalData, assets, document.answers]
  );

  const [applyTargets, setApplyTargets] = useState(true);
  const [applyRoles, setApplyRoles] = useState(true);
  const [applyGoals, setApplyGoals] = useState(true);
  const [applyState, setApplyState] = useState<ApplyState>({ phase: 'idle' });

  const goalsCount = goalPlan ? goalPlan.created.length + goalPlan.updated.length + goalPlan.removed.length : 0;
  const rolesCount = applyRoles ? roles.changes.length : 0;
  const applySummary = describeApplySummary({ targets: applyTargets, roles: rolesCount, goals: applyGoals ? goalsCount : 0 });
  const canApply = document.status === 'ready' && !revising && proposal !== null && (applyTargets || rolesCount > 0 || (applyGoals && goalsCount > 0));

  const apply = async () => {
    if (!proposal) return;
    setApplyState({ phase: 'writing' });
    const written = { targetsWritten: false, rolesChanged: 0, goalsWritten: 0 };
    const save = async () => {
      if (applyTargets) {
        await setSettings(ownerId, { targets: buildTargetsFromProposal(proposal) });
        written.targetsWritten = true;
      }
      if (applyRoles) {
        for (const change of roles.changes) {
          await updateAssetAllocationRole(change.assetId, change.to);
          written.rolesChanged += 1;
        }
      }
      if (applyGoals && goalPlan?.document) {
        await saveGoalData(ownerId, goalPlan.document);
        written.goalsWritten = goalsCount;
      }
      await markApplied(ownerId, written);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.all(ownerId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview(ownerId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.goals.all(ownerId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.allocationAdvice.all(ownerId) }),
      ]);
    };
    await save()
      .then(() => setApplyState({ phase: 'done' }))
      .catch((error: unknown) => setApplyState({ phase: 'error', message: describeWriteError(error) }));
  };

  if (document.status === 'running') {
    const reached = document.stage ? ALLOCATION_ADVICE_STAGES.indexOf(document.stage) : -1;
    return (
      <div className="flex flex-col gap-3">
        <PageVerdict verdict={{ headline: describeRunHeadline(document.stage), tone: 'neutral', sentence: [{ text: 'Il percorso è ancora in corso: la pagina rilegge ogni fase appena viene salvata.' }] }} ariaLabel="Stato del percorso" />
        <Tile eyebrow="Le fasi" aside={`avviato il ${document.startedAt ? formatDate(document.startedAt) : '—'}`}>
          <ol className="mt-3 divide-y divide-border">
            {ALLOCATION_ADVICE_STAGES.map((item, index) => (
              <li key={item} className={cn('py-2 text-[13px]', index <= reached ? 'text-foreground' : 'text-muted-foreground')}>
                {STAGE_COPY[item].label}
                {index === reached ? ' · in corso' : index < reached ? ' · fatto' : ''}
              </li>
            ))}
          </ol>
        </Tile>
        <Button type="button" variant="outline" className="h-11 w-fit desktop:h-9" onClick={onRedo}>
          Ricomincia il percorso
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <PageVerdict verdict={verdict} ariaLabel="Verdetto del Consulente" />

      {proposal && (
        <Tile eyebrow="Allocazione proposta" aside="oggi → proposta" reading={describeProposalReading(rows)}>
          <ul className="mt-3 divide-y divide-border" aria-label="Classi">
            {rows.map((row) => (
              <li key={row.assetClass} className="py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] text-foreground">{row.label}</span>
                  <span className="shrink-0 font-mono text-[13px] tabular-nums text-foreground">
                    {formatPercentageIt(row.currentPct, 1)} → {row.fixedAmount !== undefined ? `${formatCurrency(row.fixedAmount)} fissi` : formatPercentageIt(row.proposedPct, 1)}
                    {row.fixedAmount === undefined && <span className="ml-2 text-muted-foreground">{formatSignedPoints(row.deltaPp)}</span>}
                  </span>
                </div>
                {row.subTargets.length > 0 && (
                  <ul className="mt-1 flex flex-col gap-0.5 pl-3">
                    {row.subTargets.map((sub) => (
                      <li key={sub.name} className="flex items-baseline justify-between gap-3 text-[12px] text-muted-foreground">
                        <span className="min-w-0 truncate">
                          {sub.name}
                          {sub.instrument ? ` · ${sub.instrument}` : ''}
                        </span>
                        <span className="shrink-0 font-mono tabular-nums">{formatPercentageIt(sub.pct, 0)} della classe</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-auto border-t border-border pt-3.5 text-[11px] text-muted-foreground">
            Percentuali sulla base della pagina Allocazione (negoziabile e non negoziabile, al netto dei debiti). Rivedi entro il {formatDate(new Date(proposal.reviewByIso))}: {proposal.reviewReason}
          </p>
        </Tile>
      )}

      {document.instruments && (
        <Tile
          eyebrow="Strumenti"
          aside={
            document.instruments.webSearchUsed ? (
              <span className="inline-flex items-center gap-1">
                <Globe className="h-3 w-3" aria-hidden="true" />
                verificati sul web
              </span>
            ) : (
              'senza ricerca web'
            )
          }
          reading={[{ text: document.instruments.candidates ? `${document.instruments.candidates.sleeves.length} sotto-target coperti; lo strumento già in portafoglio, quando c'è, viene prima.` : 'La ricerca ha scritto solo testo: leggilo nel report qui sotto.' }]}
        >
          {document.instruments.candidates && (
            <ul className="mt-3 divide-y divide-border" aria-label="Strumenti per sotto-target">
              {document.instruments.candidates.sleeves.map((sleeve) => (
                <li key={`${sleeve.assetClass}-${sleeve.subTarget}`} className="py-2.5">
                  <p className={TILE_SUB_EYEBROW_CLASS}>{sleeve.subTarget}</p>
                  <ul className="mt-1 flex flex-col gap-1">
                    {sleeve.candidates.map((candidate) => (
                      <li key={`${candidate.name}-${candidate.isin ?? ''}`} className="text-[13px] leading-[1.45] text-foreground">
                        <span className="font-medium">{candidate.name}</span>
                        {candidate.alreadyHeld && <span className="ml-1.5 rounded-md border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">in portafoglio</span>}
                        <span className="text-muted-foreground">
                          {candidate.isin ? ` · ${candidate.isin}` : ''}
                          {candidate.ticker ? ` · ${candidate.ticker}` : ''}
                          {candidate.ter !== undefined ? ` · TER ${formatPercentageIt(candidate.ter, 2)}` : ''}
                          {candidate.policy ? ` · ${candidate.policy}` : ''}
                          {` · ${candidate.exchange}`}
                        </span>
                        {candidate.note && <p className="text-[12px] text-muted-foreground">{candidate.note}</p>}
                      </li>
                    ))}
                  </ul>
                  {sleeve.caveat && <p className="mt-1 text-[12px] text-warning-foreground">{sleeve.caveat}</p>}
                </li>
              ))}
            </ul>
          )}
        </Tile>
      )}

      {proposal && proposal.goals.length > 0 && (
        <Tile eyebrow="Obiettivi" aside={`${proposal.goals.length} nel piano`} reading={[{ text: 'Ogni obiettivo con gli strumenti posseduti che lo coprono e la quota di ciascuno.' }]}>
          <ul className="mt-3 divide-y divide-border">
            {proposal.goals.map((goal) => (
              <li key={`${goal.goalId ?? 'new'}-${goal.name}`} className="py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-medium text-foreground">
                    {goal.name}
                    {!goal.goalId && <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">nuovo</span>}
                  </span>
                  <span className="shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground">
                    {goal.targetAmount !== undefined ? formatCurrency(goal.targetAmount) : 'senza target'}
                    {goal.targetDateIso ? ` · ${formatDate(new Date(goal.targetDateIso))}` : ''}
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {goal.assignments.length === 0 ? 'Nessuno strumento assegnato.' : goal.assignments.map((row) => `${row.assetName} ${formatPercentageIt(row.percentage, 0)}`).join(' · ')}
                </p>
                {goal.rationale && <p className="mt-0.5 text-[12px] leading-[1.45] text-foreground">{goal.rationale}</p>}
              </li>
            ))}
          </ul>
        </Tile>
      )}

      {proposal && (roles.changes.length > 0 || roles.unmatched.length > 0) && (
        <Tile eyebrow="Ruoli degli asset" aside={`${roles.changes.length} ${roles.changes.length === 1 ? 'cambio' : 'cambi'}`} reading={[{ text: 'Cosa entra nella base dei target e cosa resta fuori, rispetto a oggi.' }]}>
          <ul className="mt-3 divide-y divide-border">
            {roles.changes.map((change) => (
              <li key={change.assetId} className="py-2.5">
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="min-w-0 truncate text-foreground">{change.assetName}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {ROLE_LABEL[change.from]} → <span className="text-foreground">{ROLE_LABEL[change.to]}</span>
                  </span>
                </div>
                {change.reason && <p className="text-[12px] leading-[1.45] text-muted-foreground">{change.reason}</p>}
              </li>
            ))}
          </ul>
          {roles.unmatched.length > 0 && <p className="mt-3 text-[12px] text-warning-foreground">Non trovati fra i tuoi strumenti, ignorati: {roles.unmatched.join(', ')}.</p>}
        </Tile>
      )}

      {document.report && (
        <Tile eyebrow="Il report" aside={`${document.report.model} · ${formatDate(document.report.finishedAt)}`}>
          <div className="mt-2">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
              {document.report.markdown}
            </ReactMarkdown>
          </div>
        </Tile>
      )}

      {document.report && (
        <Tile eyebrow="Chiedi una modifica" aside={revising ? 'in corso' : `${(document.revisions ?? []).length} ${(document.revisions ?? []).length === 1 ? 'richiesta' : 'richieste'}`} reading={[{ text: REVISION_COPY.reading }]}>
          {(document.revisions ?? []).length > 0 && (
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-[13px] leading-[1.45] text-foreground" aria-label="Le richieste fatte">
              {(document.revisions ?? []).map((row) => (
                <li key={row.at.getTime()}>
                  {row.request} <span className="text-muted-foreground">· {formatDate(row.at)}</span>
                </li>
              ))}
            </ol>
          )}
          <div className="mt-3 flex flex-col gap-1.5">
            <Label htmlFor="consulente-revision">{REVISION_COPY.label}</Label>
            <Textarea id="consulente-revision" rows={3} value={revisionRequest} onChange={(event) => setRevisionRequest(event.target.value)} placeholder={REVISION_COPY.placeholder} disabled={revising} maxLength={1000} />
          </div>
          <p role="status" className={cn('mt-2 min-h-[1.25rem] text-[12px]', revision.state.kind === 'failed' ? 'text-destructive' : 'text-muted-foreground')}>
            {revision.state.kind === 'failed' ? revision.state.error : revising ? REVISION_COPY.running : ''}
          </p>
          <div className="mt-3 flex justify-end">
            <Button type="button" className="h-11 desktop:h-9" disabled={revising || revisionRequest.trim() === ''} onClick={() => revision.revise(revisionRequest.trim(), () => setRevisionRequest(''))}>
              Rivedi il report
            </Button>
          </div>
        </Tile>
      )}

      {!document.report && document.strategy && (
        <Tile eyebrow="La strategia" aside={`${document.strategy.model} · ${formatDate(document.strategy.finishedAt)}`}>
          <div className="mt-2">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
              {document.strategy.markdown}
            </ReactMarkdown>
          </div>
        </Tile>
      )}

      <Tile
        eyebrow="Applica"
        aside={document.status === 'applied' && document.applied ? `applicato il ${formatDate(document.applied.at)}` : 'niente è scritto finché non confermi'}
        reading={[{ text: document.status === 'applied' ? 'Il piano è già nelle impostazioni: rifai il percorso per cambiarlo.' : applySummary }]}
      >
        {document.status === 'ready' && proposal && (
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <Checkbox id="apply-targets" checked={applyTargets} onCheckedChange={(checked) => setApplyTargets(checked === true)} className="mt-0.5" disabled={applyState.phase === 'writing'} />
              <Label htmlFor="apply-targets" className="min-h-11 cursor-pointer leading-[1.45] desktop:min-h-0">
                I target e i sotto-target in Impostazioni → Allocazione ({rows.filter((row) => row.proposedPct > 0 || row.fixedAmount !== undefined).length} classi). Sostituiscono quelli di oggi.
              </Label>
            </div>
            <div className="flex items-start gap-3">
              <Checkbox id="apply-roles" checked={applyRoles} onCheckedChange={(checked) => setApplyRoles(checked === true)} className="mt-0.5" disabled={applyState.phase === 'writing' || roles.changes.length === 0} />
              <Label htmlFor="apply-roles" className="min-h-11 cursor-pointer leading-[1.45] desktop:min-h-0">
                I ruoli degli asset ({roles.changes.length} {roles.changes.length === 1 ? 'cambio' : 'cambi'}).
              </Label>
            </div>
            <div className="flex items-start gap-3">
              <Checkbox id="apply-goals" checked={applyGoals} onCheckedChange={(checked) => setApplyGoals(checked === true)} className="mt-0.5" disabled={applyState.phase === 'writing' || goalsCount === 0} />
              <Label htmlFor="apply-goals" className="min-h-11 cursor-pointer leading-[1.45] desktop:min-h-0">
                Gli obiettivi e le quote
                {goalPlan && goalsCount > 0
                  ? ` (${[goalPlan.created.length > 0 ? `${goalPlan.created.length} nuovi` : null, goalPlan.updated.length > 0 ? `${goalPlan.updated.length} aggiornati` : null, goalPlan.removed.length > 0 ? `${goalPlan.removed.length} eliminati` : null].filter(Boolean).join(', ')})`
                  : ' (nessuna modifica)'}
                .
              </Label>
            </div>
            {goalPlan && goalPlan.unmatched.length > 0 && <p className="text-[12px] text-warning-foreground">Quote su strumenti non trovati, ignorate: {goalPlan.unmatched.join(', ')}.</p>}
            {goalPlan && goalPlan.rescaled.length > 0 && <p className="text-[12px] text-warning-foreground">Quote ridotte perché superavano il 100% dello strumento: {goalPlan.rescaled.join(', ')}.</p>}
            <p role="status" className={cn('min-h-[1.25rem] text-[12px]', applyState.phase === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
              {applyState.phase === 'error' ? applyState.message : applyState.phase === 'writing' ? 'Scrivo…' : applyState.phase === 'done' ? 'Applicato.' : ''}
            </p>
          </div>
        )}
        <div className="mt-auto flex flex-col-reverse gap-2 border-t border-border pt-3.5 tablet:flex-row tablet:items-center tablet:justify-between">
          <Button type="button" variant="outline" className="h-11 desktop:h-9" onClick={onRedo}>
            Rifai il percorso
          </Button>
          {document.status === 'ready' && (
            <Button type="button" className="h-11 desktop:h-9" disabled={!canApply || applyState.phase === 'writing' || applyState.phase === 'done'} onClick={() => void apply()}>
              Applica alle impostazioni
            </Button>
          )}
        </div>
      </Tile>
    </div>
  );
}
