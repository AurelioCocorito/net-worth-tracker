'use client';

import { PageCrash } from '@/components/ui/page-crash';

/**
 * Any page outside the dashboard (landing, login, registration) and the dashboard's own shell,
 * when it throws while rendering (lib/utils/pageCrash.ts). The root layout's providers stay.
 */
export default function RootError({ error, retry }: Readonly<{ error: unknown; retry: () => void }>) {
  return (
    <main className="min-h-screen bg-background p-4 desktop:p-5">
      <PageCrash error={error} retry={retry} />
    </main>
  );
}
