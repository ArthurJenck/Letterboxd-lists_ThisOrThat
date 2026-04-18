const CACHE_KEY = 'letterboxd-duel-sorter/posters';
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w342';
const API_BASE = 'https://api.themoviedb.org/3/search/movie';

export interface PosterEntry {
  posterPath: string | null;
  tmdbId: number | null;
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
      const params = new URLSearchParams({ query: name, language: 'fr-FR' });

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
        results?: Array<{ id: number; poster_path: string | null }>;
      };
      const first = data.results?.[0];
      const entry: PosterEntry = {
        posterPath: first?.poster_path ?? null,
        tmdbId: first?.id ?? null
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
