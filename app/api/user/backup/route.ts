import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthErrorResponse, requireFirebaseAuth } from '@/lib/server/apiAuth';
import { buildAccountBackup } from '@/lib/server/accountBackupService';
import { backupFileName } from '@/lib/utils/accountBackup';
import { adminDb } from '@/lib/firebase/admin';

/**
 * GET /api/user/backup — the caller's whole account as one JSON file (2026-10-25).
 *
 * The account is ALWAYS the caller's own (`decodedToken.uid`), like /api/account/members: a
 * delegate viewing a shared account downloads their own, never the owner's. What goes in the file
 * and how each value is written: lib/utils/accountBackup.ts.
 *
 * A Vercel Function answers with at most 4.5 MB; the file is compact JSON and a larger one is
 * refused with a sentence rather than cut.
 *
 * A file served stamps `users/{uid}.lastBackupAt` (2026-10-25): the date the reminder in Strumenti
 * counts from (lib/utils/backupReminder.ts). A failed stamp never costs the owner the file.
 */

const MAX_RESPONSE_BYTES = 4_400_000;

export async function GET(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const now = new Date();
    const backup = await buildAccountBackup(decodedToken.uid, now);
    const body = JSON.stringify(backup);
    const bytes = Buffer.byteLength(body, 'utf8');

    if (bytes > MAX_RESPONSE_BYTES) {
      console.error(`[backup] File of ${bytes} bytes exceeds the response limit`);
      return NextResponse.json(
        { error: 'Il backup supera il limite di 4,4 MB di una singola risposta: serve dividerlo in più file.' },
        { status: 413 }
      );
    }

    try {
      await adminDb.collection('users').doc(decodedToken.uid).set({ lastBackupAt: now }, { merge: true });
    } catch (error) {
      console.error('[backup] Failed to stamp lastBackupAt:', error);
    }

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${backupFileName(now)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const authResponse = getApiAuthErrorResponse(error);
    if (authResponse) return authResponse;
    console.error('[backup] Failed to build the backup:', error);
    return NextResponse.json({ error: 'Impossibile creare il backup. Riprova tra poco.' }, { status: 500 });
  }
}
