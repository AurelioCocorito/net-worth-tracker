/**
 * Tests for lib/utils/monteCarloNarrative.ts — the words of FIRE › Monte Carlo: the verdict that
 * answers «quanto è probabile?» with its tone from the success rate, and the reading line of
 * every tile. Every phrasing is pinned; a missing input drops its clause instead of printing a
 * placeholder (The Narrative Honesty Rule).
 *
 * Same mocking as the other `*Narrative.test.ts`: chartService's it-IT percentage formatter
 * drags the Firebase chain in, which is mocked away.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteField: vi.fn(),
}));

import {
  buildMonteCarloVerdict,
  DETTAGLIO_DESCRIPTION,
  describeDistribuzione,
  describeDistribuzioneAside,
  describeDistribuzioneFooter,
  describeEsaurimento,
  describeEsaurimentoFooter,
  describeParametri,
  describeParametriFooter,
  describePensionInflowRow,
  describePercentili,
  describeStatePensionRow,
  describeWithdrawalTaxRow,
  describeProbabilita,
  describeProbabilitaAside,
  describeProbabilitaFooter,
  describeScenari,
  describeScenarioNote,
  describeTraiettorie,
  PARAMETRI_ASIDE,
  SCENARI_ASIDE,
  SCENARI_FOOTER,
  MONTE_CARLO_CLOSED_ASIDES,
  describeParametriClosedAside,
  describeMonteCarloClosedAnswers,
} from '@/lib/utils/monteCarloNarrative';
import { narrativeToText, splitVerdict, type Narrative } from '@/lib/utils/narrative';
import { selectMonteCarloStrip, MONTE_CARLO_SECTION_IDS } from '@/lib/utils/monteCarloSummary';
import { formatStripFigure } from '@/lib/utils/verdictStrip';
import { INACTIVE_LOCK, type FireLock } from '@/lib/utils/fireSummary';
import type { MonteCarloPlan, MonteCarloRun, ScenarioComparison, ScenarioRunSummary } from '@/lib/utils/monteCarloSummary';

/** Flattens the no-break space `Intl` puts before € so expectations read like the screen. */
const plain = (narrative: Narrative) => narrativeToText(narrative).replace(/ /g, ' ');

function makeRun(overrides: Partial<MonteCarloRun> = {}): MonteCarloRun {
  return {
    successRate: 84.21,
    successCount: 8421,
    failureCount: 1579,
    simulations: 10000,
    years: 35,
    endCalendarYear: 2061,
    endAge: 81,
    medianFinal: 612400,
    finalPercentiles: { p10: 0, p25: 118000, p50: 612400, p75: 1310000, p90: 2096000 },
    p10DepletionYear: 27,
    p10DepletionCalendarYear: 2053,
    p10DepletionAge: 73,
    failureAverageYear: 24,
    failureAverageCalendarYear: 2050,
    failureMedianYear: 26,
    failureMedianCalendarYear: 2052,
    histogram: Array.from({ length: 10 }, (_, index) => ({ from: index * 420000, to: (index + 1) * 420000, count: index === 0 ? 1579 : 936, sharePct: index === 0 ? 15.79 : 9.36, containsMedian: index === 1 })),
    histogramCap: 3780000,
    histogramMax: 4200000,
    failureYearBins: [
      { fromYear: 2041, toYear: 2045, count: 300, sharePct: 3, isReference: false },
      { fromYear: 2046, toYear: 2050, count: 500, sharePct: 5, isReference: false },
      { fromYear: 2051, toYear: 2055, count: 600, sharePct: 6, isReference: true },
      { fromYear: 2056, toYear: 2060, count: 179, sharePct: 1.79, isReference: false },
    ],
    failureYearBinWidth: 5,
    failureFirstCalendarYear: 2041,
    failureLastCalendarYear: 2060,
    ...overrides,
  };
}

function makeScenarioRow(key: ScenarioRunSummary['key'], overrides: Partial<ScenarioRunSummary> = {}): ScenarioRunSummary {
  const defaults: Record<ScenarioRunSummary['key'], ScenarioRunSummary> = {
    bear: { key: 'bear', successRate: 61.5, successCount: 6150, failureCount: 3850, medianFinal: 198000, p10DepletionCalendarYear: 2045 },
    base: { key: 'base', successRate: 84.21, successCount: 8421, failureCount: 1579, medianFinal: 612400, p10DepletionCalendarYear: 2053 },
    bull: { key: 'bull', successRate: 96.8, successCount: 9680, failureCount: 320, medianFinal: 1420000, p10DepletionCalendarYear: null },
  };
  return { ...defaults[key], ...overrides };
}

function makeComparison(overrides: Partial<ScenarioComparison> = {}): ScenarioComparison {
  return { rows: [makeScenarioRow('bear'), makeScenarioRow('base'), makeScenarioRow('bull')], spreadPoints: 35.3, ...overrides };
}

function makePlan(overrides: Partial<MonteCarloPlan> = {}): MonteCarloPlan {
  return {
    initialPortfolio: 488600,
    lockedValue: 31400,
    annualWithdrawal: 22000,
    isIndexed: true,
    years: 35,
    endAge: 81,
    endCalendarYear: 2061,
    simulations: 10000,
    allocation: [
      { key: 'equity', label: 'azioni', pct: 58 },
      { key: 'bonds', label: 'obbligazioni', pct: 27 },
      { key: 'realEstate', label: 'immobili', pct: 10 },
      { key: 'commodities', label: 'materie prime', pct: 5 },
    ],
    inflows: [{ yearOffset: 19, calendarYear: 2045, amount: 31400 }],
    statePensions: [],
    withdrawalTax: null,
    ...overrides,
  };
}

const ACTIVE_LOCK: FireLock = { active: true, lockedValue: 31400, unlockCalendarYear: 2045, unlockAge: 62, source: 'rita', lockedFundCount: 1, unmodellableCount: 0 };

describe('buildMonteCarloVerdict', () => {
  it('says what is missing when the plan cannot run', () => {
    const verdict = buildMonteCarloVerdict({ runnable: false, run: null, scenarios: null, lock: INACTIVE_LOCK });
    expect(verdict.headline).toBe('Monte Carlo non calcolabile.');
    expect(verdict.tone).toBe('neutral');
    expect(plain(verdict.sentence)).toBe('Servono un patrimonio iniziale e un prelievo annuo maggiori di zero: inseriscili nella tessera Parametri.');
  });

  it('names a run that has not produced results yet', () => {
    const verdict = buildMonteCarloVerdict({ runnable: true, run: null, scenarios: null, lock: INACTIVE_LOCK });
    expect(verdict.headline).toBe('Simulazione non ancora eseguita.');
    expect(plain(verdict.sentence)).toBe('Premi Esegui simulazione nella tessera Parametri: i tre scenari girano insieme.');
  });

  it('reads the base run: the share that holds to the age, the median, the worst tenth, the scenarios and the bridge', () => {
    const verdict = buildMonteCarloVerdict({ runnable: true, run: makeRun(), scenarios: makeComparison(), lock: ACTIVE_LOCK });
    expect(verdict.headline).toBe("Il piano regge nell'84,2% dei casi.");
    expect(verdict.tone).toBe('warning');
    expect(plain(verdict.sentence)).toBe(
      "Nell'84,2% delle 10.000 simulazioni il capitale regge fino a 81 anni (2061); nel caso mediano chiudi con 612.400 €, nel 10% peggiore i soldi finiscono entro il 2053 (73 anni). " +
        'Nello scenario orso regge nel 61,5% dei casi, nel toro nel 96,8%. Numeri con il modello ponte: i 31.400 € del fondo pensione entrano nel 2045 al valore di oggi.',
    );
  });

  it('takes the tone from the rate and elides the article by the printed figure', () => {
    expect(buildMonteCarloVerdict({ runnable: true, run: makeRun({ successRate: 95.04 }), scenarios: null, lock: INACTIVE_LOCK })).toMatchObject({ headline: 'Il piano regge nel 95% dei casi.', tone: 'positive' });
    expect(buildMonteCarloVerdict({ runnable: true, run: makeRun({ successRate: 57.3 }), scenarios: null, lock: INACTIVE_LOCK })).toMatchObject({ headline: 'Il piano regge nel 57,3% dei casi.', tone: 'negative' });
    expect(buildMonteCarloVerdict({ runnable: true, run: makeRun({ successRate: 100 }), scenarios: null, lock: INACTIVE_LOCK })).toMatchObject({ headline: 'Il piano regge in ogni simulazione.', tone: 'positive' });
    // The elision follows the Italian number name: «dieci» and «diciotto» start with a consonant, «undici» and «ottanta» with a vowel.
    expect(buildMonteCarloVerdict({ runnable: true, run: makeRun({ successRate: 10.6 }), scenarios: null, lock: INACTIVE_LOCK }).headline).toBe('Il piano regge nel 10,6% dei casi.');
    expect(buildMonteCarloVerdict({ runnable: true, run: makeRun({ successRate: 18.2 }), scenarios: null, lock: INACTIVE_LOCK }).headline).toBe('Il piano regge nel 18,2% dei casi.');
    expect(buildMonteCarloVerdict({ runnable: true, run: makeRun({ successRate: 11 }), scenarios: null, lock: INACTIVE_LOCK }).headline).toBe("Il piano regge nell'11% dei casi.");
  });

  it('reads the horizon in years when no age is saved, and the tenth that survives with its floor', () => {
    const run = makeRun({ endAge: null, p10DepletionYear: null, p10DepletionCalendarYear: null, p10DepletionAge: null, finalPercentiles: { p10: 118000, p25: 300000, p50: 612400, p75: 1310000, p90: 2096000 } });
    const verdict = buildMonteCarloVerdict({ runnable: true, run, scenarios: null, lock: INACTIVE_LOCK });
    expect(plain(verdict.sentence)).toBe("Nell'84,2% delle 10.000 simulazioni il capitale regge per 35 anni (fino al 2061); nel caso mediano chiudi con 612.400 €, e anche nel 10% peggiore chiudi con almeno 118.000 €.");
  });

  it('says the median case runs out when the median final value is zero', () => {
    const run = makeRun({ successRate: 41, medianFinal: 0, finalPercentiles: { p10: 0, p25: 0, p50: 0, p75: 200000, p90: 700000 }, p10DepletionCalendarYear: 2040, p10DepletionAge: 60 });
    const verdict = buildMonteCarloVerdict({ runnable: true, run, scenarios: null, lock: INACTIVE_LOCK });
    expect(plain(verdict.sentence)).toBe('Nel 41% delle 10.000 simulazioni il capitale regge fino a 81 anni (2061); nel caso mediano i soldi finiscono prima del 2061, nel 10% peggiore entro il 2040 (60 anni).');
  });

  it('drops the bridge clause without a lock and the scenario clause without a comparison', () => {
    const verdict = buildMonteCarloVerdict({ runnable: true, run: makeRun(), scenarios: null, lock: INACTIVE_LOCK });
    expect(plain(verdict.sentence)).not.toContain('modello ponte');
    expect(plain(verdict.sentence)).not.toContain('scenario orso');
  });
});

describe('Probabilità', () => {
  it('counts the survivors and dates the average failure', () => {
    expect(plain(describeProbabilita(makeRun()))).toBe("8421 simulazioni su 10.000 arrivano al 2061 con capitale positivo; le 1579 che falliscono esauriscono il capitale in media nell'anno 24 (2050).");
  });

  it('says so when nothing fails, and reads one failure in the singular', () => {
    expect(plain(describeProbabilita(makeRun({ failureCount: 0, successCount: 10000, failureAverageYear: null, failureAverageCalendarYear: null })))).toBe('Tutte le 10.000 simulazioni arrivano al 2061 con capitale positivo.');
    expect(plain(describeProbabilita(makeRun({ failureCount: 1, successCount: 9999, failureAverageYear: 30, failureAverageCalendarYear: 2056 })))).toBe("9999 simulazioni su 10.000 arrivano al 2061 con capitale positivo; l'unica che fallisce esaurisce il capitale nell'anno 30 (2056).");
  });

  it('names the scope in the aside and the legend in the footer, with the step only when a fund enters', () => {
    expect(describeProbabilitaAside(makeRun())).toBe('scenario base · 10.000 simulazioni · 35 anni');
    expect(plain(describeProbabilitaFooter(makeRun(), ACTIVE_LOCK))).toBe(
      'La linea è la mediana delle 10.000 traiettorie, le bande il 25–75 e il 10–90; la tratteggiata in basso è il capitale esaurito. Il gradino nel 2045 è il fondo pensione che entra, al valore di oggi. Valori nominali: il prelievo cresce con l\'inflazione.',
    );
    expect(plain(describeProbabilitaFooter(makeRun(), INACTIVE_LOCK))).not.toContain('gradino');
  });
});

describe('Distribuzione', () => {
  it('reads the three quartile bounds of the final values', () => {
    expect(plain(describeDistribuzione(makeRun()))).toBe('Metà delle simulazioni chiude sopra 612.400 €, un quarto sopra 1.310.000 € e un quarto sotto 118.000 €, zero compreso.');
  });

  it('says a quarter runs out when the 25th percentile is zero, and more than half when the median is', () => {
    expect(plain(describeDistribuzione(makeRun({ finalPercentiles: { p10: 0, p25: 0, p50: 612400, p75: 1310000, p90: 2096000 } })))).toBe('Metà delle simulazioni chiude sopra 612.400 €, un quarto sopra 1.310.000 € e almeno un quarto finisce i soldi.');
    expect(plain(describeDistribuzione(makeRun({ medianFinal: 0, finalPercentiles: { p10: 0, p25: 0, p50: 0, p75: 200000, p90: 700000 } })))).toBe('Più di metà delle simulazioni finisce i soldi; un quarto chiude sopra 200.000 €.');
  });

  it('names the window and the bins', () => {
    expect(describeDistribuzioneAside(makeRun())).toBe('valori finali nel 2061 · scenario base');
    expect(plain(describeDistribuzioneFooter(makeRun()))).toBe(
      "Dieci classi di uguale ampiezza fino al 95° percentile (3.780.000 €); l'ultima raccoglie anche gli esiti oltre, fino a 4.200.000 €, la prima le simulazioni finite a zero; la classe con il bordo contiene la mediana. Valori nominali del 2061, scenario base.",
    );
  });
});

describe('describeEsaurimento', () => {
  it('dates the failed simulations: first, last and the median', () => {
    // Four digits print ungrouped in it-IT («1579»), five grouped («10.000»).
    expect(plain(describeEsaurimento(makeRun()))).toBe('Le 1579 simulazioni che falliscono esauriscono il capitale tra il 2041 e il 2060, la metà entro il 2052.');
  });

  it('says none fail, and names the horizon', () => {
    expect(plain(describeEsaurimento(makeRun({ failureCount: 0, failureFirstCalendarYear: null, failureLastCalendarYear: null })))).toBe(
      'Nessuna simulazione esaurisce il capitale entro il 2061.',
    );
  });

  it('reads a single failure in the singular, and one shared year as «tutte»', () => {
    expect(plain(describeEsaurimento(makeRun({ failureCount: 1, failureFirstCalendarYear: 2050, failureLastCalendarYear: 2050 })))).toBe(
      "L'unica simulazione che fallisce esaurisce il capitale nel 2050.",
    );
    expect(plain(describeEsaurimento(makeRun({ failureCount: 3, failureFirstCalendarYear: 2050, failureLastCalendarYear: 2050 })))).toBe(
      'Le 3 simulazioni che falliscono esauriscono il capitale tutte nel 2050.',
    );
  });

  it('names the bin width and the denominator in the footer', () => {
    expect(plain(describeEsaurimentoFooter(makeRun()))).toBe(
      "Una classe ogni 5 anni tra il primo e l'ultimo esaurimento; la classe con il bordo contiene la mediana dei fallimenti, le quote sono sul totale delle 10.000 simulazioni. Scenario base.",
    );
    expect(plain(describeEsaurimentoFooter(makeRun({ failureYearBinWidth: 1 })))).toContain('Una classe per anno');
  });
});

describe('Scenari a confronto', () => {
  it('reads bear and bull with the spread in points', () => {
    expect(plain(describeScenari(makeComparison()))).toBe('Lo scenario orso regge nel 61,5% dei casi, il toro nel 96,8%: 35 punti di distanza attorno al base.');
  });

  it('says the scenarios coincide under half a point', () => {
    expect(plain(describeScenari(makeComparison({ spreadPoints: 0.2 })))).toBe('Lo scenario orso regge nel 61,5% dei casi, il toro nel 96,8%: i tre scenari non si distinguono.');
  });

  it('writes each row note with the median and the worst tenth', () => {
    expect(plain(describeScenarioNote(makeScenarioRow('bear')))).toBe('mediana finale 198.000 € · nel 10% peggiore esaurito nel 2045');
    expect(plain(describeScenarioNote(makeScenarioRow('bull')))).toBe('mediana finale 1.420.000 € · anche il 10% peggiore regge');
    expect(plain(describeScenarioNote(makeScenarioRow('bear', { medianFinal: 0 })))).toBe('nel caso mediano i soldi finiscono · nel 10% peggiore esaurito nel 2045');
  });

  it('exposes the aside and the footer', () => {
    expect(SCENARI_ASIDE).toBe('stesso piano, mercati diversi');
    expect(plain(SCENARI_FOOTER)).toContain('La riga Base è il riferimento delle altre tessere');
  });
});

describe('Parametri', () => {
  it('states the plan as typed, the locked fund named, the allocation listed', () => {
    expect(plain(describeParametri(makePlan()))).toBe(
      'Parti da 488.600 € — il patrimonio senza i 31.400 € del fondo pensione bloccato — e prelevi 22.000 € l\'anno, indicizzati all\'inflazione, per 35 anni, con il 58% in azioni, il 27% in obbligazioni, il 10% in immobili e il 5% in materie prime.',
    );
  });

  it('drops the lock aside without a locked fund and reads a fixed withdrawal', () => {
    expect(plain(describeParametri(makePlan({ lockedValue: 0, isIndexed: false, allocation: [{ key: 'equity', label: 'azioni', pct: 60 }, { key: 'bonds', label: 'obbligazioni', pct: 40 }] })))).toBe(
      'Parti da 488.600 € e prelevi 22.000 € l\'anno, fissi, per 35 anni, con il 60% in azioni e il 40% in obbligazioni.',
    );
  });

  it('reads the pension row and the run state in the footer', () => {
    expect(plain(describePensionInflowRow({ yearOffset: 19, calendarYear: 2045, amount: 31400 }))).toBe("Fondo pensione: +31.400 € aggiunti da soli nell'anno 19 (2045), al valore di oggi.");
    expect(plain(describeStatePensionRow({ yearOffset: 34, calendarYear: 2060, annualNetToday: 13000 }))).toBe("Pensione statale: −13.000 € l'anno tolti dal prelievo dall'anno 34 (2060), netti, al valore di oggi.");
    expect(plain(describeStatePensionRow({ yearOffset: 0, calendarYear: 2026, annualNetToday: 13000 }))).toBe("Pensione statale: −13.000 € l'anno tolti dal prelievo da subito, netti, al valore di oggi.");
    expect(plain(describeWithdrawalTaxRow({ rate: 26, gainSharePct: 40 }))).toBe('Tasse sui prelievi: ogni prelievo vende quanto serve a pagare il 26% sulla plusvalenza (40% del capitale oggi).');
    expect(plain(describeWithdrawalTaxRow(null))).toBe('Tasse sui prelievi: non stimate, nessun PMC in euro nel portafoglio.');
    expect(plain(describeParametriFooter({ stale: false, simulations: 10000 }))).toBe('Ultima esecuzione con questi parametri · 30.000 traiettorie, 10.000 per scenario.');
    expect(plain(describeParametriFooter({ stale: true, simulations: 10000 }))).toBe("I risultati sopra usano i parametri dell'ultima esecuzione: premi Esegui simulazione per aggiornarli.");
    expect(PARAMETRI_ASIDE).toBe('esplorazione, non salvati · gli scenari si salvano nel profilo');
  });
});

describe('Dettaglio', () => {
  it('reads the three medians against the same start', () => {
    expect(plain(describeTraiettorie(makeComparison(), makePlan()))).toBe("Le tre mediane partono dagli stessi 488.600 €; nel 2061 l'orso chiude a 198.000 €, il base a 612.400 €, il toro a 1.420.000 €.");
    expect(plain(describeTraiettorie(makeComparison({ rows: [makeScenarioRow('bear', { medianFinal: 0 }), makeScenarioRow('base'), makeScenarioRow('bull')] }), makePlan()))).toBe(
      "Le tre mediane partono dagli stessi 488.600 €; nel 2061 l'orso finisce i soldi, il base chiude a 612.400 €, il toro a 1.420.000 €.",
    );
  });

  it('dates the 10th percentile at zero, or names its floor', () => {
    expect(plain(describePercentili(makeRun()))).toBe('Il 10° percentile scende a zero dal 2053: da lì in poi almeno una simulazione su dieci ha finito i soldi.');
    expect(plain(describePercentili(makeRun({ p10DepletionCalendarYear: null, finalPercentiles: { p10: 118000, p25: 300000, p50: 612400, p75: 1310000, p90: 2096000 } })))).toBe('Nessun percentile tocca zero: anche il 10° chiude il 2061 con 118.000 €.');
    expect(DETTAGLIO_DESCRIPTION).toBe('Traiettorie dei tre scenari, percentili a passi di 5 anni, come funziona');
  });
});

// ─── The phone's cut and the strip's identity (2026-10-15) ────────────────────
// Seen red one at a time: `leadLength` left `undefined` with a scenarios sentence; the bear cell
// read from `medianFinal`; the rest labelled «orso e toro e il fondo pensione».

describe('buildMonteCarloVerdict — the cut (doc/mobile/README.md § 9, decisions 5 and 44)', () => {
  it('keeps the base run under the title, the bear, the bull and the bridge behind «Il perché»', () => {
    const verdict = buildMonteCarloVerdict({ runnable: true, run: makeRun(), scenarios: makeComparison(), lock: ACTIVE_LOCK });
    const { lead, rest } = splitVerdict(verdict);
    expect(plain(lead)).toMatch(/^Nell'84,2% delle 10\.000 simulazioni .* entro il 2053 \(73 anni\)\.$/);
    expect(plain(rest)).toBe(' Nello scenario orso regge nel 61,5% dei casi, nel toro nel 96,8%. Numeri con il modello ponte: i 31.400 € del fondo pensione entrano nel 2045 al valore di oggi.');
    expect(verdict.restLabel).toBe('orso, toro e il fondo pensione');
    expect(buildMonteCarloVerdict({ runnable: true, run: makeRun(), scenarios: makeComparison(), lock: INACTIVE_LOCK }).restLabel).toBe('orso e toro');
    expect(buildMonteCarloVerdict({ runnable: true, run: makeRun(), scenarios: null, lock: ACTIVE_LOCK }).restLabel).toBe('il fondo pensione');
    expect(buildMonteCarloVerdict({ runnable: true, run: makeRun(), scenarios: null, lock: INACTIVE_LOCK }).leadLength).toBeUndefined();
    expect(buildMonteCarloVerdict({ runnable: true, run: null, scenarios: null, lock: ACTIVE_LOCK }).leadLength).toBeUndefined();
  });

  it('prints in the cells the median and the bear rate the verdict prints', () => {
    const [median, bear] = selectMonteCarloStrip({ run: makeRun(), comparison: makeComparison() });
    const flat = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ');
    const verdict = flat(plain(buildMonteCarloVerdict({ runnable: true, run: makeRun(), scenarios: makeComparison(), lock: INACTIVE_LOCK }).sentence));
    expect(verdict).toContain(`nel caso mediano chiudi con ${flat(formatStripFigure(median)!.text)}`);
    expect(verdict).toContain(`Nello scenario orso regge nel ${formatStripFigure(bear)!.text}`);
    const exhausted = buildMonteCarloVerdict({ runnable: true, run: makeRun({ medianFinal: 0 }), scenarios: null, lock: INACTIVE_LOCK });
    expect(plain(exhausted.sentence)).toContain('nel caso mediano i soldi finiscono');
    expect(selectMonteCarloStrip({ run: makeRun({ medianFinal: 0 }), comparison: null })[0].reason).toBe('i soldi finiscono');
  });
});

// ─── The shown run outlives the typed form, and the closed rows' words (2026-10-16, in the retirement) ──
// Seen red: `runnable` read before `run` (a typed capital of zero turned the headline into «non
// calcolabile» while the strip under it still printed the shown run's Mediana and Orso); the
// Parametri aside returning the fresh words whatever `stale` (a stale plan went unannounced from a closed row).

describe('buildMonteCarloVerdict — the shown run outlives the typed form', () => {
  it('reads the run on screen while the typed plan cannot run: verdict, strip and tiles print ONE run', () => {
    const shown = buildMonteCarloVerdict({ runnable: true, run: makeRun(), scenarios: makeComparison(), lock: INACTIVE_LOCK });
    const typedZero = buildMonteCarloVerdict({ runnable: false, run: makeRun(), scenarios: makeComparison(), lock: INACTIVE_LOCK });
    expect(typedZero).toEqual(shown);
    expect(buildMonteCarloVerdict({ runnable: false, run: null, scenarios: null, lock: INACTIVE_LOCK }).headline).toBe('Monte Carlo non calcolabile.');
  });
});

describe('the closed rows\' asides — words, never a figure', () => {
  it('names Distribuzione and Scenari without a digit, and Parametri by whether the typed plan is the shown one', () => {
    expect(MONTE_CARLO_CLOSED_ASIDES).toEqual({ [MONTE_CARLO_SECTION_IDS.distribuzione]: 'valori finali', [MONTE_CARLO_SECTION_IDS.scenari]: 'orso, base e toro' });
    for (const aside of Object.values(MONTE_CARLO_CLOSED_ASIDES)) expect(aside).not.toMatch(/\d/);
    expect(describeParametriClosedAside(false)).toBe('il piano di oggi');
    expect(describeParametriClosedAside(true)).toBe('modificati: premi Esegui');
  });
});

// ─── The closed rows' answers in the landscape index (2026-10-16) ─────────────
// Falsified on 2026-10-16, one at a time: «a stale form keeps its warning» went red with the
// `!stale` guard dropped (the withdrawal covered «modificati: premi Esegui»), and «a depleted 90th
// percentile» went red with the `p90 <= 0` branch removed («90° %ile 0 €»).

describe('describeMonteCarloClosedAnswers', () => {
  /** What the index shows: each segment trimmed, joined by the gap the row draws between them. */
  const visible = (answer: Narrative | null | undefined) =>
    answer ? answer.map((segment) => segment.text.trim()).join(' ').replace(/[  ]/g, ' ') : answer;
  const answers = (over: Partial<Parameters<typeof describeMonteCarloClosedAnswers>[0]> = {}) =>
    describeMonteCarloClosedAnswers({ run: makeRun({ finalPercentiles: { p10: 0, p25: 100_000, p50: 600_000, p75: 1_300_000, p90: 2_000_000 } }), comparison: makeComparison(), plan: makePlan({ annualWithdrawal: 30_000 }), stale: false, ...over });

  it('answers each row with a figure the strip and the verdict do not print, in at most 22 characters', () => {
    const all = answers();
    expect(visible(all[MONTE_CARLO_SECTION_IDS.distribuzione])).toBe('90° %ile 2.000.000 €');
    expect(visible(all[MONTE_CARLO_SECTION_IDS.scenari])).toBe('Toro 96,8%');
    expect(visible(all[MONTE_CARLO_SECTION_IDS.parametri])).toBe('prelievo 30.000 €');
    for (const answer of Object.values(all)) expect([...(visible(answer) ?? '')].length).toBeLessThanOrEqual(22);
    // A rate never wears a sign colour: it is a probability, not a gain.
    expect(all[MONTE_CARLO_SECTION_IDS.scenari]?.some((segment) => segment.sign)).toBe(false);
  });

  it('says a depleted 90th percentile «esaurito», as the tile does, and a whole rate without decimals', () => {
    const depleted = answers({ run: makeRun({ finalPercentiles: { p10: 0, p25: 0, p50: 0, p75: 0, p90: 0 } }) });
    expect(visible(depleted[MONTE_CARLO_SECTION_IDS.distribuzione])).toBe('90° %ile esaurito');
    const whole = answers({ comparison: makeComparison({ rows: [makeScenarioRow('bear'), makeScenarioRow('base'), makeScenarioRow('bull', { successRate: 99.98 })] }) });
    expect(visible(whole[MONTE_CARLO_SECTION_IDS.scenari])).toBe('Toro 100%');
  });

  it('keeps the scope: no run, no comparison, a stale form', () => {
    const none = answers({ run: null, comparison: null });
    expect(Object.values(none).every((answer) => answer === null)).toBe(true);
    expect(answers({ comparison: null })[MONTE_CARLO_SECTION_IDS.scenari]).toBeNull();
    expect(answers({ stale: true })[MONTE_CARLO_SECTION_IDS.parametri]).toBeNull();
  });
});
