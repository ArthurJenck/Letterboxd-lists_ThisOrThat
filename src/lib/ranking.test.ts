import { hashText } from './hash';
import {
  applyChoice,
  createSession,
  getCurrentMatchFilms,
  getRankedFilms,
  undoLastChoice
} from './ranking';
import type { ParsedLetterboxdCsv, RankingSession } from './types';

function buildParsedFixture(): ParsedLetterboxdCsv {
  return {
    metadata: {
      exportVersion: 'Letterboxd list export v7',
      date: '2026-04-13',
      name: 'Mini list',
      tags: 'tests',
      url: 'https://boxd.it/test',
      description: 'fixture'
    },
    films: [
      {
        id: 0,
        sourcePosition: 1,
        name: 'Alpha',
        year: 2001,
        url: 'https://example.com/alpha',
        description: ''
      },
      {
        id: 1,
        sourcePosition: 2,
        name: 'Bravo',
        year: 2002,
        url: 'https://example.com/bravo',
        description: ''
      },
      {
        id: 2,
        sourcePosition: 3,
        name: 'Charlie',
        year: 2003,
        url: 'https://example.com/charlie',
        description: ''
      },
      {
        id: 3,
        sourcePosition: 4,
        name: 'Delta',
        year: 2004,
        url: 'https://example.com/delta',
        description: ''
      }
    ]
  };
}

function playToCompletion(
  session: RankingSession,
  ranking: string[]
): RankingSession {
  let current = session;

  while (current.currentMatch) {
    const match = getCurrentMatchFilms(current);

    if (!match) {
      break;
    }

    const leftIndex = ranking.indexOf(match.left.name);
    const rightIndex = ranking.indexOf(match.right.name);
    const preferredSide = leftIndex < rightIndex ? 'left' : 'right';
    current = applyChoice(current, preferredSide, `2026-04-13T12:00:${current.stats.comparisons}`);
  }

  return current;
}

describe('ranking engine', () => {
  it('builds a strict order from duel outcomes instead of source positions', () => {
    const session = createSession(buildParsedFixture(), {
      fileHash: hashText('ranking-fixture'),
      sourceName: 'fixture.csv'
    });
    const completed = playToCompletion(session, ['Charlie', 'Alpha', 'Delta', 'Bravo']);

    expect(completed.phase).toBe('complete');
    expect(getRankedFilms(completed).map((film) => film.name)).toEqual([
      'Charlie',
      'Alpha',
      'Delta',
      'Bravo'
    ]);
  });

  it('swaps adjacent films during validation and can step backward', () => {
    const parsed = buildParsedFixture();
    const validatingSession: RankingSession = {
      version: 1,
      fileHash: 'abc12345',
      sourceName: 'fixture.csv',
      metadata: parsed.metadata,
      films: parsed.films,
      phase: 'validating',
      rankedIds: [0, 1, 2],
      pendingIds: [],
      currentMatch: {
        kind: 'validation',
        leftId: 0,
        rightId: 1,
        index: 0,
        sweep: 1
      },
      validation: {
        index: 0,
        sweep: 1,
        swapsInSweep: 0,
        totalSwaps: 0,
        totalSweeps: 0
      },
      stats: {
        totalFilms: 3,
        comparisons: 0,
        insertedCount: 3,
        validationComparisons: 0,
        startedAt: '2026-04-13T12:00:00.000Z',
        updatedAt: '2026-04-13T12:00:00.000Z'
      },
      history: []
    };

    const swapped = applyChoice(validatingSession, 'right', '2026-04-13T12:00:01.000Z');

    expect(swapped.rankedIds).toEqual([1, 0, 2]);
    expect(swapped.validation?.index).toBe(0);
    expect(swapped.currentMatch).toMatchObject({
      kind: 'validation',
      leftId: 1,
      rightId: 0,
      index: 0
    });
  });

  it('restores the previous step when undo is used', () => {
    const session = createSession(buildParsedFixture(), {
      fileHash: 'feedface',
      sourceName: 'fixture.csv'
    });
    const next = applyChoice(session, 'left', '2026-04-13T12:00:01.000Z');
    const restored = undoLastChoice(next);

    expect(restored.rankedIds).toEqual(session.rankedIds);
    expect(restored.pendingIds).toEqual(session.pendingIds);
    expect(restored.currentMatch).toEqual(session.currentMatch);
    expect(restored.stats).toEqual(session.stats);
    expect(restored.history).toHaveLength(0);
  });
});
