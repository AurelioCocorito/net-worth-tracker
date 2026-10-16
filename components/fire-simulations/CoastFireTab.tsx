'use client';

/**
 * FIRE › COAST FIRE — a verdict over tiles (2026-08-25)
 *
 * The tab answers «posso smettere di versare?» before it shows a number: a rule-generated
 * verdict (`buildCoastVerdict` in lib/utils/coastFireView.ts) names the gap to the Coast number
 * of today, what the free capital becomes at the target age against what is required, the year
 * the CURRENT savings pace gets there (2026-09-23: «non ancora» had no «quando») and — with the
 * bridge model on — the locked fund, over a 12-column grid of tiles that each answer one
 * question with a reading line above their figures.
 *
 *   Desktop (12 col): Traguardo(5, 2 rows) | Afflussi(7)
 *                                          | Scenari(7)
 *   Below desktop:    ONE sequence, the DOM above (doc/mobile/README.md § 9, decisions 1 and 11,
 *                     since 2026-10-15): the verdict's title → the first sentence (the gap and the
 *                     walk) → the strip of two figures («Ti mancano» or «Margine», «Nell'orso») →
 *                     the lock as the scope line (decision 44) → «Il perché» (the pace, the lock
 *                     sentence) → Traguardo open, its plot at 120px → «Il resto della pagina» →
 *                     Afflussi, Scenari as closed rows (`useMobileSections` with `tab: 'coast'`,
 *                     doc/guide/fire-coast.md § Composizione mobile) → Ipotesi → Dettaglio.
 *
 * Below the grid, two disclosures: «Ipotesi» (the form — ages, expenses, state pensions, IRPEF
 * brackets — config-first: open only while no age is saved, reopening on an unsaved edit or an
 * incomplete pension) and «Dettaglio» (coverage phases, target vs steady state, the pensions'
 * impact, how to read it).
 *
 * The page has NO period axis — a Coast plan is read today — and no control of its own: the
 * pension-lock switch is the Calcolatore's (Base di calcolo) and governs the WHOLE FIRE page.
 *
 * This file is the ORCHESTRATOR: the four queries, the projection, and the summaries the tiles
 * read. The form lives in `useCoastFireSettingsDraft`, the numbers and the words in
 * `lib/utils/coastFireView.ts`, the math in `fireService` — where it already was, unchanged.
 * The tab computes nothing: a figure that cannot be pointed at inside a `CoastFIREScenarioMetrics`
 * (or the lock state, or the savings pace built on the projection's own series) does not belong
 * here.
 *
 * The state-pension inputs are intentionally scoped to Coast FIRE only: they affect the
 * retirement-phase portfolio need, not the classic FIRE tab.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAssets } from '@/lib/hooks/useAssets';
import { useExpensesInRange } from '@/lib/hooks/useExpenses';
import { fireWindows } from '@/lib/utils/expenseWindows';
import { useSettings } from '@/lib/hooks/useSettings';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useCoastFireSettingsDraft } from '@/lib/hooks/useCoastFireSettingsDraft';
import {
  calculateCoastFIREProjection,
  computeAnnualCashflowData,
  computeLastYearExpenses,
  getDefaultScenarios,
  type PensionCapitalInflowToday,
} from '@/lib/services/fireService';
import { calculateAssetValue, calculateFIRENetWorth, calculateLiquidFIRENetWorth, filterFireEligibleAssets } from '@/lib/services/assetService';
import { resolvePortfolioTaxProfile } from '@/lib/utils/withdrawalTax';
import { resolvePensionLockState, resolveRitaUnlockAge } from '@/lib/utils/pensionUnlock';
import { summarizeLock } from '@/lib/utils/fireSummary';
import { describeFireLockScope } from '@/lib/utils/fireNarrative';
import { getItalyYear } from '@/lib/utils/dateHelpers';
import { useMobileSections, type SectionSpec } from '@/lib/hooks/useMobileSections';
import { useTabletComposition, useTabletStage } from '@/lib/hooks/useTabletComposition';
import {
  COMPACT_GRID_CLASS,
  COMPACT_GRID_WRAPPER_CLASS,
  INDEX_CLASS,
  LEAD_CELL_CLASS,
  REST_CELL_CLASS,
  STAGE_CLASS,
  STAGE_WRAPPER_CLASS,
  VERDICT_CELL_CLASS,
} from '@/lib/utils/tabletComposition';
import { VERDICT_REST_SECTION } from '@/lib/utils/mobileSections';
import {
  buildBaseScenarioInterpretation,
  buildCoastCoverageSteps,
  buildCoastInflowEvents,
  buildCoastVerdict,
  COAST_CLOSED_ASIDES,
  COAST_SECTION_IDS,
  COAST_INFLOWS_FOOTER,
  COAST_INFLOWS_METHOD,
  COAST_SCENARIOS_FOOTER,
  COAST_SCENARIOS_METHOD,
  describeCoastClosedAnswers,
  describeCoastDettaglio,
  describeCoastEmptyTiles,
  describeCoastInflows,
  describeCoastScenarios,
  describeCoastTarget,
  describeCoastTargetCaption,
  describeCoastTargetFooter,
  describeCoverage,
  describeIpotesi,
  describePensionImpact,
  describeTargetAndSteadyState,
  getPensionConfigurationState,
  resolveCoastBridgeYears,
  resolveCoastEmptyKind,
  resolveCoastIncompleteReason,
  resolveCoastPace,
  selectCoastStrip,
  sortPensionBreakdown,
  summarizeCoastPensions,
  summarizeCoastScenarios,
  summarizeCoastTarget,
} from '@/lib/utils/coastFireView';
import { COAST_TAB_SKELETON_CELLS } from './tabSkeletons';
import { cn } from '@/lib/utils';
import { PageVerdict } from '@/components/ui/page-verdict';
import { VerdictStrip } from '@/components/ui/verdict-strip';
import { PageRest } from '@/components/ui/page-rest';
import { Tile, TILE_CELL_CLASS, TILE_ROW_CELL_CLASS } from '@/components/ui/tile';
import { RowAnswers } from '@/components/ui/row-answers';
import { EmptyState } from '@/components/ui/empty-state';
import { FireLockScope } from './FireLockScope';
import { FIRE_ROW_NOT_COMPUTABLE } from '@/lib/utils/fireNarrative';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describeReadFailure, resolveSurfaceState } from '@/lib/utils/statesNarrative';
import { CoastTraguardoTile } from './coast/tiles/CoastTraguardoTile';
import { AfflussiTile } from './coast/tiles/AfflussiTile';
import { CoastScenariTile } from './coast/tiles/CoastScenariTile';
import { CoastIpotesi } from './coast/CoastIpotesi';
import { CoastDettaglio } from './coast/CoastDettaglio';
import { CoastFireProjectionChart } from './CoastFireProjectionChart';

/** The grid's geometry, for the skeleton: the same spans as the tiles below — shared with the page's lazy-tab wait. */
const SKELETON_CELLS = COAST_TAB_SKELETON_CELLS;

/**
 * The three cells of the grid: one class per tile, shared by the data and the empty branches. ONE
 * sequence, no `order-*` (decision 11); on a tablet a row cell adds the place
 * `useTabletComposition` gives it at 768 (in landscape the rows sit in the index beside the verdict
 * and THE tile, lib/utils/tabletComposition.ts).
 */
const TRAGUARDO_CELL = cn(TILE_CELL_CLASS, LEAD_CELL_CLASS, 'desktop:col-span-5 desktop:row-span-2');
const AFFLUSSI_CELL = cn(TILE_ROW_CELL_CLASS, 'desktop:col-span-7');
const SCENARI_CELL = cn(TILE_ROW_CELL_CLASS, 'desktop:col-span-7');

/** The rows below `desktop:`, in the DOM's order: every tile but Traguardo, THE tile (decision 21). No row carries `failed`. */
const COAST_SECTIONS: readonly SectionSpec[] = [
  { id: COAST_SECTION_IDS.afflussi, eyebrow: 'Afflussi' },
  { id: COAST_SECTION_IDS.scenari, eyebrow: 'Scenari' },
];
/** Both rows are on both branches of the tab: their DOM order is the tablet's. */
const COAST_ORDER = COAST_SECTIONS.map((section) => section.id);

/** The one action of the empty state: a link (or a button) the size of a touch target, in the tile's own ink. */
const EMPTY_ACTION_CLASS =
  'inline-flex min-h-8 items-center text-[13px] text-foreground underline underline-offset-2 hover:decoration-2 [@media(pointer:coarse)]:min-h-11';

/** How long the Collapsible takes to mount its content before a field inside it can take focus. */
const IPOTESI_OPEN_FOCUS_DELAY_MS = 60;

export function CoastFireTab() {
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const [ipotesiOpen, setIpotesiOpen] = useState(false);

  // ─── Queries ─────────────────────────────────────────────────────────────────
  // Settings and assets from the keys every page shares (2026-09-29).
  const { data: settings, isLoading: isLoadingSettings, isError: settingsError } = useSettings(ownerId);
  const { data: assets, isLoading: isLoadingAssets, isError: assetsError } = useAssets(ownerId);

  // The last full year's expenses and the Calcolatore's savings, both computed in memory from
  // the FIRE page's recent expenses window (January of last year → this December, `fireWindows`):
  // the key the Calcolatore reads, so after it this tab reads nothing.
  const readAt = useMemo(() => new Date(), []);
  const recentWindow = useMemo(() => fireWindows(readAt, null).recent, [readAt]);
  const { data: recentExpenses, isLoading: isLoadingAnnualExpenses, isError: expensesError } = useExpensesInRange(ownerId, recentWindow);
  const annualExpenses = useMemo(() => (recentExpenses ? computeLastYearExpenses(recentExpenses, readAt) : undefined), [recentExpenses, readAt]);

  // The Calcolatore's savings — the SAME query key, so the two tabs read one figure — is the
  // pace the verdict names. It rejects on a failed read (never a zeroed payload), so the
  // failure reaches the notice below like the other three.
  const cashflowData = useMemo(() => (recentExpenses ? computeAnnualCashflowData(recentExpenses, readAt) : undefined), [recentExpenses, readAt]);
  const isLoadingCashflow = isLoadingAnnualExpenses;
  const cashflowError = expensesError;

  const draft = useCoastFireSettingsDraft({ settings, isLoadingSettings, ownerId });

  const includePrimaryResidence = settings?.includePrimaryResidenceInFIRE ?? false;
  const liquidNetWorth = assets ? calculateLiquidFIRENetWorth(assets, includePrimaryResidence) : 0;
  const scenarios = settings?.fireProjectionScenarios ?? getDefaultScenarios();
  const withdrawalRate = settings?.withdrawalRate ?? 4.0;
  const currentAge = draft.currentAge;
  const retirementAge = draft.parsedRetirementAge;

  // ─── Pension lock (the Calcolatore's switch governs the whole page) ──────────
  // When on, locked pension funds leave the Coast starting capital and re-enter the walk as
  // capital inflows at their unlock year, at TODAY's value.
  const respectPensionLockIn = settings?.respectPensionLockInFire ?? false;
  const pensionLockState = useMemo(() => {
    if (!respectPensionLockIn || !assets) return null;
    return resolvePensionLockState(
      assets,
      {
        userAge: currentAge ?? settings?.userAge,
        pensionInpsRetirementAge: settings?.pensionInpsRetirementAge,
        pensionRitaLongUnemployment: settings?.pensionRitaLongUnemployment,
      },
      new Date(),
      calculateAssetValue,
    );
  }, [respectPensionLockIn, assets, currentAge, settings?.userAge, settings?.pensionInpsRetirementAge, settings?.pensionRitaLongUnemployment]);
  const pensionLockedValue = pensionLockState?.totalLockedToday ?? 0;
  const pensionInflowsToday = useMemo<PensionCapitalInflowToday[]>(
    () => (pensionLockState?.inflows ?? []).map((inflow) => ({ yearsFromNow: inflow.yearsFromNow, amountToday: inflow.amount })),
    [pensionLockState],
  );
  const currentNetWorth = assets ? calculateFIRENetWorth(assets, includePrimaryResidence) - pensionLockedValue : 0;

  // The tax on withdrawals (2026-09-24), read on the same capital the number runs on — the
  // FIRE-eligible assets minus the locked funds — so the Coast number and the Calcolatore's agree.
  const taxProfile = useMemo(() => {
    if (!assets) return null;
    const lockedIds = new Set((pensionLockState?.funds ?? []).filter((info) => info.isLocked).map((info) => info.fund.id));
    return resolvePortfolioTaxProfile(
      filterFireEligibleAssets(assets, includePrimaryResidence).filter((asset) => !lockedIds.has(asset.id)),
      calculateAssetValue,
    );
  }, [assets, includePrimaryResidence, pensionLockState]);
  const withdrawalTax = useMemo(() => (taxProfile ? { basisToday: taxProfile.basisToday, rate: taxProfile.rate } : undefined), [taxProfile]);

  // Custom expenses when the toggle is on and the value parses to a positive number; otherwise
  // the last complete year's actuals from the query.
  const effectiveAnnualExpenses = draft.usesCustomExpenses ? draft.parsedCustomExpenses : annualExpenses;

  // ─── The projection (fireService, unchanged) ─────────────────────────────────
  const { previewPensions, previewTaxBrackets } = draft;
  const coastProjection = useMemo(() => {
    if (currentAge === null || retirementAge === null || effectiveAnnualExpenses === undefined || effectiveAnnualExpenses <= 0 || withdrawalRate <= 0 || currentNetWorth <= 0) {
      return null;
    }
    return calculateCoastFIREProjection(
      currentNetWorth,
      effectiveAnnualExpenses,
      withdrawalRate,
      currentAge,
      retirementAge,
      scenarios,
      previewPensions,
      previewTaxBrackets,
      undefined, // currentDate: keep the function's own default
      pensionInflowsToday,
      withdrawalTax,
    );
  }, [effectiveAnnualExpenses, currentAge, currentNetWorth, pensionInflowsToday, previewPensions, previewTaxBrackets, retirementAge, scenarios, withdrawalRate, withdrawalTax]);

  // ─── The numbers (pure layer over the projection) ────────────────────────────
  const currentYear = getItalyYear();
  const baseScenario = coastProjection?.scenarios.base ?? null;
  const resolvedRetirementAge = coastProjection?.retirementAge ?? retirementAge ?? 0;
  const ritaUnlockAge = resolveRitaUnlockAge({ pensionInpsRetirementAge: settings?.pensionInpsRetirementAge, pensionRitaLongUnemployment: settings?.pensionRitaLongUnemployment });
  const lock = useMemo(() => summarizeLock(pensionLockState, { currentYear, ritaUnlockAge }), [pensionLockState, currentYear, ritaUnlockAge]);
  const isBridge = pensionInflowsToday.length > 0;

  const target = useMemo(
    () =>
      baseScenario && currentAge !== null
        ? summarizeCoastTarget(baseScenario, { currentNetWorth, liquidNetWorth, currentAge, retirementAge: resolvedRetirementAge, isBridge })
        : null,
    [baseScenario, currentNetWorth, liquidNetWorth, currentAge, resolvedRetirementAge, isBridge],
  );
  const annualSavings = cashflowData?.annualSavings;
  const pace = useMemo(
    () => (coastProjection && baseScenario && target ? resolveCoastPace(coastProjection.projectionData, annualSavings, baseScenario.realReturnRate, target.reached) : null),
    [coastProjection, baseScenario, target, annualSavings],
  );
  const pensions = useMemo(
    () => (baseScenario ? summarizeCoastPensions(baseScenario, currentYear) : { count: 0, entries: [], annualNetReal: 0, monthlyNetReal: 0, annualNetRealAtRetirement: 0 }),
    [baseScenario, currentYear],
  );
  const scenarioRows = useMemo(() => (coastProjection ? summarizeCoastScenarios(coastProjection.scenarios, scenarios, currentNetWorth) : []), [coastProjection, scenarios, currentNetWorth]);
  const bridgeYears = baseScenario ? resolveCoastBridgeYears(baseScenario, resolvedRetirementAge) : 0;
  const sortedPensionBreakdown = useMemo(() => (baseScenario ? sortPensionBreakdown(baseScenario.pensionBreakdown) : []), [baseScenario]);
  const inflowEvents = useMemo(
    () => buildCoastInflowEvents(sortedPensionBreakdown, pensionInflowsToday, currentYear, currentAge),
    [sortedPensionBreakdown, pensionInflowsToday, currentYear, currentAge],
  );
  const pensionConfigurationState = getPensionConfigurationState(previewPensions, draft.pensionIssues);
  const emptyKind = resolveCoastEmptyKind(currentNetWorth, effectiveAnnualExpenses, currentAge, retirementAge);
  const incompleteReason = resolveCoastIncompleteReason(currentNetWorth, effectiveAnnualExpenses, currentAge, retirementAge);

  // ─── The words (pure layer) ───────────────────────────────────────────────────
  const verdict = useMemo(() => buildCoastVerdict({ target, incompleteReason, pace, lock }), [target, incompleteReason, pace, lock]);

  // ─── The phone composition (2026-10-15) ──────────────────────────────────────
  // The rows and «Il perché» from the controller (one memory per tab); the strip from the target
  // and the scenario rows the tiles print; the lock as the scope line only below `desktop:`.
  const sections = useMobileSections({ route: 'fire-simulations', tab: 'coast', sections: COAST_SECTIONS });
  const stageRef = useTabletStage();
  const tablet = useTabletComposition({ sections, order: COAST_ORDER });
  const { reveal: handleStripOpen } = sections;
  const strip = target ? selectCoastStrip({ target, scenarios: scenarioRows }) : [];
  const lockScope = sections.compact ? describeFireLockScope(lock) : null;
  const ipotesiDescription = describeIpotesi({
    currentAge,
    retirementAge,
    annualExpenses: effectiveAnnualExpenses,
    usesCustomExpenses: draft.usesCustomExpenses,
    withdrawalRate,
    baseRealReturn: baseScenario?.realReturnRate ?? null,
    respectPensionLockIn,
    pensionUnlockCalendarYear: lock.unlockCalendarYear,
    pensionCount: previewPensions.length,
    withdrawalTaxRate: taxProfile ? taxProfile.rate : null,
  });

  // ─── Config-first disclosure ─────────────────────────────────────────────────
  // Decide the initial collapsed/expanded state ONCE, after the form has settled to match saved
  // settings (hasUnsavedChanges === false ⇒ temp state seeded). Collapsed when the user has already
  // configured their age (config-first for new users). The flag is set INSIDE the timer: under
  // StrictMode's double-invoke the first timer is cleared before it fires, and a flag set
  // synchronously would leave the panel closed for good.
  const hasSeededConfigRef = useRef(false);
  const hasUnsavedChanges = draft.hasUnsavedChanges;
  const savedUserAge = settings?.userAge;
  useEffect(() => {
    if (hasSeededConfigRef.current || isLoadingSettings || hasUnsavedChanges) return;
    if (savedUserAge != null) {
      hasSeededConfigRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      hasSeededConfigRef.current = true;
      setIpotesiOpen(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [isLoadingSettings, hasUnsavedChanges, savedUserAge]);

  // After seeding, reopen on a genuine unsaved edit or an incomplete pension to fix.
  // Never auto-close: collapsing after save is disorienting if the user keeps editing.
  useEffect(() => {
    if (!hasSeededConfigRef.current) return;
    if (!hasUnsavedChanges && pensionConfigurationState !== 'incomplete') return;
    const timer = setTimeout(() => setIpotesiOpen(true), 0);
    return () => clearTimeout(timer);
  }, [hasUnsavedChanges, pensionConfigurationState]);

  /** The empty state's action on a field of the Ipotesi: open the disclosure, then focus the field it names. */
  const openIpotesiAt = (fieldId: string) => {
    setIpotesiOpen(true);
    window.setTimeout(() => document.getElementById(fieldId)?.focus(), IPOTESI_OPEN_FOCUS_DELAY_MS);
  };

  // ─── Loading ─────────────────────────────────────────────────────────────────
  // A failed read comes BEFORE the wait: these queries default to undefined, and a plan built
  // on a base that was never read is a number with nothing behind it.
  const isLoading = isLoadingSettings || isLoadingAssets || isLoadingAnnualExpenses || isLoadingCashflow;
  if (resolveSurfaceState({ loading: isLoading, failed: settingsError || assetsError || expensesError || cashflowError }) === 'failed') {
    return (
      <ErrorNotice
        className="max-w-[920px]"
        notice={describeReadFailure({
          consequence: 'Patrimonio, ipotesi, spese annue e risparmio non sono stati letti: senza di essi non si sa se puoi smettere di versare.',
          untouched: 'Le ipotesi salvate non sono state toccate.',
        })}
      />
    );
  }

  if (isLoading) {
    return <TileGridSkeleton cells={SKELETON_CELLS} />;
  }

  const ipotesi = (
    <CoastIpotesi
      open={ipotesiOpen}
      onOpenChange={setIpotesiOpen}
      description={ipotesiDescription}
      draft={draft}
      isDemo={isDemo}
      detectedAnnualExpenses={annualExpenses}
      withdrawalRate={withdrawalRate}
      includePrimaryResidence={includePrimaryResidence}
      currentNetWorth={currentNetWorth}
      liquidNetWorth={liquidNetWorth}
      lockSubtracted={pensionLockedValue > 0}
    />
  );

  // ─── Nothing recorded: the grid stays, every tile keeps its question ──────────
  // The Absence-Has-Three-Names Rule: the eyebrow must stay visible precisely when the tile
  // cannot answer, and the ONE action belongs to the tile that owns the missing thing (the
  // Traguardo) — a page for the patrimonio, the Ipotesi field for what the form owns. Until
  // 2026-09-23 this state dropped the three tiles and linked nowhere.
  if (!coastProjection || !baseScenario || !target) {
    const empty = describeCoastEmptyTiles(emptyKind ?? 'no-net-worth');
    const emptyAction = empty.action;
    const action =
      'href' in emptyAction ? (
        <Link href={emptyAction.href} className={EMPTY_ACTION_CLASS}>
          {emptyAction.label}
        </Link>
      ) : (
        <button type="button" onClick={() => openIpotesiAt(emptyAction.fieldId)} className={EMPTY_ACTION_CLASS}>
          {emptyAction.label}
        </button>
      );
    // The same rows as the full tab, closed and saying «non ancora calcolabile»; the Traguardo keeps the action.
    return (
      <div className="space-y-4">
        {/* The stage: the verdict over the grid; on a tablet in landscape the answer on the left
            (verdict and THE tile) and the index on the right (lib/utils/tabletComposition.ts). */}
        <div className={STAGE_WRAPPER_CLASS}>
        <div ref={stageRef} className={STAGE_CLASS}>
        <div data-stage="verdict" className={cn('pt-1', VERDICT_CELL_CLASS)}>
          <PageVerdict verdict={verdict} ariaLabel="Verdetto sul Coast FIRE" scope={lockScope && <FireLockScope text={lockScope} />} restCollapse={sections.collapse(VERDICT_REST_SECTION)} />
        </div>
        <div className={COMPACT_GRID_WRAPPER_CLASS}>
        <div className={COMPACT_GRID_CLASS}>
          <div data-stage="lead" className={TRAGUARDO_CELL}>
            <Tile eyebrow="Traguardo" ariaLabel="Traguardo Coast FIRE">
              <EmptyState className="mt-2" message={empty.traguardo} action={action} />
            </Tile>
          </div>
          <div className={INDEX_CLASS}>
          <PageRest sections={sections} className={REST_CELL_CLASS} />
          <div className={cn(AFFLUSSI_CELL, tablet.cellClass(COAST_SECTION_IDS.afflussi))}>
            <Tile eyebrow="Afflussi" ariaLabel="Afflussi già considerati" collapse={sections.collapse(COAST_SECTION_IDS.afflussi)} asideWhenClosed={FIRE_ROW_NOT_COMPUTABLE}>
              <EmptyState className="mt-2" message={empty.afflussi} />
            </Tile>
          </div>
          <div className={cn(SCENARI_CELL, tablet.cellClass(COAST_SECTION_IDS.scenari))}>
            <Tile eyebrow="Scenari" ariaLabel="Scenari Coast FIRE" collapse={sections.collapse(COAST_SECTION_IDS.scenari)} asideWhenClosed={FIRE_ROW_NOT_COMPUTABLE}>
              <EmptyState className="mt-2" message={empty.scenari} />
            </Tile>
          </div>
          </div>
        </div>
        </div>
        </div>
        </div>
        {ipotesi}
      </div>
    );
  }

  const lastPoint = coastProjection.projectionData[coastProjection.projectionData.length - 1];

  return (
    <div className="space-y-4">
      {/* The stage: the verdict over the grid; on a tablet in landscape the answer on the left
          (verdict and THE tile) and the index on the right (lib/utils/tabletComposition.ts). */}
      <div className={STAGE_WRAPPER_CLASS}>
      <div ref={stageRef} className={STAGE_CLASS}>
      <div data-stage="verdict" className={cn('pt-1', VERDICT_CELL_CLASS)}>
        <PageVerdict
          verdict={verdict}
          ariaLabel="Verdetto sul Coast FIRE"
          strip={<VerdictStrip figures={strip} onOpen={handleStripOpen} eyebrows={sections.eyebrows} />}
          scope={lockScope && <FireLockScope text={lockScope} />}
          restCollapse={sections.collapse(VERDICT_REST_SECTION)}
        />
      </div>

      <div className={COMPACT_GRID_WRAPPER_CLASS}>
      <div className={COMPACT_GRID_CLASS}>
        <div data-stage="lead" className={TRAGUARDO_CELL}>
          <CoastTraguardoTile
            reading={describeCoastTarget(target)}
            target={target}
            caption={describeCoastTargetCaption(target)}
            chart={
              <CoastFireProjectionChart
                projectionData={coastProjection.projectionData}
                height="100%"
                marginLeft={0}
                pensionUnlockCalendarYear={lock.unlockCalendarYear}
                pace={pace}
              />
            }
            footer={describeCoastTargetFooter({
              retirementAge: resolvedRetirementAge,
              requiredNet: baseScenario.retirementCapitalRequired,
              lastTargetOnPlot: lastPoint?.fireNumberTarget ?? baseScenario.retirementCapitalRequired,
              lock,
              lastProjectedYear: lastPoint?.calendarYear ?? currentYear,
              pace,
            })}
          />
        </div>

        {/* What each closed row answers in the landscape index (2026-10-16): the same events,
            pensions and scenario rows the tiles print. */}
        <RowAnswers value={describeCoastClosedAnswers({ events: inflowEvents, pensions, scenarios: scenarioRows })}>
        <div className={INDEX_CLASS}>
        <PageRest sections={sections} className={REST_CELL_CLASS} />

        <div className={cn(AFFLUSSI_CELL, tablet.cellClass(COAST_SECTION_IDS.afflussi))}>
          <AfflussiTile
            collapse={sections.collapse(COAST_SECTION_IDS.afflussi)}
            asideWhenClosed={COAST_CLOSED_ASIDES[COAST_SECTION_IDS.afflussi]}
            reading={describeCoastInflows(inflowEvents, pensions, resolvedRetirementAge)}
            events={inflowEvents}
            footer={COAST_INFLOWS_FOOTER}
            method={COAST_INFLOWS_METHOD}
          />
        </div>

        <div className={cn(SCENARI_CELL, tablet.cellClass(COAST_SECTION_IDS.scenari))}>
          <CoastScenariTile
            collapse={sections.collapse(COAST_SECTION_IDS.scenari)}
            asideWhenClosed={COAST_CLOSED_ASIDES[COAST_SECTION_IDS.scenari]}
            reading={describeCoastScenarios(scenarioRows)}
            rows={scenarioRows}
            footer={COAST_SCENARIOS_FOOTER}
            method={COAST_SCENARIOS_METHOD}
          />
        </div>
        </div>
        </RowAnswers>
      </div>
      </div>
      </div>
      </div>

      {ipotesi}

      <CoastDettaglio
        description={describeCoastDettaglio({ bridgeYears, pensionCount: pensions.count })}
        base={baseScenario}
        sortedPensionBreakdown={sortedPensionBreakdown}
        coverageSteps={buildCoastCoverageSteps(baseScenario, sortedPensionBreakdown, resolvedRetirementAge, bridgeYears)}
        coverageReading={describeCoverage(baseScenario, pensions, resolvedRetirementAge, bridgeYears)}
        targetReading={describeTargetAndSteadyState(baseScenario, resolvedRetirementAge, bridgeYears, withdrawalRate, isBridge)}
        impactReading={describePensionImpact(pensions)}
        interpretation={buildBaseScenarioInterpretation(baseScenario, effectiveAnnualExpenses, bridgeYears, resolvedRetirementAge)}
        annualExpenses={effectiveAnnualExpenses ?? 0}
        bridgeYears={bridgeYears}
        retirementAge={resolvedRetirementAge}
      />
    </div>
  );
}
