import type { ReactNode } from 'react';
import type { OverviewVerdict as OverviewVerdictModel } from '@/lib/utils/overviewNarrative';
import { PageVerdict } from '@/components/ui/page-verdict';
import type { TileCollapse } from '@/components/ui/tile';

/**
 * Where a strip cell lands the focus when there is no «Il perché» to open (the paragraph is
 * whole because a binding clause cancelled the cut): the verdict's own box, focusable by script.
 */
export const OVERVIEW_VERDICT_ID = 'panoramica-verdetto';

interface OverviewVerdictProps {
  verdict: OverviewVerdictModel;
  /** `<VerdictStrip>` of the phone composition (since 2026-10-11); absent at 1440, where the page passes none. */
  strip?: ReactNode;
  /** The verdict's «Il perché» as a row of the page's controller; absent at 1440. */
  restCollapse?: TileCollapse;
}

/** The Panoramica's verdict — `PageVerdict` (components/ui) named after its question. */
export function OverviewVerdict({ verdict, strip, restCollapse }: OverviewVerdictProps) {
  return (
    // `tabIndex={-1}`: a script can focus it, the Tab order cannot reach it; the ring is the
    // content's, not a box around a paragraph.
    <div id={OVERVIEW_VERDICT_ID} tabIndex={-1} className="focus:outline-none">
      <PageVerdict verdict={verdict} ariaLabel="Verdetto del mese" strip={strip} restCollapse={restCollapse} />
    </div>
  );
}
