'use client';

import { PageCrash } from '@/components/ui/page-crash';

/**
 * A dashboard page that throws while rendering: the notice takes the page's place inside the
 * shell, so the sidebar and the bottom nav stay and the reader can move to another page
 * (lib/utils/pageCrash.ts). The shell itself is covered by `app/error.tsx`.
 */
export default function DashboardError({ error, retry }: Readonly<{ error: unknown; retry: () => void }>) {
  return <PageCrash error={error} retry={retry} />;
}
