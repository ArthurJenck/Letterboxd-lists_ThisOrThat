import type { RankingSession } from './types';
import { SESSION_VERSION, migrateSessionIfNeeded } from './ranking';

const STORAGE_KEY = 'letterboxd-duel-sorter/session';

function hasLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function isRankingSession(value: unknown): value is RankingSession {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<RankingSession>;

  return (
    candidate.version === SESSION_VERSION &&
    Array.isArray(candidate.films) &&
    Array.isArray(candidate.rankedIds) &&
    Array.isArray(candidate.pendingIds) &&
    typeof candidate.fileHash === 'string'
  );
}

export function loadStoredSession(): RankingSession | null {
  if (!hasLocalStorage()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    const session = isRankingSession(parsed) ? parsed : null;
    return session ? migrateSessionIfNeeded(session) : null;
  } catch {
    return null;
  }
}

export function saveStoredSession(session: RankingSession): void {
  if (!hasLocalStorage()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession(): void {
  if (!hasLocalStorage()) {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
}

export function isSameImportedFile(session: RankingSession | null, fileHash: string): boolean {
  return Boolean(session && session.fileHash === fileHash);
}
