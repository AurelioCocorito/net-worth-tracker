/**
 * Every sentence of the Consulente (2026-10-20): the screens' questions and readings, the
 * run's stages, the report's verdict and tile readings, the «rivedi entro» line the
 * Allocazione header prints. Pure; no component writes copy.
 */

import type { Narrative, PageVerdictModel } from '@/lib/utils/narrative';
import { ASSET_CLASS_LABELS } from '@/lib/utils/allocationUtils';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import type { AllocationAdviceDocument, AllocationAdviceStage, AllocationAdviceStep } from '@/types/allocationAdvice';
import type { AllocationAdviceProposal } from '@/lib/utils/allocationAdviceProposal';

const prose = (text: string): Narrative[number] => ({ text });
const figure = (text: string): Narrative[number] => ({ text, mono: true });

// ─── The screens ──────────────────────────────────────────────────────────────

export const STEP_COPY: Record<AllocationAdviceStep, { eyebrow: string; question: string; help: string }> = {
  profilo: {
    eyebrow: 'Chi sei',
    question: 'Quanti anni hai e per quanti anni investi?',
    help: "L'orizzonte è il tempo prima di cui non ti serve toccare questi soldi. Più è lungo, più il piano può reggere oscillazioni.",
  },
  tolleranza: {
    eyebrow: 'Le perdite',
    question: 'Quanto reggi a vedere il portafoglio in rosso?',
    help: 'Le tre cifre sono calcolate sulla base della tua Allocazione di oggi: non una percentuale astratta, i tuoi euro.',
  },
  borsa: {
    eyebrow: 'Dove compri',
    question: 'Su quale borsa compri, e con quale broker?',
    help: 'Il secondo agente cerca strumenti quotati lì, con ISIN e ticker verificati.',
  },
  politica: {
    eyebrow: 'I proventi',
    question: 'Preferisci strumenti ad accumulazione o a distribuzione?',
    help: 'Ad accumulazione reinvestono dividendi e cedole; a distribuzione li incassi. Per chi accumula la prima è quasi sempre più efficiente fiscalmente.',
  },
  obiettivi: {
    eyebrow: 'Gli obiettivi',
    question: 'Questi obiettivi rispecchiano la realtà?',
    help: 'Uno per schermata: confermalo, correggilo o segnalo da eliminare. Alla fine puoi dire cosa manca: il Consulente lo proporrà con gli strumenti giusti.',
  },
  ruoli: {
    eyebrow: 'Casa, pensione, illiquidi',
    question: 'Cosa conta nella tua allocazione e cosa resta fuori?',
    help: '«Non negoziabile» conta nelle percentuali ma i piani non lo toccano: un fondo pensione obbligazionario abbassa l\'obbligazionario da comprare. «Escluso» è fuori da tutto: la casa in cui vivi.',
  },
  vincoli: {
    eyebrow: 'I vincoli',
    question: 'Cosa vuoi tenere, cosa evitare?',
    help: "Uno strumento da tenere resta nel piano anche se il Consulente ne preferirebbe un altro; un'esclusione vale per la ricerca.",
  },
  riepilogo: {
    eyebrow: 'Riepilogo',
    question: 'Tutto giusto? Avvio la ricerca.',
    help: 'Due agenti: uno propone la strategia e la rivede alla fine, l\'altro cerca sul web gli strumenti per ogni sotto-target. Qualche minuto.',
  },
};

export const LOSS_TOLERANCE_OPTIONS = [
  { value: 'bassa' as const, label: 'Bassa', description: 'Un −10% mi farebbe vendere o dormire male.' },
  { value: 'media' as const, label: 'Media', description: 'Reggerei un −25% senza vendere, con fatica.' },
  { value: 'alta' as const, label: 'Alta', description: 'Reggerei un −40% senza vendere, e comprerei ancora.' },
];

export const DISTRIBUTION_POLICY_OPTIONS = [
  { value: 'accumulazione' as const, label: 'Accumulazione', description: 'Reinveste i proventi, nessuna tassazione annua sui dividendi.' },
  { value: 'distribuzione' as const, label: 'Distribuzione', description: 'Incassi dividendi e cedole in conto.' },
  { value: 'indifferente' as const, label: 'Scegli tu', description: 'Il Consulente motiva la scelta.' },
];

export const EXCHANGE_OPTIONS = ['Borsa Italiana (Milano, XMIL)', 'Xetra (Francoforte)', 'Euronext (Parigi / Amsterdam)', 'London Stock Exchange'];
/** The value of the list's last row: a free text field opens under it (2026-10-20). */
export const EXCHANGE_OTHER = 'other';
export const EXCHANGE_OTHER_LABEL = 'Altra…';
/** An exchange the list knows, or not: the field decides whether to show the free text. */
export function isListedExchange(exchange: string): boolean {
  return EXCHANGE_OPTIONS.includes(exchange);
}

/** «−10% sono 6000 €» — the loss scenario rows of step 2. */
export function describeLossScenario(pct: number, eur: number): Narrative {
  return [figure(`−${pct}%`), prose(' sarebbero '), figure(formatCurrency(eur, 'EUR', 0)), prose(' in meno.')];
}

/** «Chiedi una modifica» on the report (2026-10-20): what it does, in the tile's words. */
export const REVISION_COPY = {
  reading: 'Una richiesta rilancia solo la revisione (Opus 5.5, un paio di minuti): strategia e strumenti restano, il report e la proposta vengono riscritti e «Applica» scrive quelli nuovi.',
  label: 'Cosa vuoi cambiare',
  placeholder: 'es. vorrei liberarmi degli ETF obbligazionari e concentrarmi sui bond singoli, per arrivare a 50.000 € in titoli di Stato',
  running: 'Rivedo il report con la tua richiesta…',
} as const;

// ─── The run ──────────────────────────────────────────────────────────────────

export const STAGE_COPY: Record<AllocationAdviceStage, { label: string; detail: string }> = {
  context: { label: 'Leggo il portafoglio', detail: 'Strumenti, allocazione, registro, obiettivi, previdenza, famiglia.' },
  strategy: { label: 'Propongo la strategia', detail: 'Opus 5.5 ragiona su orizzonte, tolleranza, obiettivi e vincoli.' },
  instruments: { label: 'Cerco gli strumenti', detail: 'Sonnet 5.5 verifica sul web quotazione, ISIN e costi sulla tua borsa.' },
  review: { label: 'Rivedo il tutto', detail: 'Opus 5.5 unisce strategia e strumenti nel report finale.' },
};

export function describeRunHeadline(stage: AllocationAdviceStage | null): string {
  if (stage === null) return 'Avvio il percorso.';
  return `${STAGE_COPY[stage].label}.`;
}

// ─── The report ───────────────────────────────────────────────────────────────

/** The report page's verdict: the proposal's summary as the sentence, the headline by status. */
export function buildConsulenteVerdict(document: AllocationAdviceDocument): PageVerdictModel {
  const proposal = document.report?.proposal ?? document.strategy?.proposal ?? null;
  if (document.status === 'failed') {
    return {
      headline: 'Il percorso non si è concluso.',
      tone: 'negative',
      sentence: [prose(document.error ?? 'Riprova fra qualche istante.')],
    };
  }
  if (document.status === 'applied' && document.applied) {
    return {
      headline: 'Allocazione applicata.',
      tone: 'positive',
      sentence: [
        prose(`Scritta il ${formatDate(document.applied.at)}`),
        ...(proposal ? [prose('; da rivedere entro il '), figure(formatDate(new Date(proposal.reviewByIso))), prose('.')] : [prose('.')]),
      ],
    };
  }
  if (!proposal) {
    return {
      headline: 'Il Consulente ha scritto il report, senza una proposta leggibile.',
      tone: 'warning',
      sentence: [prose("Leggi il testo qui sotto; «Applica» non è disponibile perché il blocco strutturato non è valido. Rifai il percorso per ottenerne uno.")],
    };
  }
  return {
    headline: 'La proposta è pronta.',
    tone: 'neutral',
    sentence: [prose(proposal.summary.trim()), prose(' Da rivedere entro il '), figure(formatDate(new Date(proposal.reviewByIso))), prose('.')],
  };
}

export interface ProposalClassRow {
  assetClass: string;
  label: string;
  currentPct: number;
  proposedPct: number;
  /** Set on a fixed cash reserve. */
  fixedAmount?: number;
  deltaPp: number;
  subTargets: { name: string; pct: number; instrument?: string }[];
}

/** Current vs proposed, class by class, the classes of the proposal first and the held ones it drops after. */
export function buildProposalRows(proposal: AllocationAdviceProposal, currentPctByClass: Record<string, number>): ProposalClassRow[] {
  const rows: ProposalClassRow[] = proposal.classes.map((cls) => {
    const currentPct = currentPctByClass[cls.assetClass] ?? 0;
    const proposedPct = cls.fixedAmount !== undefined ? 0 : cls.targetPercentage;
    return {
      assetClass: cls.assetClass,
      label: ASSET_CLASS_LABELS[cls.assetClass] ?? cls.assetClass,
      currentPct,
      proposedPct,
      ...(cls.fixedAmount !== undefined ? { fixedAmount: cls.fixedAmount } : {}),
      deltaPp: cls.fixedAmount !== undefined ? 0 : proposedPct - currentPct,
      subTargets: cls.subTargets.map((sub) => ({ name: sub.name, pct: sub.targetPercentage, ...(sub.instrument ? { instrument: sub.instrument } : {}) })),
    };
  });
  const named = new Set<string>(proposal.classes.map((cls) => cls.assetClass));
  for (const [assetClass, currentPct] of Object.entries(currentPctByClass)) {
    if (named.has(assetClass) || currentPct <= 0) continue;
    rows.push({ assetClass, label: ASSET_CLASS_LABELS[assetClass] ?? assetClass, currentPct, proposedPct: 0, deltaPp: -currentPct, subTargets: [] });
  }
  return rows;
}

/** «Azioni passa dal 47% al 55%; Obbligazioni dal 7% al 15%.» — the two largest moves, or «nessuna classe si muove di più di un punto». */
export function describeProposalReading(rows: ProposalClassRow[]): Narrative {
  const moves = rows.filter((row) => Math.abs(row.deltaPp) >= 1).sort((a, b) => Math.abs(b.deltaPp) - Math.abs(a.deltaPp)).slice(0, 2);
  if (moves.length === 0) return [prose('Nessuna classe si muove di più di un punto rispetto a oggi.')];
  const out: Narrative = [];
  moves.forEach((row, index) => {
    if (index > 0) out.push(prose('; '));
    out.push(prose(`${row.label} passa dal `), figure(`${Math.round(row.currentPct)}%`), prose(' al '), figure(`${Math.round(row.proposedPct)}%`));
  });
  out.push(prose('.'));
  return out;
}

export function describeApplySummary(input: { targets: boolean; roles: number; goals: number }): string {
  const parts: string[] = [];
  if (input.targets) parts.push('i target in Impostazioni → Allocazione');
  if (input.roles > 0) parts.push(`${input.roles} ${input.roles === 1 ? 'ruolo' : 'ruoli'} degli asset`);
  if (input.goals > 0) parts.push(`${input.goals} ${input.goals === 1 ? 'obiettivo' : 'obiettivi'}`);
  if (parts.length === 0) return 'Niente selezionato: scegli almeno una voce.';
  return `Scrive ${parts.join(', ')}. Puoi sempre cambiarli a mano dopo.`;
}

/** The Allocazione header's line when a plan has a review date («Piano applicato il 20/10/2026 · rivedi entro il 20/10/2028»). */
export function describeReviewBy(document: AllocationAdviceDocument | null | undefined): string | null {
  if (!document || document.status !== 'applied' || !document.applied) return null;
  const proposal = document.report?.proposal ?? document.strategy?.proposal ?? null;
  if (!proposal) return `Piano del Consulente applicato il ${formatDate(document.applied.at)}`;
  return `Piano del Consulente applicato il ${formatDate(document.applied.at)} · rivedi entro il ${formatDate(new Date(proposal.reviewByIso))}`;
}
