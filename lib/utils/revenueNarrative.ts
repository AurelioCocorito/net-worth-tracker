/**
 * FATTURATO — the words of Cashflow › Fatturati, pure. Every figure comes from a
 * `RevenueSummary` (revenueStats.ts); this module only says it.
 */

import type { Narrative, NarrativeSegment, PageVerdictModel } from '@/lib/utils/narrative';
import type { RevenueMonthStat, RevenueSummary, RevenueYearToDate } from '@/lib/utils/revenueStats';
import { MONTH_NAMES } from '@/lib/constants/months';
import { formatEuroMinus, formatPercentageIt, formatSignedPercentIt, printedSign } from '@/lib/utils/formatters';

const prose = (text: string): NarrativeSegment => ({ text });
const figure = (text: string): NarrativeSegment => ({ text, mono: true });
const euro = (value: number) => figure(formatEuroMinus(value));

export function revenueMonthName(month: number): string {
  return MONTH_NAMES[month - 1].toLowerCase();
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function yearToDateClause(ytd: RevenueYearToDate): Narrative {
  const span = ytd.upToMonth === 1 ? `A gennaio ${ytd.year}` : `Da gennaio a ${revenueMonthName(ytd.upToMonth)} ${ytd.year}`;
  const head: Narrative = [prose(`${span} hai fatturato `), euro(ytd.current)];
  if (ytd.deltaPct === null) {
    return [...head, prose(`, contro `), euro(ytd.previous), prose(` nello stesso periodo del ${ytd.previousYear}.`)];
  }
  const sign = printedSign(ytd.deltaPct, 0);
  return [
    ...head,
    prose(', '),
    {
      text: formatSignedPercentIt(ytd.deltaPct, 0),
      mono: true,
      ...(sign > 0 ? { sign: 'positive' as const } : sign < 0 ? { sign: 'negative' as const } : {}),
    },
    prose(` sullo stesso periodo del ${ytd.previousYear}.`),
  ];
}

/**
 * The page's verdict. Headline: the strongest month when there is one to name; sentence: what a
 * month usually invoices, the strongest and the weakest month, the year so far against the last.
 *
 * @param clientLabel The client the page is filtered on, `null` for every client.
 */
export function buildRevenueVerdict(summary: RevenueSummary, clientLabel: string | null): PageVerdictModel {
  const scope = clientLabel ? ` per ${clientLabel}` : '';
  if (summary.recordedMonths === 0) {
    return {
      headline: clientLabel ? `Nessun fatturato registrato per ${clientLabel}` : 'Nessun fatturato registrato',
      tone: 'neutral',
      sentence: [
        prose(
          'Registra quanto hai fatturato in ogni mese di competenza, a mano o con un CSV del tuo foglio: con due o più anni la pagina dice quali mesi fatturano di più e quanto vale un mese tipico.'
        ),
      ],
    };
  }

  const headline = summary.strongest
    ? `${MONTH_NAMES[summary.strongest.month - 1]} è il mese più forte${scope}`
    : `Fatturato di ${summary.recordedMonths} ${plural(summary.recordedMonths, 'mese', 'mesi')}${scope}`;

  const sentence: Narrative = [
    prose('Un mese tipico fattura '),
    euro(summary.monthlyMedian ?? 0),
    prose(` (la mediana di ${summary.recordedMonths} ${plural(summary.recordedMonths, 'mese registrato', 'mesi registrati')})`),
  ];
  if (summary.strongest && summary.weakest) {
    sentence.push(
      prose(`; ${revenueMonthName(summary.strongest.month)} arriva in mediana a `),
      euro(summary.strongest.median ?? 0),
      prose(`, ${revenueMonthName(summary.weakest.month)} si ferma a `),
      euro(summary.weakest.median ?? 0),
    );
  }
  sentence.push(prose('.'));
  const leadLength = sentence.length;

  if (summary.yearToDate) sentence.push(prose(' '), ...yearToDateClause(summary.yearToDate));

  if (summary.years.length < 3) {
    sentence.push(
      prose(
        ` Con ${summary.years.length === 1 ? 'un anno solo' : 'due anni'} la mediana di un mese coincide con la sua media: diventa informativa dal terzo o quarto anno.`
      )
    );
  }

  const ytdTone = summary.yearToDate?.deltaPct ?? null;
  return {
    headline,
    tone: ytdTone !== null && printedSign(ytdTone, 0) > 0 ? 'positive' : 'neutral',
    sentence,
    ...(sentence.length > leadLength ? { leadLength, restLabel: "Il perché · l'anno in corso" } : {}),
  };
}

/** The grid's reading. */
export function describeRevenueGrid(summary: RevenueSummary): Narrative | null {
  if (summary.recordedMonths === 0) return null;
  const years = summary.years.length;
  const missing = summary.years.reduce((n, y) => n + (12 - y.recordedMonths), 0);
  const parts: Narrative = [
    figure(String(summary.recordedMonths)),
    prose(` ${plural(summary.recordedMonths, 'mese registrato', 'mesi registrati')} su `),
    figure(String(years)),
    prose(` ${plural(years, 'anno', 'anni')}`),
  ];
  if (missing > 0) parts.push(prose(`; le caselle vuote sono mesi non registrati, non zeri`));
  parts.push(prose('.'));
  return parts;
}

/** The seasonality tile's reading. */
export function describeRevenueSeasonality(summary: RevenueSummary): Narrative | null {
  if (!summary.strongest || !summary.weakest) {
    return summary.recordedMonths > 0 ? [prose('Serve almeno un secondo mese dell\'anno registrato per dire quale fattura di più.')] : null;
  }
  const strongestShare = summary.strongest.shareMedian;
  const parts: Narrative = [
    prose(`In mediana ${revenueMonthName(summary.strongest.month)} vale `),
    euro(summary.strongest.median ?? 0),
    prose(` e ${revenueMonthName(summary.weakest.month)} `),
    euro(summary.weakest.median ?? 0),
  ];
  if (strongestShare !== null && summary.completeYears > 0) {
    parts.push(
      prose(`; sugli anni completi ${revenueMonthName(summary.strongest.month)} è in genere il `),
      figure(formatPercentageIt(strongestShare, 0)),
      prose(" dell'anno"),
    );
  }
  parts.push(prose('.'));
  return parts;
}

/** The years tile's reading. */
export interface RevenueMonthTip {
  /** «Marzo · 3 anni». */
  title: string;
  /** The month's median: the tip's headline figure. */
  headline: string;
  /** The rest, one line each: label and value. */
  rows: { label: string; value: string }[];
}

/**
 * What the Stagionalità tip says about one calendar month: the median first, then the mean, the
 * lowest and the highest year, the share of the year. With one year the median IS that year's
 * figure, so the tip names the year and prints nothing else; `null` for a month nobody recorded.
 */
export function describeRevenueMonthTip(month: RevenueMonthStat): RevenueMonthTip | null {
  if (month.median === null) return null;
  const name = MONTH_NAMES[month.month - 1];
  const years = month.values.length;
  const rows: RevenueMonthTip['rows'] = [];
  if (years === 1) {
    rows.push({ label: 'Solo il', value: String(month.values[0].year) });
  } else {
    if (month.mean !== null) rows.push({ label: 'Media', value: formatEuroMinus(month.mean) });
    if (month.min) rows.push({ label: 'Minimo', value: `${formatEuroMinus(month.min.amount)} (${month.min.year})` });
    if (month.max) rows.push({ label: 'Massimo', value: `${formatEuroMinus(month.max.amount)} (${month.max.year})` });
  }
  if (month.shareMedian !== null) rows.push({ label: "Quota dell'anno", value: formatPercentageIt(month.shareMedian, 1) });
  return {
    title: `${name} · ${years} ${plural(years, 'anno', 'anni')}`,
    headline: `Mediana ${formatEuroMinus(month.median)}`,
    rows,
  };
}

export function describeRevenueYears(summary: RevenueSummary): Narrative | null {
  const complete = summary.years.filter((y) => y.complete);
  if (complete.length === 0) {
    return summary.years.length > 0 ? [prose('Nessun anno ha ancora tutti e dodici i mesi registrati: i totali sono parziali.')] : null;
  }
  const best = complete.reduce((top, y) => (y.total > top.total ? y : top));
  return [
    prose(complete.length === 1 ? `L'anno completo è il ${best.year}: ` : `Tra gli anni completi il migliore è il ${best.year}: `),
    euro(best.total),
    prose('.'),
  ];
}

/** The clients tile's reading. */
export function describeRevenueClients(summary: RevenueSummary): Narrative | null {
  const named = summary.clients.filter((c) => c.key !== '');
  if (named.length === 0) {
    return summary.clients.length > 0
      ? [prose('Nessuna riga indica il datore: le cifre sono il totale del mese.')]
      : null;
  }
  const top = named[0];
  return [
    prose(`${top.label} pesa il `),
    figure(formatPercentageIt(top.percentage, 0)),
    prose(` del fatturato registrato, su ${named.length} ${plural(named.length, 'datore', 'datori')}.`),
  ];
}
