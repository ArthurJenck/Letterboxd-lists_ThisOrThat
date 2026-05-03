import { deterministicShuffle } from './hash';
import type {
  CurrentMatch,
  FilmRecord,
  MatchFilms,
  ParsedLetterboxdCsv,
  RankingSession,
  RankingStats,
  SessionSnapshot,
  ValidationMatch,
  ValidationState
} from './types';

export const SESSION_VERSION = 1;
const MAX_HISTORY = 48;

function nowIso(explicitTime?: string): string {
  return explicitTime ?? new Date().toISOString();
}

function cloneStats(stats: RankingStats): RankingStats {
  return {
    ...stats
  };
}

function cloneValidation(validation: ValidationState | null): ValidationState | null {
  return validation
    ? {
        ...validation,
        seenPairs: [...validation.seenPairs]
      }
    : null;
}

function pairKeyFor(idA: number, idB: number): string {
  return idA < idB ? `${idA}-${idB}` : `${idB}-${idA}`;
}

function snapshot(session: RankingSession): SessionSnapshot {
  return {
    phase: session.phase,
    rankedIds: [...session.rankedIds],
    pendingIds: [...session.pendingIds],
    currentMatch: session.currentMatch ? { ...session.currentMatch } : null,
    validation: cloneValidation(session.validation),
    stats: cloneStats(session.stats)
  };
}

function pushHistory(session: RankingSession, nextSnapshot: SessionSnapshot): SessionSnapshot[] {
  return [...session.history, nextSnapshot].slice(-MAX_HISTORY);
}

function buildInsertionMatch(candidateId: number, rankedIds: number[], low = 0, high = rankedIds.length) {
  const mid = Math.floor((low + high) / 2);

  return {
    kind: 'insertion' as const,
    candidateId,
    opponentId: rankedIds[mid],
    low,
    high,
    mid
  };
}

function buildValidationState(n = 0): ValidationState {
  const gap = Math.max(2, Math.floor(n / 10));
  return {
    index: 0,
    sweep: 1,
    swapsInSweep: 0,
    totalSwaps: 0,
    totalSweeps: 0,
    strategy: 'stratified',
    gap,
    currentLeftIndex: 0,
    currentRightIndex: gap,
    passKind: 'wide',
    budgetRemaining: Math.max(8, Math.floor(n / 2)),
    seenPairs: [],
    quietPasses: 0,
  };
}

function buildValidationMatch(rankedIds: number[], validation: ValidationState): ValidationMatch | null {
  if (rankedIds.length < 2 || validation.currentRightIndex >= rankedIds.length) {
    return null;
  }

  return {
    kind: 'validation',
    leftId: rankedIds[validation.currentLeftIndex],
    rightId: rankedIds[validation.currentRightIndex],
    index: validation.currentLeftIndex,
    sweep: validation.sweep
  };
}

function buildStats(totalFilms: number, explicitTime?: string): RankingStats {
  const timestamp = nowIso(explicitTime);

  return {
    totalFilms,
    comparisons: 0,
    insertedCount: Math.min(totalFilms, 1),
    validationComparisons: 0,
    startedAt: timestamp,
    updatedAt: timestamp
  };
}

function completeSession(session: RankingSession, explicitTime?: string): RankingSession {
  return {
    ...session,
    phase: 'complete',
    currentMatch: null,
    validation: session.validation
      ? {
          ...session.validation
        }
      : null,
    stats: {
      ...session.stats,
      updatedAt: nowIso(explicitTime)
    }
  };
}

function startValidation(session: RankingSession, explicitTime?: string): RankingSession {
  const N = session.rankedIds.length;
  const validation = buildValidationState(N);
  const currentMatch = buildValidationMatch(session.rankedIds, validation);

  if (!currentMatch) {
    return completeSession({ ...session, validation }, explicitTime);
  }

  return {
    ...session,
    phase: 'validating',
    currentMatch,
    validation,
    stats: {
      ...session.stats,
      updatedAt: nowIso(explicitTime)
    }
  };
}

export function createSession(
  parsed: ParsedLetterboxdCsv,
  options: {
    fileHash: string;
    sourceName: string;
    startedAt?: string;
  }
): RankingSession {
  if (parsed.films.length === 0) {
    throw new Error('Impossible de créer une session sans films.');
  }

  const shuffledIds = deterministicShuffle(
    parsed.films.map((film) => film.id),
    options.fileHash
  );
  const rankedIds = [shuffledIds[0]];
  const pendingIds = shuffledIds.slice(1);
  const baseSession: RankingSession = {
    version: SESSION_VERSION,
    fileHash: options.fileHash,
    sourceName: options.sourceName,
    metadata: parsed.metadata,
    films: parsed.films,
    phase: pendingIds.length > 0 ? 'inserting' : 'complete',
    rankedIds,
    pendingIds,
    currentMatch: pendingIds.length > 0 ? buildInsertionMatch(pendingIds[0], rankedIds) : null,
    validation: null,
    stats: buildStats(parsed.films.length, options.startedAt),
    history: []
  };

  if (pendingIds.length === 0) {
    return completeSession(baseSession, options.startedAt);
  }

  return baseSession;
}

export function restartSession(session: RankingSession, explicitTime?: string): RankingSession {
  return createSession(
    {
      metadata: session.metadata,
      films: session.films
    },
    {
      fileHash: session.fileHash,
      sourceName: session.sourceName,
      startedAt: explicitTime
    }
  );
}

function insertAt(ids: number[], targetId: number, index: number): number[] {
  const copy = [...ids];
  copy.splice(index, 0, targetId);
  return copy;
}

export function applyChoice(
  session: RankingSession,
  preferredSide: 'left' | 'right',
  explicitTime?: string
): RankingSession {
  if (!session.currentMatch) {
    return session;
  }

  const before = snapshot(session);
  const timestamp = nowIso(explicitTime);

  if (session.currentMatch.kind === 'insertion') {
    const { candidateId, low, high, mid } = session.currentMatch;
    const nextLow = preferredSide === 'left' ? low : mid + 1;
    const nextHigh = preferredSide === 'left' ? mid : high;
    const stats = {
      ...session.stats,
      comparisons: session.stats.comparisons + 1,
      updatedAt: timestamp
    };

    if (nextLow >= nextHigh) {
      const rankedIds = insertAt(session.rankedIds, candidateId, nextLow);
      const pendingIds = session.pendingIds.slice(1);
      const nextSession: RankingSession = {
        ...session,
        phase: pendingIds.length > 0 ? 'inserting' : session.phase,
        rankedIds,
        pendingIds,
        currentMatch: null,
        validation: null,
        stats: {
          ...stats,
          insertedCount: rankedIds.length
        },
        history: pushHistory(session, before)
      };

      if (pendingIds.length > 0) {
        return {
          ...nextSession,
          currentMatch: buildInsertionMatch(pendingIds[0], rankedIds)
        };
      }

      return startValidation(nextSession, timestamp);
    }

    return {
      ...session,
      currentMatch: buildInsertionMatch(candidateId, session.rankedIds, nextLow, nextHigh),
      stats,
      history: pushHistory(session, before)
    };
  }

  const validation = session.validation ?? buildValidationState(session.rankedIds.length);
  const { currentLeftIndex, currentRightIndex, gap, passKind, budgetRemaining } = validation;
  const N = session.rankedIds.length;
  const pairKey = pairKeyFor(session.rankedIds[currentLeftIndex], session.rankedIds[currentRightIndex]);
  const seenPairs = [...validation.seenPairs, pairKey];

  let rankedIds = [...session.rankedIds];
  let moved = false;

  if (preferredSide === 'right') {
    const actualGap = currentRightIndex - currentLeftIndex;
    if (actualGap > 5) {
      const rightId = rankedIds[currentRightIndex];
      rankedIds.splice(currentRightIndex, 1);
      rankedIds.splice(currentLeftIndex, 0, rightId);
    } else {
      [rankedIds[currentLeftIndex], rankedIds[currentRightIndex]] = [rankedIds[currentRightIndex], rankedIds[currentLeftIndex]];
    }
    moved = true;
  }

  const swapsInSweep = validation.swapsInSweep + (moved ? 1 : 0);
  const totalSwaps = validation.totalSwaps + (moved ? 1 : 0);
  const stats = {
    ...session.stats,
    comparisons: session.stats.comparisons + 1,
    validationComparisons: session.stats.validationComparisons + 1,
    updatedAt: timestamp
  };
  const newBudget = budgetRemaining - 1;

  if (newBudget <= 0) {
    return completeSession({
      ...session,
      rankedIds,
      validation: { ...validation, seenPairs, swapsInSweep, totalSwaps, budgetRemaining: 0 },
      stats,
      history: pushHistory(session, before)
    }, timestamp);
  }

  const nextLeft = currentLeftIndex + 1;
  const nextRight = nextLeft + (passKind === 'wide' ? gap : 1);

  if (nextRight >= N) {
    const quietPasses = swapsInSweep === 0 ? validation.quietPasses + 1 : 0;
    if (quietPasses >= 3) {
      return completeSession({
        ...session,
        rankedIds,
        validation: { ...validation, seenPairs, swapsInSweep, totalSwaps, budgetRemaining: newBudget, quietPasses },
        stats,
        history: pushHistory(session, before)
      }, timestamp);
    }
    const nextPassKind: 'wide' | 'narrow' = passKind === 'wide' ? 'narrow' : 'wide';
    const resetLeft = 0;
    const resetRight = resetLeft + (nextPassKind === 'wide' ? gap : 1);
    const nextValidation: ValidationState = {
      ...validation,
      index: resetLeft,
      sweep: validation.sweep + 1,
      swapsInSweep: 0,
      totalSwaps,
      totalSweeps: validation.totalSweeps + 1,
      currentLeftIndex: resetLeft,
      currentRightIndex: resetRight,
      passKind: nextPassKind,
      budgetRemaining: newBudget,
      seenPairs,
      quietPasses,
    };
    const nextMatch = buildValidationMatch(rankedIds, nextValidation);
    if (!nextMatch) {
      return completeSession({ ...session, rankedIds, validation: nextValidation, stats, history: pushHistory(session, before) }, timestamp);
    }
    return {
      ...session,
      phase: 'validating',
      rankedIds,
      currentMatch: nextMatch,
      validation: nextValidation,
      stats,
      history: pushHistory(session, before)
    };
  }

  const nextValidation: ValidationState = {
    ...validation,
    index: nextLeft,
    swapsInSweep,
    totalSwaps,
    currentLeftIndex: nextLeft,
    currentRightIndex: nextRight,
    budgetRemaining: newBudget,
    seenPairs,
  };

  return {
    ...session,
    rankedIds,
    currentMatch: buildValidationMatch(rankedIds, nextValidation),
    validation: nextValidation,
    stats,
    history: pushHistory(session, before)
  };
}

export function moveInRanking(
  session: RankingSession,
  filmId: number,
  direction: 'up' | 'down',
  explicitTime?: string
): RankingSession {
  const idx = session.rankedIds.indexOf(filmId);
  if (idx < 0) return session;
  if (direction === 'up' && idx === 0) return session;
  if (direction === 'down' && idx === session.rankedIds.length - 1) return session;

  const before = snapshot(session);
  const swapWith = direction === 'up' ? idx - 1 : idx + 1;
  const nextRanked = [...session.rankedIds];
  [nextRanked[idx], nextRanked[swapWith]] = [nextRanked[swapWith], nextRanked[idx]];

  let nextCurrentMatch = session.currentMatch;

  if (session.phase === 'inserting' && session.currentMatch?.kind === 'insertion') {
    const { candidateId, low, high } = session.currentMatch;
    const minSwap = Math.min(idx, swapWith);
    const maxSwap = Math.max(idx, swapWith);
    if (minSwap < high && maxSwap >= low) {
      nextCurrentMatch = buildInsertionMatch(candidateId, nextRanked, low, high);
    }
  } else if (session.phase === 'validating' && session.validation) {
    nextCurrentMatch = buildValidationMatch(nextRanked, session.validation);
  }

  return {
    ...session,
    rankedIds: nextRanked,
    currentMatch: nextCurrentMatch,
    history: pushHistory(session, before),
    stats: { ...session.stats, updatedAt: nowIso(explicitTime) },
  };
}

export function removeFromRanking(
  session: RankingSession,
  filmId: number,
  explicitTime?: string
): RankingSession {
  if (!session.rankedIds.includes(filmId)) {
    return session;
  }

  const before = snapshot(session);
  const timestamp = nowIso(explicitTime);
  const rankedIds = session.rankedIds.filter((id) => id !== filmId);
  const pendingIds = [...session.pendingIds, filmId];
  const stats = {
    ...session.stats,
    insertedCount: rankedIds.length,
    updatedAt: timestamp
  };

  if (rankedIds.length === 0) {
    const seededRankedIds = [pendingIds[0]];
    const remainingPending = pendingIds.slice(1);
    const baseSession: RankingSession = {
      ...session,
      phase: remainingPending.length > 0 ? 'inserting' : 'complete',
      rankedIds: seededRankedIds,
      pendingIds: remainingPending,
      currentMatch: remainingPending.length > 0
        ? buildInsertionMatch(remainingPending[0], seededRankedIds)
        : null,
      validation: null,
      stats: {
        ...stats,
        insertedCount: seededRankedIds.length
      },
      history: pushHistory(session, before)
    };

    if (remainingPending.length === 0) {
      return completeSession(baseSession, timestamp);
    }

    return baseSession;
  }

  if (session.phase === 'inserting' && session.currentMatch?.kind === 'insertion') {
    return {
      ...session,
      rankedIds,
      pendingIds,
      currentMatch: buildInsertionMatch(session.currentMatch.candidateId, rankedIds),
      validation: null,
      stats,
      history: pushHistory(session, before)
    };
  }

  return {
    ...session,
    phase: 'inserting',
    rankedIds,
    pendingIds,
    currentMatch: buildInsertionMatch(pendingIds[0], rankedIds),
    validation: null,
    stats,
    history: pushHistory(session, before)
  };
}

export function undoLastChoice(session: RankingSession): RankingSession {
  const previous = session.history.at(-1);

  if (!previous) {
    return session;
  }

  return {
    ...session,
    phase: previous.phase,
    rankedIds: [...previous.rankedIds],
    pendingIds: [...previous.pendingIds],
    currentMatch: previous.currentMatch ? { ...previous.currentMatch } : null,
    validation: cloneValidation(previous.validation),
    stats: cloneStats(previous.stats),
    history: session.history.slice(0, -1)
  };
}

export function getCurrentMatchFilms(session: RankingSession): MatchFilms | null {
  if (!session.currentMatch) {
    return null;
  }

  if (session.currentMatch.kind === 'insertion') {
    return {
      left: session.films[session.currentMatch.candidateId],
      right: session.films[session.currentMatch.opponentId]
    };
  }

  return {
    left: session.films[session.currentMatch.leftId],
    right: session.films[session.currentMatch.rightId]
  };
}

function estimateBinaryComparisons(width: number): number {
  return Math.max(1, Math.ceil(Math.log2(width + 1)));
}

export function estimateRemainingDuels(session: RankingSession): number {
  if (session.phase === 'complete') {
    return 0;
  }

  if (session.currentMatch?.kind === 'insertion') {
    let estimate = estimateBinaryComparisons(session.currentMatch.high - session.currentMatch.low + 1);
    let rankedCount = session.rankedIds.length + 1;

    for (let index = 1; index < session.pendingIds.length; index += 1) {
      estimate += estimateBinaryComparisons(rankedCount);
      rankedCount += 1;
    }

    return estimate + Math.max(3, Math.ceil(session.films.length / 8));
  }

  return session.validation?.budgetRemaining ?? Math.max(8, Math.floor(session.rankedIds.length / 2));
}

export function findFilmById(films: FilmRecord[], id: number): FilmRecord {
  const film = films[id];

  if (!film) {
    throw new Error(`Film introuvable pour l'identifiant ${id}.`);
  }

  return film;
}

export function getRankedFilms(session: RankingSession): FilmRecord[] {
  return session.rankedIds.map((id) => findFilmById(session.films, id));
}

export function getPhaseLabel(phase: RankingSession['phase']): string {
  switch (phase) {
    case 'inserting':
      return 'Placement';
    case 'validating':
      return 'Vérification';
    case 'complete':
      return 'Classement terminé';
    default:
      return 'Prêt';
  }
}

export function migrateSessionIfNeeded(session: RankingSession): RankingSession {
  if (session.phase === 'validating' && session.validation && !('strategy' in session.validation)) {
    return startValidation({ ...session, validation: null });
  }
  return session;
}

export function getInsertionWindow(session: RankingSession): string | null {
  if (session.currentMatch?.kind !== 'insertion') {
    return null;
  }

  const { low, high } = session.currentMatch;
  const minimum = low + 1;
  const maximum = high + 1;

  if (minimum === maximum) {
    return `Place visée : ${minimum}`;
  }

  return `Fenêtre actuelle : entre ${minimum} et ${maximum}`;
}
