import { usePoster } from '../hooks/usePoster';
import type { FilmRecord } from '../lib/types';

interface DuelCardProps {
  film: FilmRecord;
  side: 'left' | 'right';
  shortcut: string;
  onSelect: () => void;
}

function formatYear(year: number | null): string {
  return year ? String(year) : 'année inconnue';
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);

  if (parts.length === 0) {
    return '?';
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

export default function DuelCard({
  film,
  side,
  shortcut,
  onSelect
}: DuelCardProps) {
  const poster = usePoster(film.name, film.year);

  return (
    <article
      className={`duel-card duel-card--${side}`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="duel-card__poster" data-status={poster.status}>
        {poster.status === 'ready' && poster.url ? (
          <img src={poster.url} alt={`Affiche de ${film.name}`} loading="lazy" />
        ) : (
          <span className="duel-card__poster-fallback" aria-hidden="true">
            {getInitials(film.name)}
          </span>
        )}
        <span className="duel-card__corner" aria-hidden="true">
          {shortcut}
        </span>
      </div>
      <div className="duel-card__content">
        <h3 className="duel-card__title">{film.name}</h3>
        <div className="duel-card__meta">
          <span>{formatYear(film.year)}</span>
          {film.url ? (
            <a
              href={film.url}
              target="_blank"
              rel="noreferrer"
              className="duel-card__link"
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              Ouvrir sur Letterboxd
            </a>
          ) : null}
        </div>
        {film.description ? (
          <p className="duel-card__body">{film.description}</p>
        ) : null}
      </div>
    </article>
  );
}
