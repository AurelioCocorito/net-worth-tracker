'use client';

/**
 * React Query hook for the owner's revenue register (`revenueEntries`, Cashflow › Fatturati).
 *
 * The whole register in one read: twelve rows a year per client. Every write in the tab
 * invalidates `queryKeys.revenue.all`.
 *
 * @param ownerId - Whose register (`useActiveAccount().ownerId`, never the viewer's uid)
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { getRevenueEntries } from '@/lib/services/revenueService';
import type { RevenueEntry } from '@/types/revenue';

export function useRevenueEntries(ownerId: string | undefined, options?: { enabled?: boolean }) {
  return useQuery<RevenueEntry[]>({
    queryKey: queryKeys.revenue.all(ownerId || ''),
    queryFn: () => getRevenueEntries(ownerId!),
    enabled: !!ownerId && (options?.enabled ?? true),
  });
}
