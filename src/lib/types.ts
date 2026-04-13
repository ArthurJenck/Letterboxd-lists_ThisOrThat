export type SessionPhase = 'idle' | 'inserting' | 'validating' | 'complete';

export interface LetterboxdMetadata {
  exportVersion: string;
  date: string;
  name: string;
  tags: string;
  url: string;
  description: string;
}

export interface FilmRecord {
  id: number;
  sourcePosition: number;
  name: string;
  year: number | null;
  url: string;
  description: string;
}

export interface ParsedLetterboxdCsv {
  metadata: LetterboxdMetadata;
  films: FilmRecord[];
}

export interface InsertionMatch {
  kind: 'insertion';
  candidateId: number;
  opponentId: number;
  low: number;
  high: number;
  mid: number;
}

export interface ValidationMatch {
  kind: 'validation';
  leftId: number;
  rightId: number;
  index: number;
  sweep: number;
}

export type CurrentMatch = InsertionMatch | ValidationMatch | null;

export interface ValidationState {
  index: number;
  sweep: number;
  swapsInSweep: number;
  totalSwaps: number;
  totalSweeps: number;
}

export interface RankingStats {
  totalFilms: number;
  comparisons: number;
  insertedCount: number;
  validationComparisons: number;
  startedAt: string;
  updatedAt: string;
}

export interface SessionSnapshot {
  phase: Exclude<SessionPhase, 'idle'>;
  rankedIds: number[];
  pendingIds: number[];
  currentMatch: CurrentMatch;
  validation: ValidationState | null;
  stats: RankingStats;
}

export interface RankingSession extends SessionSnapshot {
  version: 1;
  fileHash: string;
  sourceName: string;
  metadata: LetterboxdMetadata;
  films: FilmRecord[];
  history: SessionSnapshot[];
}

export interface MatchFilms {
  left: FilmRecord;
  right: FilmRecord;
}
