/**
 * The Consulente's contract (lib/utils/allocationAdviceProposal.ts): the answers' schema, the
 * proposal's schema and its sum rules, the candidates' schema, the fenced block lifted out of
 * the prose. Invented round figures throughout.
 */

import { describe, expect, it } from 'vitest';
import {
  ALLOCATION_PROPOSAL_BLOCK,
  allocationAdviceAnswersSchema,
  allocationAdviceProposalSchema,
  instrumentCandidatesSchema,
  parseAllocationProposal,
  parseFencedBlock,
  parseInstrumentCandidates,
  parseInstrumentCandidatesLenient,
  stripFencedBlocks,
} from '@/lib/utils/allocationAdviceProposal';
import { z } from 'zod';

const ANSWERS = {
  age: 35,
  horizonYears: 20,
  lossTolerance: 'media',
  exchange: 'Borsa Italiana (Milano, XMIL)',
  broker: 'Broker X',
  distributionPolicy: 'accumulazione',
  goals: [{ goalId: 'g1', name: 'Casa', targetAmount: 50000, targetDateIso: '2031-06-01', priority: 'alta', keep: true, note: '' }],
  goalsReflectReality: true,
  newGoalsNote: '',
  homeRole: 'excluded',
  pensionRole: 'frozen',
  privateEquityRole: 'frozen',
  keepAssets: ['ETF Mondo'],
  avoid: '',
  esg: false,
  notes: '',
};

const PROPOSAL = {
  summary: 'Più obbligazioni, meno liquidità.',
  classes: [
    { assetClass: 'equity', targetPercentage: 60, rationale: 'Orizzonte lungo.', subTargets: [{ name: 'All World', targetPercentage: 100, instrument: 'ETF Mondo' }] },
    { assetClass: 'bonds', targetPercentage: 40, rationale: 'Ammortizza.', subTargets: [] },
    { assetClass: 'cash', targetPercentage: 0, fixedAmount: 10000, rationale: 'Riserva.', subTargets: [] },
  ],
  assetRoles: [{ assetName: 'Fondo pensione', role: 'frozen', reason: 'Conta nella base.' }],
  goals: [{ goalId: 'g1', name: 'Casa', targetAmount: 50000, targetDateIso: '2031-06-01', priority: 'alta', assignments: [{ assetName: 'ETF Mondo', percentage: 40 }], rationale: 'Scadenza media.' }],
  reviewByIso: '2028-10-20',
  reviewReason: 'Due anni, o prima se la casa si avvicina.',
  risks: ['Un ribasso azionario del 30%.'],
};

describe('allocationAdviceAnswersSchema', () => {
  it('accepts the answers the screens type', () => {
    expect(allocationAdviceAnswersSchema.safeParse(ANSWERS).success).toBe(true);
  });

  it('refuses an age outside 18–100 and a goal date that is not ISO', () => {
    expect(allocationAdviceAnswersSchema.safeParse({ ...ANSWERS, age: 12 }).success).toBe(false);
    expect(allocationAdviceAnswersSchema.safeParse({ ...ANSWERS, goals: [{ ...ANSWERS.goals[0], targetDateIso: '01/06/2031' }] }).success).toBe(false);
  });
});

describe('allocationAdviceProposalSchema', () => {
  it('accepts a proposal whose percentage classes sum to 100 beside a fixed cash reserve', () => {
    expect(allocationAdviceProposalSchema.safeParse(PROPOSAL).success).toBe(true);
  });

  it('refuses classes that do not sum to 100', () => {
    const off = { ...PROPOSAL, classes: [{ ...PROPOSAL.classes[0], targetPercentage: 50 }, PROPOSAL.classes[1], PROPOSAL.classes[2]] };
    expect(allocationAdviceProposalSchema.safeParse(off).success).toBe(false);
  });

  it('tolerates half a point of rounding, no more', () => {
    const near = { ...PROPOSAL, classes: [{ ...PROPOSAL.classes[0], targetPercentage: 60.3 }, PROPOSAL.classes[1], PROPOSAL.classes[2]] };
    expect(allocationAdviceProposalSchema.safeParse(near).success).toBe(true);
    const far = { ...PROPOSAL, classes: [{ ...PROPOSAL.classes[0], targetPercentage: 61 }, PROPOSAL.classes[1], PROPOSAL.classes[2]] };
    expect(allocationAdviceProposalSchema.safeParse(far).success).toBe(false);
  });

  it('refuses sub-targets that do not sum to 100 inside their class, and a class listed twice', () => {
    const subs = { ...PROPOSAL, classes: [{ ...PROPOSAL.classes[0], subTargets: [{ name: 'A', targetPercentage: 60 }] }, PROPOSAL.classes[1], PROPOSAL.classes[2]] };
    expect(allocationAdviceProposalSchema.safeParse(subs).success).toBe(false);
    const twice = { ...PROPOSAL, classes: [PROPOSAL.classes[0], { ...PROPOSAL.classes[0], targetPercentage: 0 }, { ...PROPOSAL.classes[1], targetPercentage: 40 }] };
    expect(allocationAdviceProposalSchema.safeParse(twice).success).toBe(false);
  });

  it('refuses a class outside the app\'s enumeration and a goal allocation that does not sum to 100', () => {
    expect(allocationAdviceProposalSchema.safeParse({ ...PROPOSAL, classes: [{ ...PROPOSAL.classes[0], assetClass: 'gold', targetPercentage: 100 }] }).success).toBe(false);
    const goal = { ...PROPOSAL.goals[0], recommendedAllocation: { equity: 70, bonds: 20 } };
    expect(allocationAdviceProposalSchema.safeParse({ ...PROPOSAL, goals: [goal] }).success).toBe(false);
  });
});

describe('instrumentCandidatesSchema', () => {
  it('accepts a sleeve with verified candidates and a caveat', () => {
    const candidates = {
      sleeves: [
        {
          assetClass: 'equity',
          subTarget: 'All World',
          candidates: [{ name: 'ETF Mondo', isin: 'IE00B0000001', ticker: 'MONDO', exchange: 'Borsa Italiana', policy: 'accumulazione', ter: 0.2, alreadyHeld: true, note: 'Già in portafoglio.' }],
          caveat: 'TER non verificato per il secondo candidato.',
        },
      ],
    };
    expect(instrumentCandidatesSchema.safeParse(candidates).success).toBe(true);
  });
});

describe('parseFencedBlock', () => {
  const schema = z.object({ a: z.number() });

  it('lifts the LAST block of the language out of the prose', () => {
    const text = 'Prima bozza:\n```x\n{"a": 1}\n```\nRivista:\n```x\n{"a": 2}\n```\nFine.';
    expect(parseFencedBlock(text, 'x', schema)).toEqual({ a: 2 });
  });

  it('answers null without a block, on broken JSON and on a shape the schema refuses', () => {
    expect(parseFencedBlock('nessun blocco', 'x', schema)).toBeNull();
    expect(parseFencedBlock('```x\n{"a": \n```', 'x', schema)).toBeNull();
    expect(parseFencedBlock('```x\n{"b": 1}\n```', 'x', schema)).toBeNull();
  });

  it('parses a proposal and the candidates through their own helpers', () => {
    const text = `Testo.\n\`\`\`${ALLOCATION_PROPOSAL_BLOCK}\n${JSON.stringify(PROPOSAL)}\n\`\`\``;
    expect(parseAllocationProposal(text)?.summary).toBe('Più obbligazioni, meno liquidità.');
    expect(parseInstrumentCandidates('```instrument-candidates\n{"sleeves": []}\n```')).toEqual({ sleeves: [] });
  });

  it('strips the structure blocks from the prose a reader is shown', () => {
    const text = `Prima.\n\n\`\`\`${ALLOCATION_PROPOSAL_BLOCK}\n{}\n\`\`\`\n\n\nDopo.`;
    expect(stripFencedBlocks(text)).toBe('Prima.\n\nDopo.');
  });
});

describe('parseInstrumentCandidatesLenient (2026-10-20)', () => {
  const good = { assetClass: 'equity', subTarget: 'All World', candidates: [{ name: 'ETF Mondo', exchange: 'Borsa Italiana', note: 'ok' }] };

  it('keeps the sleeves that parse when one is written wrong, and names the refused', () => {
    const bad = { assetClass: 'moon', subTarget: 'Luna', candidates: [] };
    const text = '```instrument-candidates\n' + JSON.stringify({ sleeves: [good, bad] }) + '\n```';
    const { candidates, refused } = parseInstrumentCandidatesLenient(text);
    expect(candidates?.sleeves.map((s) => s.subTarget)).toEqual(['All World']);
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatch(/sleeve 1/);
  });

  it('keeps a sleeve whose one candidate is wrong, with the candidates that parse', () => {
    const mixed = { ...good, candidates: [good.candidates[0], { name: '', exchange: 'X', note: 'senza nome' }] };
    const { candidates, refused } = parseInstrumentCandidatesLenient('```instrument-candidates\n' + JSON.stringify({ sleeves: [mixed] }) + '\n```');
    expect(candidates?.sleeves[0].candidates.map((c) => c.name)).toEqual(['ETF Mondo']);
    expect(refused[0]).toMatch(/1 candidati rifiutati/);
  });

  it('is the plain parse when the whole block is right, and null without a block', () => {
    expect(parseInstrumentCandidatesLenient('```instrument-candidates\n' + JSON.stringify({ sleeves: [good] }) + '\n```')).toEqual({ candidates: { sleeves: [good] }, refused: [] });
    expect(parseInstrumentCandidatesLenient('nessun blocco')).toEqual({ candidates: null, refused: [] });
    expect(parseInstrumentCandidatesLenient('```instrument-candidates\n{"sleeves": 3}\n```').candidates).toBeNull();
  });
});
