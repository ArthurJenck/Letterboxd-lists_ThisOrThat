import {
  startTransition,
  type ChangeEvent,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState
} from 'react';
import DuelCard from './components/DuelCard';
import { hashText } from './lib/hash';
import { exportLetterboxdCsv, parseLetterboxdCsv } from './lib/letterboxd';
import { clearStoredSession, isSameImportedFile, loadStoredSession, saveStoredSession } from './lib/persistence';
import {
  applyChoice,
  createSession,
  estimateRemainingDuels,
  getCurrentMatchFilms,
  getInsertionWindow,
  getPhaseLabel,
  getRankedFilms,
  restartSession,
  undoLastChoice
} from './lib/ranking';
import type { RankingSession } from './lib/types';
import sampleCsv from '../films-vus-ranges.csv?raw';

type BannerTone = 'info' | 'success' | 'error';

interface BannerState {
  tone: BannerTone;
  message: string;
}

const bootSession = loadStoredSession();

function formatNumber(value: number): string {
  return new Intl.NumberFormat('fr-FR').format(value);
}

function formatDate(value: string): string {
  if (!value) {
    return 'date inconnue';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function downloadCsv(session: RankingSession): void {
  const csv = exportLetterboxdCsv(session.metadata, session.films, session.rankedIds);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const safeName = session.metadata.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '');

  anchor.href = url;
  anchor.download = `${safeName || 'letterboxd-classement'}-sorted.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [session, setSession] = useState<RankingSession | null>(bootSession);
  const [banner, setBanner] = useState<BannerState | null>(
    bootSession
      ? {
          tone: 'info',
          message: `Session locale reprise automatiquement pour ${bootSession.stats.totalFilms} films.`
        }
      : null
  );
  const [isImporting, setIsImporting] = useState(false);
  const deferredSession = useDeferredValue(session);
  const matchFilms = session ? getCurrentMatchFilms(session) : null;
  const rankedPreview = deferredSession ? getRankedFilms(deferredSession) : [];
  const estimatedRemaining = session ? estimateRemainingDuels(session) : 0;
  const insertionWindow = session ? getInsertionWindow(session) : null;

  useEffect(() => {
    if (session) {
      saveStoredSession(session);
    }
  }, [session]);

  const ingestCsv = async (csvText: string, sourceName: string) => {
    setIsImporting(true);

    try {
      const fileHash = hashText(csvText);
      const storedSession = loadStoredSession();

      if (isSameImportedFile(storedSession, fileHash)) {
        startTransition(() => {
          setSession(storedSession);
          setBanner({
            tone: 'success',
            message: 'Session existante retrouvée pour ce même CSV.'
          });
        });
        return;
      }

      const parsed = parseLetterboxdCsv(csvText);
      const nextSession = createSession(parsed, {
        fileHash,
        sourceName
      });

      startTransition(() => {
        setSession(nextSession);
        setBanner({
          tone: 'success',
          message: `${parsed.films.length} films chargés depuis ${sourceName}.`
        });
      });
    } catch (error) {
      setBanner({
        tone: 'error',
        message:
          error instanceof Error
            ? error.message
            : "Le CSV n'a pas pu être chargé."
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const text = await file.text();
    await ingestCsv(text, file.name);
    event.target.value = '';
  };

  const handleChoice = (preferredSide: 'left' | 'right') => {
    startTransition(() => {
      setSession((current) => (current ? applyChoice(current, preferredSide) : current));
    });
  };

  const handleUndo = () => {
    if (!session) {
      return;
    }

    const previous = undoLastChoice(session);

    startTransition(() => {
      setSession(previous);
      setBanner({
        tone: 'info',
        message:
          previous === session
            ? "Aucun duel à annuler pour le moment."
            : 'Dernier duel annulé.'
      });
    });
  };

  const handleRestart = () => {
    if (!session) {
      return;
    }

    const restarted = restartSession(session);

    startTransition(() => {
      setSession(restarted);
      setBanner({
        tone: 'info',
        message: "Session réinitialisée avec un ordre de départ mélangé de façon déterministe."
      });
    });
  };

  const handleClear = () => {
    clearStoredSession();
    setSession(null);
    setBanner({
      tone: 'info',
      message: "Session locale effacée. Tu peux repartir d'un nouveau CSV."
    });
  };

  const handleDownload = () => {
    if (!session) {
      return;
    }

    downloadCsv(session);
    setBanner({
      tone: 'success',
      message: 'CSV trié téléchargé.'
    });
  };

  const onKeyboardShortcuts = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;

    if (
      target &&
      ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(target.tagName)
    ) {
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      handleChoice('left');
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      handleChoice('right');
    }

    if (event.key.toLowerCase() === 'u') {
      event.preventDefault();
      handleUndo();
    }
  });

  useEffect(() => {
    window.addEventListener('keydown', onKeyboardShortcuts);

    return () => {
      window.removeEventListener('keydown', onKeyboardShortcuts);
    };
  }, [onKeyboardShortcuts]);

  const placedRatio = session
    ? Math.round((session.stats.insertedCount / session.stats.totalFilms) * 100)
    : 0;

  return (
    <div className="app-shell">
      <div className="ambient ambient--left" />
      <div className="ambient ambient--right" />

      <header className="hero">
        <div className="hero__copy">
          <p className="hero__eyebrow">Letterboxd duel sorter</p>
          <h1>Reclasse ta liste film contre film.</h1>
          <p className="hero__lede">
            Tu charges un export CSV, l'app te montre les duels utiles, puis
            elle reconstruit un vrai ordre de préférence sans repartir de ton
            classement actuel.
          </p>

          <div className="hero__actions" data-hotkeys="ignore">
            <button
              type="button"
              className="button button--primary"
              onClick={() => {
                fileInputRef.current?.click();
              }}
              disabled={isImporting}
            >
              {isImporting ? 'Chargement...' : 'Importer un CSV'}
            </button>

            <button
              type="button"
              className="button button--ghost"
              onClick={() => {
                void ingestCsv(sampleCsv, 'films-vus-ranges.csv');
              }}
              disabled={isImporting}
            >
              Charger l'exemple du repo
            </button>

            {session ? (
              <>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={handleRestart}
                >
                  Recommencer
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={handleClear}
                >
                  Effacer la session
                </button>
              </>
            ) : null}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(event) => {
              void handleFileSelection(event);
            }}
          />

          {banner ? (
            <p className={`banner banner--${banner.tone}`}>{banner.message}</p>
          ) : null}
        </div>

        <aside className="hero__panel">
          <p className="hero__panel-label">Mode d'emploi</p>
          <ol className="hero__steps">
            <li>Importe ton export Letterboxd au format CSV.</li>
            <li>Choisis ton préféré à gauche ou à droite.</li>
            <li>Télécharge le CSV final quand la vérification se termine.</li>
          </ol>
          <div className="hero__meta">
            <div>
              <span>Raccourcis</span>
              <strong>← / → / U</strong>
            </div>
            <div>
              <span>Persistance</span>
              <strong>locale automatique</strong>
            </div>
          </div>
        </aside>
      </header>

      <main className="layout">
        <section className="stage">
          {session ? (
            <>
              <div className="stage__topline">
                <div>
                  <p className="stage__kicker">{getPhaseLabel(session.phase)}</p>
                  <h2>{session.metadata.name || 'Liste sans titre'}</h2>
                </div>
                <div className="stage__pills">
                  <span className="pill">
                    {formatNumber(session.stats.comparisons)} duels
                  </span>
                  <span className="pill">
                    env. {formatNumber(estimatedRemaining)} restants
                  </span>
                  <span className="pill">
                    {formatNumber(session.stats.insertedCount)} /{' '}
                    {formatNumber(session.stats.totalFilms)} places
                  </span>
                </div>
              </div>

              <div className="meter">
                <div
                  className="meter__fill"
                  style={{ width: `${session.phase === 'complete' ? 100 : placedRatio}%` }}
                />
              </div>

              <div className="stage__summary">
                <p>
                  Source: <strong>{session.sourceName}</strong>
                </p>
                <p>Dernière activité: {formatDate(session.stats.updatedAt)}</p>
                {insertionWindow ? <p>{insertionWindow}</p> : null}
                {session.phase === 'validating' && session.validation ? (
                  <p>
                    Passe {session.validation.sweep}, index{' '}
                    {session.validation.index + 1} sur {session.rankedIds.length - 1}
                  </p>
                ) : null}
              </div>

              {session.phase !== 'complete' && matchFilms ? (
                <>
                  <div className="duel-grid">
                    <DuelCard
                      film={matchFilms.left}
                      side="left"
                      shortcut="←"
                      caption="gauche"
                      onSelect={() => {
                        handleChoice('left');
                      }}
                    />
                    <div className="versus">
                      <span className="versus__mark">VS</span>
                      <p>Choisis ton préféré.</p>
                    </div>
                    <DuelCard
                      film={matchFilms.right}
                      side="right"
                      shortcut="→"
                      caption="droite"
                      onSelect={() => {
                        handleChoice('right');
                      }}
                    />
                  </div>

                  <div className="duel-actions" data-hotkeys="ignore">
                    <button
                      type="button"
                      className="button button--subtle"
                      onClick={handleUndo}
                    >
                      Annuler le dernier duel
                    </button>
                    <p>
                      L'ordre source n'est jamais réutilisé comme classement.
                      Chaque clic fait avancer un placement réel.
                    </p>
                  </div>
                </>
              ) : (
                <div className="completion-card" data-hotkeys="ignore">
                  <p className="completion-card__eyebrow">Terminé</p>
                  <h3>Ton nouveau classement est prêt.</h3>
                  <p>
                    La passe de vérification n'a plus détecté de duel à
                    inverser. Tu peux maintenant télécharger le CSV trié.
                  </p>
                  <div className="completion-card__actions">
                    <button
                      type="button"
                      className="button button--primary"
                      onClick={handleDownload}
                    >
                      Télécharger le CSV final
                    </button>
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={handleRestart}
                    >
                      Repartir de zéro
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">
              <p className="empty-state__eyebrow">Prise en main</p>
              <h2>Charge ta liste et laisse le duel faire le sale boulot.</h2>
              <p>
                L'app lit le format Letterboxd v7, mélange l'ordre de départ de
                façon déterministe, sauvegarde ta session en local et te rend un
                nouveau CSV trié.
              </p>
              <div className="empty-state__actions" data-hotkeys="ignore">
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => {
                    fileInputRef.current?.click();
                  }}
                >
                  Importer mon export
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => {
                    void ingestCsv(sampleCsv, 'films-vus-ranges.csv');
                  }}
                >
                  Tester avec le CSV du repo
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="sidebar">
          <section className="sidebar-card">
            <p className="sidebar-card__eyebrow">Aperçu</p>
            <h3>Le haut du classement provisoire</h3>
            {rankedPreview.length > 0 ? (
              <ol className="ranking-list">
                {rankedPreview.slice(0, 8).map((film, index) => (
                  <li key={film.id} className="ranking-list__item">
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <strong>{film.name}</strong>
                      <small>{film.year ?? 'année inconnue'}</small>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="sidebar-card__empty">
                Aucun classement tant qu'aucun CSV n'a été importé.
              </p>
            )}
          </section>

          <section className="sidebar-card">
            <p className="sidebar-card__eyebrow">Session</p>
            <h3>Ce que l'app retient</h3>
            <dl className="facts">
              <div>
                <dt>Films</dt>
                <dd>{session ? formatNumber(session.stats.totalFilms) : '0'}</dd>
              </div>
              <div>
                <dt>Vérification</dt>
                <dd>
                  {session
                    ? formatNumber(session.stats.validationComparisons)
                    : '0'}
                </dd>
              </div>
              <div>
                <dt>Historique undo</dt>
                <dd>{session ? formatNumber(session.history.length) : '0'}</dd>
              </div>
              <div>
                <dt>Hash source</dt>
                <dd>{session ? session.fileHash : '---'}</dd>
              </div>
            </dl>
          </section>

          <section className="sidebar-card">
            <p className="sidebar-card__eyebrow">Export</p>
            <h3>Sortie CSV Letterboxd-like</h3>
            <p className="sidebar-card__empty">
              Les positions sont réécrites selon le nouvel ordre, tandis que
              `Name`, `Year`, `URL` et `Description` sont conservés.
            </p>
          </section>
        </aside>
      </main>
    </div>
  );
}

export default App;
