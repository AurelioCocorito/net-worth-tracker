/**
 * The backup reminder (2026-10-25): the owner chose a manual «Scarica backup» only — no email, no
 * scheduled export — so the app says how long ago the last one was, and marks «Backup» in
 * Strumenti once it is a month old or there never was one. The date is stamped by the backup
 * route on `users/{uid}.lastBackupAt` when it serves the file.
 */

import { formatDate } from '@/lib/utils/formatters';

/** A backup this many days old (or none at all) is due: the Strumenti row gets its mark. */
export const BACKUP_DUE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface LastBackupReading {
  /** True when no backup was ever downloaded, or the last one is BACKUP_DUE_DAYS old or more. */
  due: boolean;
  /** «Ultimo backup: 12 giorni fa (13/10/2026).» */
  text: string;
}

/** Whole days between the two instants, never negative. */
function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
}

export function isBackupDue(lastBackupAt: Date | null, now: Date): boolean {
  return lastBackupAt === null || daysBetween(lastBackupAt, now) >= BACKUP_DUE_DAYS;
}

export function describeLastBackup(lastBackupAt: Date | null, now: Date): LastBackupReading {
  if (lastBackupAt === null) {
    return { due: true, text: 'Nessun backup scaricato finora: scaricane uno e conservalo in un posto sicuro.' };
  }
  const days = daysBetween(lastBackupAt, now);
  const when = days === 0 ? 'oggi' : days === 1 ? 'ieri' : `${days} giorni fa`;
  const due = isBackupDue(lastBackupAt, now);
  return {
    due,
    text: `Ultimo backup: ${when} (${formatDate(lastBackupAt)}).${due ? ' È ora di scaricarne uno nuovo.' : ''}`,
  };
}
