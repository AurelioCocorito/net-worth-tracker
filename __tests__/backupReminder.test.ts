import { describe, it, expect } from 'vitest';
import { BACKUP_DUE_DAYS, describeLastBackup, isBackupDue } from '@/lib/utils/backupReminder';

const NOW = new Date('2026-10-25T12:00:00');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

describe('isBackupDue', () => {
  it('is due when there never was a backup', () => {
    expect(isBackupDue(null, NOW)).toBe(true);
  });

  it('is due from BACKUP_DUE_DAYS on, not before', () => {
    expect(BACKUP_DUE_DAYS).toBe(30);
    expect(isBackupDue(daysAgo(29), NOW)).toBe(false);
    expect(isBackupDue(daysAgo(30), NOW)).toBe(true);
  });
});

describe('describeLastBackup', () => {
  it('says there is none yet', () => {
    expect(describeLastBackup(null, NOW)).toEqual({
      due: true,
      text: 'Nessun backup scaricato finora: scaricane uno e conservalo in un posto sicuro.',
    });
  });

  it('says today, yesterday, or how many days ago, with the date', () => {
    expect(describeLastBackup(daysAgo(0), NOW).text).toBe('Ultimo backup: oggi (25/10/2026).');
    expect(describeLastBackup(daysAgo(1), NOW).text).toBe('Ultimo backup: ieri (24/10/2026).');
    expect(describeLastBackup(daysAgo(12), NOW)).toEqual({ due: false, text: 'Ultimo backup: 12 giorni fa (13/10/2026).' });
  });

  it('asks for a new one once a month has passed', () => {
    expect(describeLastBackup(daysAgo(40), NOW)).toEqual({
      due: true,
      text: 'Ultimo backup: 40 giorni fa (15/09/2026). È ora di scaricarne uno nuovo.',
    });
  });
});
