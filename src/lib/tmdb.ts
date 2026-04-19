const CACHE_KEY = 'letterboxd-duel-sorter/posters/v6';
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w342';
const API_BASE = 'https://api.themoviedb.org/3/search/movie';

export interface PosterEntry {
  posterPath: string | null;
  tmdbId: number | null;
  originalTitle?: string | null;
  originalLanguage?: string | null;
}

interface TmdbSearchResult {
  id: number;
  poster_path: string | null;
  title?: string;
  original_title?: string;
  original_language?: string;
  release_date?: string;
  popularity?: number;
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsAsWords(haystack: string, needle: string): boolean {
  if (!haystack || !needle) {
    return false;
  }

  return ` ${haystack} `.includes(` ${needle} `);
}

function hasStrongWordBoundaryMatch(
  haystack: string,
  needle: string,
  minCoverage = 0.5
): boolean {
  if (!containsAsWords(haystack, needle)) {
    return false;
  }

  return needle.length / haystack.length >= minCoverage;
}

function scoreCandidate(
  result: TmdbSearchResult,
  normalizedQuery: string,
  targetYear: number | null
): number {
  let score = 0;
  const resultYear = result.release_date
    ? Number.parseInt(result.release_date.slice(0, 4), 10)
    : null;

  if (targetYear !== null && resultYear !== null && !Number.isNaN(resultYear)) {
    const diff = Math.abs(resultYear - targetYear);
    if (diff === 0) score += 100;
    else if (diff === 1) score += 40;
    else if (diff === 2) score += 10;
  }

  const normTitle = result.title ? normalizeTitle(result.title) : '';
  const normOriginal = result.original_title ? normalizeTitle(result.original_title) : '';

  if (normTitle === normalizedQuery || normOriginal === normalizedQuery) {
    score += 80;
  } else if (
    hasStrongWordBoundaryMatch(normTitle, normalizedQuery) ||
    hasStrongWordBoundaryMatch(normOriginal, normalizedQuery)
  ) {
    score += 15;
  }

  score += Math.min(result.popularity ?? 0, 25);
  return score;
}

function pickBestResult(
  results: TmdbSearchResult[],
  name: string,
  year: number | null
): TmdbSearchResult | null {
  if (results.length === 0) {
    return null;
  }

  const normalizedQuery = normalizeTitle(name);
  let best = results[0];
  let bestScore = scoreCandidate(best, normalizedQuery, year);

  for (let index = 1; index < results.length; index += 1) {
    const candidateScore = scoreCandidate(results[index], normalizedQuery, year);
    if (candidateScore > bestScore) {
      best = results[index];
      bestScore = candidateScore;
    }
  }

  return best;
}

type PosterCache = Record<string, PosterEntry>;

const inFlight = new Map<string, Promise<PosterEntry>>();
let cacheMemo: PosterCache | null = null;
let apiDisabled = false;

function cacheKey(name: string, year: number | null): string {
  const normalised = name.toLowerCase().trim().replace(/\s+/g, ' ');
  return `${normalised}|${year ?? ''}`;
}

function readCache(): PosterCache {
  if (cacheMemo) {
    return cacheMemo;
  }

  if (typeof localStorage === 'undefined') {
    cacheMemo = {};
    return cacheMemo;
  }

  try {
    const raw = localStorage.getItem(CACHE_KEY);
    cacheMemo = raw ? (JSON.parse(raw) as PosterCache) : {};
  } catch {
    cacheMemo = {};
  }

  return cacheMemo;
}

function writeCache(cache: PosterCache): void {
  cacheMemo = cache;

  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // quota or disabled storage — ignore silently
  }
}

export function getPosterUrl(entry: PosterEntry | null | undefined): string | null {
  if (!entry?.posterPath) {
    return null;
  }

  return `${IMAGE_BASE}${entry.posterPath}`;
}

export function getCachedPoster(name: string, year: number | null): PosterEntry | null {
  const cache = readCache();
  return cache[cacheKey(name, year)] ?? null;
}

export function resolveDisplayName(name: string, year: number | null): string {
  const entry = getCachedPoster(name, year);

  if (
    entry?.originalLanguage === 'fr' &&
    entry.originalTitle &&
    entry.originalTitle.trim().length > 0
  ) {
    return entry.originalTitle;
  }

  return name;
}

export function hasTmdbToken(): boolean {
  return Boolean(import.meta.env.VITE_TMDB_READ_TOKEN) && !apiDisabled;
}

export async function fetchPoster(name: string, year: number | null): Promise<PosterEntry> {
  const key = cacheKey(name, year);
  const cache = readCache();
  const cached = cache[key];

  if (cached) {
    return cached;
  }

  const token = import.meta.env.VITE_TMDB_READ_TOKEN;

  if (!token || apiDisabled) {
    const empty: PosterEntry = { posterPath: null, tmdbId: null };
    return empty;
  }

  const existing = inFlight.get(key);

  if (existing) {
    return existing;
  }

  const promise = (async (): Promise<PosterEntry> => {
    try {
      const params = new URLSearchParams({ query: name, language: 'en-US' });

      if (year) {
        params.set('year', String(year));
      }

      const response = await fetch(`${API_BASE}?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        }
      });

      if (response.status === 401) {
        apiDisabled = true;
        throw new Error('TMDB 401 — token invalide.');
      }

      if (!response.ok) {
        throw new Error(`TMDB ${response.status}`);
      }

      const data = (await response.json()) as {
        results?: TmdbSearchResult[];
      };
      const best = pickBestResult(data.results ?? [], name, year);
      const entry: PosterEntry = {
        posterPath: best?.poster_path ?? null,
        tmdbId: best?.id ?? null,
        originalTitle: best?.original_title ?? null,
        originalLanguage: best?.original_language ?? null
      };

      const next = { ...readCache(), [key]: entry };
      writeCache(next);
      return entry;
    } catch (error) {
      const fallback: PosterEntry = { posterPath: null, tmdbId: null };

      if (!(error instanceof Error) || !error.message.includes('401')) {
        const next = { ...readCache(), [key]: fallback };
        writeCache(next);
      }

      return fallback;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

export function clearPosterCache(): void {
  cacheMemo = {};

  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}
