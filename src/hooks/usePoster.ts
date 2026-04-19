import { useEffect, useState } from 'react';
import {
  fetchPoster,
  getCachedPoster,
  getPosterUrl,
  hasTmdbToken,
  resolveDisplayName
} from '../lib/tmdb';

export type PosterStatus = 'idle' | 'loading' | 'ready' | 'missing';

export interface PosterState {
  status: PosterStatus;
  url: string | null;
  displayName: string;
}

export function usePoster(name: string, year: number | null): PosterState {
  const cached = getCachedPoster(name, year);
  const initial: PosterState = cached
    ? {
        status: cached.posterPath ? 'ready' : 'missing',
        url: getPosterUrl(cached),
        displayName: resolveDisplayName(name, year)
      }
    : hasTmdbToken()
    ? { status: 'loading', url: null, displayName: name }
    : { status: 'missing', url: null, displayName: name };

  const [state, setState] = useState<PosterState>(initial);

  useEffect(() => {
    let cancelled = false;
    const hit = getCachedPoster(name, year);

    if (hit) {
      setState({
        status: hit.posterPath ? 'ready' : 'missing',
        url: getPosterUrl(hit),
        displayName: resolveDisplayName(name, year)
      });
      return;
    }

    if (!hasTmdbToken()) {
      setState({ status: 'missing', url: null, displayName: name });
      return;
    }

    setState({ status: 'loading', url: null, displayName: name });

    fetchPoster(name, year)
      .then((entry) => {
        if (cancelled) {
          return;
        }

        setState({
          status: entry.posterPath ? 'ready' : 'missing',
          url: getPosterUrl(entry),
          displayName: resolveDisplayName(name, year)
        });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setState({ status: 'missing', url: null, displayName: name });
      });

    return () => {
      cancelled = true;
    };
  }, [name, year]);

  return state;
}
