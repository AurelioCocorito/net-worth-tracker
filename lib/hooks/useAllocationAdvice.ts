'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { getAllocationAdvice } from '@/lib/services/allocationAdviceService';
import type { AllocationAdviceDocument } from '@/types/allocationAdvice';

/**
 * The owner's last Consulente run, `null` when there was none (2026-10-20). THE reader of
 * `getAllocationAdvice`; the run page and the «applied» step invalidate the key.
 *
 * @param ownerId - Whose document (`useActiveAccount().ownerId`, never the viewer's uid)
 */
export function useAllocationAdvice(ownerId: string | undefined, options?: { enabled?: boolean }) {
  return useQuery<AllocationAdviceDocument | null>({
    queryKey: queryKeys.allocationAdvice.all(ownerId || ''),
    queryFn: () => getAllocationAdvice(ownerId!),
    enabled: !!ownerId && (options?.enabled ?? true),
  });
}
