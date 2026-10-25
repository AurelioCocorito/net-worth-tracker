import { useSyncExternalStore } from 'react';
import { readStartPage, subscribeStartPage, writeStartPage, type StartPage } from '@/lib/utils/startPage';

/**
 * The device's start page (lib/utils/startPage.ts), `undefined` until hydration — the server
 * cannot know it, like the light/dark mode.
 */
export function useStartPage(): [StartPage | undefined, (page: StartPage) => void] {
  const page = useSyncExternalStore(subscribeStartPage, readStartPage, () => undefined);
  return [page, writeStartPage];
}
