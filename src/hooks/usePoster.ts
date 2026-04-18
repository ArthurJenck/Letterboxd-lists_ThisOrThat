import { useEffect, useState } from 'react';
import { fetchPoster, getCachedPoster, getPosterUrl, hasTmdbToken } from '../lib/tmdb';

export type PosterStatus = 'idle' | 'loading' | 'ready' | 'missing';

export interface PosterState {
  status: PosterStatus;
  url: string | null;
}

export function usePoster(name: string, year: number | null): PosterState {
  const cached = getCachedPoster(name, year);
  const initial: PosterState = cached
    ? { status: cached.posterPath ? 'ready' : 'missing', url: getPosterUrl(cached) }
    : hasTmdbToken()
    ? { status: 'loading', url: null }
    : { status: 'missing', url: null };

  const [state, setState] = useState<PosterState>(initial);

  useEffect(() => {
    let cancelled = false;
    const hit = getCachedPoster(name, year);

    if (hit) {
      setState({
        status: hit.posterPath ? 'ready' : 'missing',
        url: getPosterUrl(hit)
      });
      return;
    }

    if (!hasTmdbToken()) {
      setState({ status: 'missing', url: null });
      return;
    }

    setState({ status: 'loading', url: null });

    fetchPoster(name, year)
      .then((entry) => {
        if (cancelled) {
          return;
        }

        setState({
          status: entry.posterPath ? 'ready' : 'missing',
          url: getPosterUrl(entry)
        });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setState({ status: 'missing', url: null });
      });

    return () => {
      cancelled = true;
    };
  }, [name, year]);

  return state;
}
