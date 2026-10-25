'use client';

import { useQuery } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { queryKeys } from '@/lib/query/queryKeys';
import { toDate } from '@/lib/utils/dateHelpers';

/**
 * When the signed-in user last downloaded «Scarica backup» (`users/{uid}.lastBackupAt`, stamped by
 * GET /api/user/backup), `null` when never (2026-10-25). The viewer's OWN uid, like the backup
 * itself; off in demo, where nothing is downloaded. `undefined` while it loads, so no reminder
 * flashes before the date is known.
 */
export function useLastBackup(): Date | null | undefined {
  const { user } = useAuth();
  const isDemo = useDemoMode();
  const uid = user?.uid;
  const { data } = useQuery<Date | null>({
    queryKey: queryKeys.accountBackup.last(uid || ''),
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'users', uid!));
      const value = snap.data()?.lastBackupAt;
      return value ? toDate(value) : null;
    },
    enabled: !!uid && !isDemo,
    staleTime: 60 * 60 * 1000,
  });
  return data;
}
