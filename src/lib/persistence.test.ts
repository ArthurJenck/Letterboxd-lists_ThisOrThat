import { clearStoredSession, isSameImportedFile, loadStoredSession, saveStoredSession } from './persistence';
import { createSession } from './ranking';
import type { ParsedLetterboxdCsv } from './types';

function buildParsedFixture(): ParsedLetterboxdCsv {
  return {
    metadata: {
      exportVersion: 'Letterboxd list export v7',
      date: '2026-04-13',
      name: 'Persistence list',
      tags: 'tests',
      url: 'https://boxd.it/test',
      description: ''
    },
    films: [
      {
        id: 0,
        sourcePosition: 1,
        name: 'Only Movie',
        year: 2024,
        url: 'https://example.com/only-movie',
        description: ''
      }
    ]
  };
}

describe('persistence helpers', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('saves and reloads a ranking session', () => {
    const session = createSession(buildParsedFixture(), {
      fileHash: 'deadbeef',
      sourceName: 'fixture.csv'
    });

    saveStoredSession(session);

    expect(loadStoredSession()).toEqual(session);
  });

  it('clears the stored session', () => {
    const session = createSession(buildParsedFixture(), {
      fileHash: 'deadbeef',
      sourceName: 'fixture.csv'
    });

    saveStoredSession(session);
    clearStoredSession();

    expect(loadStoredSession()).toBeNull();
  });

  it('compares imported files by hash', () => {
    const session = createSession(buildParsedFixture(), {
      fileHash: 'deadbeef',
      sourceName: 'fixture.csv'
    });

    expect(isSameImportedFile(session, 'deadbeef')).toBe(true);
    expect(isSameImportedFile(session, 'cafebabe')).toBe(false);
    expect(isSameImportedFile(null, 'deadbeef')).toBe(false);
  });
});
