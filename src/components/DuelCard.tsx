import type { FilmRecord } from '../lib/types';

interface DuelCardProps {
  film: FilmRecord;
  side: 'left' | 'right';
  shortcut: string;
  caption: string;
  onSelect: () => void;
}

function formatYear(year: number | null): string {
  return year ? String(year) : 'année inconnue';
}

export default function DuelCard({
  film,
  side,
  shortcut,
  caption,
  onSelect
}: DuelCardProps) {
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
      <span className="duel-card__corner">{shortcut}</span>
      <span className="duel-card__caption">{caption}</span>
      <span className="duel-card__title">{film.name}</span>
      <span className="duel-card__meta">
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
        ) : (
          <span>Sans lien</span>
        )}
      </span>
      <span className="duel-card__body">
        {film.description
          ? `Archive source: ${film.description}`
          : 'Choisis simplement celui que tu préfères.'}
      </span>
      <span className="duel-card__footer">
        <span className="duel-card__cta">Choisir ce film</span>
      </span>
    </article>
  );
}
