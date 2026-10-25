/**
 * The «Backup dei dati» tile (2026-10-25): one button that downloads the caller's whole account as
 * a JSON file (`/api/user/backup`; what is in it: lib/utils/accountBackup.ts).
 *
 * Like the sharing tile beside it, it always concerns the logged-in user's OWN account, whatever
 * account is active in the switcher. After a download the reading says how many documents the file
 * holds, so the owner can see it is not empty.
 */
'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tile } from '@/components/ui/tile';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { backupFileName, type AccountBackupFile } from '@/lib/utils/accountBackup';

interface AccountBackupSectionProps {
  /** In demo nothing is downloaded: the demo data is not the viewer's. */
  disabled: boolean;
}

const filenameFrom = (response: Response): string =>
  /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? backupFileName(new Date());

/** Fetches the file, saves it through a download link, and returns the documents it holds. */
async function downloadAccountBackup(): Promise<number> {
  const response = await authenticatedFetch('/api/user/backup');
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? 'Impossibile creare il backup. Riprova tra poco.');
  }
  const text = await response.text();
  const backup = JSON.parse(text) as AccountBackupFile;

  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filenameFrom(response);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 100);

  return Object.values(backup.counts).reduce((sum, n) => sum + n, 0);
}

export function AccountBackupSection({ disabled }: AccountBackupSectionProps) {
  const [downloading, setDownloading] = useState(false);
  const [lastCount, setLastCount] = useState<number | null>(null);

  // A promise chain, not try/finally: the React Compiler skips a component holding the latter.
  const handleDownload = () => {
    setDownloading(true);
    downloadAccountBackup()
      .then((total) => {
        setLastCount(total);
        toast.success('Backup scaricato');
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : 'Impossibile creare il backup.');
      })
      .finally(() => setDownloading(false));
  };

  return (
    <Tile
      eyebrow="Backup dei dati"
      reading={[
        {
          text:
            lastCount === null
              ? 'Un file con tutto ciò che hai inserito, per ricostruire l’account se i dati andassero persi.'
              : `Backup scaricato: ${lastCount.toLocaleString('it-IT')} documenti nel file.`,
        },
      ]}
    >
      <div className="mt-3">
        <Button
          type="button"
          variant="outline"
          onClick={handleDownload}
          disabled={disabled || downloading}
          className="h-11 gap-1.5 desktop:h-9"
        >
          {downloading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="h-4 w-4" aria-hidden="true" />
          )}
          Scarica backup
        </Button>
      </div>

      <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
        Contiene strumenti, operazioni, snapshot mensili, movimenti, categorie, dividendi, previdenza, budget,
        obiettivi, Allocazione, Consulente, note e impostazioni del TUO account. Restano fuori le conversazioni
        con l&apos;Assistente e i dati che l&apos;app ricalcola da sola (prezzi, cambi, rendimenti). Il file è in
        chiaro: conservalo in un posto sicuro.
      </div>
    </Tile>
  );
}
