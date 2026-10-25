'use client';

import { useLastBackup } from '@/lib/hooks/useLastBackup';
import { isBackupDue } from '@/lib/utils/backupReminder';
import { cn } from '@/lib/utils';

/**
 * The reminder beside «Backup» in Strumenti (2026-10-25): a small warning dot once the last
 * backup is BACKUP_DUE_DAYS old, or there never was one. Nothing while the date loads, nothing in
 * demo (`useLastBackup` is off there), nothing when it is recent.
 */
export function BackupDueMark({ className }: { className?: string }) {
  const lastBackupAt = useLastBackup();
  if (lastBackupAt === undefined || !isBackupDue(lastBackupAt, new Date())) return null;
  return (
    <span
      data-testid="backup-due-mark"
      role="img"
      aria-label="backup da fare"
      title="L'ultimo backup ha più di un mese"
      className={cn('ml-auto size-2 shrink-0 rounded-full bg-warning-foreground', className)}
    />
  );
}
