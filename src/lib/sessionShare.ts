import { isRankingSession } from './persistence';
import type { RankingSession } from './types';

const SHARE_KIND = 'letterboxd-duel-sorter/session';
const SHARE_VERSION = 1 as const;

interface SharedSessionEnvelope {
  kind: typeof SHARE_KIND;
  version: typeof SHARE_VERSION;
  exportedAt: string;
  session: RankingSession;
}

export function exportSessionAsJson(session: RankingSession): string {
  const envelope: SharedSessionEnvelope = {
    kind: SHARE_KIND,
    version: SHARE_VERSION,
    exportedAt: new Date().toISOString(),
    session
  };

  return JSON.stringify(envelope, null, 2);
}

export function parseSharedSession(text: string): RankingSession {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Fichier invalide : JSON illisible.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error("Fichier invalide : format inattendu.");
  }

  const envelope = parsed as Partial<SharedSessionEnvelope>;

  if (envelope.kind !== SHARE_KIND) {
    throw new Error("Ce fichier n'est pas une session Letterboxd Duel Sorter.");
  }

  if (envelope.version !== SHARE_VERSION) {
    throw new Error(
      `Version de session incompatible (reçu ${String(envelope.version)}, attendu ${SHARE_VERSION}).`
    );
  }

  if (!isRankingSession(envelope.session)) {
    throw new Error('Session corrompue ou incomplète.');
  }

  return envelope.session;
}

export function buildSessionFilename(session: RankingSession): string {
  const slug = session.metadata.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '');

  const date = new Date().toISOString().slice(0, 10);
  return `${slug || 'letterboxd-session'}-${date}.json`;
}
