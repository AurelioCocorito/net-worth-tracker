import { notFound } from 'next/navigation';
import { ConsulenteClient } from '@/components/allocation/consulente/ConsulenteClient';

/**
 * Allocazione › Consulente (2026-10-20): the guided path that sets the allocation with two
 * agents. Gated by the assistant's flag like the Assistente itself — the path IS an assistant
 * — and by the key the run needs, read here on the server so the page can say «non
 * configurato» instead of failing at the first run.
 */
export default async function ConsulentePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NEXT_PUBLIC_ASSISTANT_AI_ENABLED === 'false') {
    notFound();
  }
  // `?rivedi=1` (the review invite of Allocazione, 2026-10-20): the screens open over the applied
  // plan instead of its report, as «Rifai il percorso» would.
  const params = await searchParams;
  return <ConsulenteClient configured={Boolean(process.env.ANTHROPIC_API_KEY)} startFresh={params.rivedi === '1'} />;
}
