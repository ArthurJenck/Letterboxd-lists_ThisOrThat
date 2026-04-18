import sampleCsv from '../../films-vus-ranges.csv?raw';
import { exportLetterboxdCsv, parseCsvRows, parseLetterboxdCsv } from './letterboxd';

describe('parseCsvRows', () => {
  it('supports quoted commas, escaped quotes, and empty descriptions', () => {
    const rows = parseCsvRows(
      [
        'Letterboxd list export v7',
        'Date,Name,Tags,URL,Description',
        '2026-04-13,Test,tag,https://boxd.it/test,"hello, ""world"""',
        '',
        'Position,Name,Year,URL,Description',
        '1,"OSS 117: Cairo, Nest of Spies",2006,https://boxd.it/1MIm,',
        '2,Drive,2011,https://boxd.it/IG,"note, intacte"'
      ].join('\n')
    );

    expect(rows[2][4]).toBe('hello, "world"');
    expect(rows[5][1]).toBe('OSS 117: Cairo, Nest of Spies');
    expect(rows[5][4]).toBe('');
    expect(rows[6][4]).toBe('note, intacte');
  });
});

describe('parseLetterboxdCsv', () => {
  it('parses the real repo CSV', () => {
    const parsed = parseLetterboxdCsv(sampleCsv);

    expect(parsed.metadata.exportVersion).toBe('Letterboxd list export v7');
    expect(parsed.metadata.name).toBe('Films vus rang\u00e9s');
    expect(parsed.films).toHaveLength(706);
    expect(parsed.films[0].name).toBe('Requiem for a Dream');
    expect(parsed.films[0].description).toBe('100');
    expect(parsed.films.at(-1)?.name).toBe('Marshland');
  });

  it('throws a readable error on invalid files', () => {
    expect(() => parseLetterboxdCsv('not a csv')).toThrow(
      'Le fichier doit commencer par "Letterboxd list export v7".'
    );
  });

  it('recovers from an over-quoted CSV re-saved by Excel/Numbers', () => {
    const overQuoted = [
      'Letterboxd list export v7',
      'Date,Name,Tags,URL,Description',
      '"2023-11-15,Top 20,""top 20, topstats"",https://boxd.it/qhbsu,"',
      '',
      'Position,Name,Year,URL,Description',
      '"1,Requiem for a Dream,2000,https://boxd.it/29VI,""Mon film préféré."""',
      '"2,The Game,1997,https://boxd.it/26vC,""Un thriller."""'
    ].join('\n');

    const parsed = parseLetterboxdCsv(overQuoted);

    expect(parsed.metadata.name).toBe('Top 20');
    expect(parsed.metadata.tags).toBe('top 20, topstats');
    expect(parsed.films).toHaveLength(2);
    expect(parsed.films[0].name).toBe('Requiem for a Dream');
    expect(parsed.films[0].year).toBe(2000);
    expect(parsed.films[0].description).toBe('Mon film préféré.');
    expect(parsed.films[1].name).toBe('The Game');
  });

  it('exports a sorted CSV that can be parsed again', () => {
    const parsed = parseLetterboxdCsv(sampleCsv);
    const rankedIds = [...parsed.films]
      .slice(0, 5)
      .map((film) => film.id)
      .reverse();
    const exported = exportLetterboxdCsv(parsed.metadata, parsed.films, rankedIds);
    const reparsed = parseLetterboxdCsv(exported);

    expect(reparsed.films).toHaveLength(5);
    expect(reparsed.films[0].name).toBe(parsed.films[4].name);
    expect(reparsed.films[0].sourcePosition).toBe(1);
    expect(reparsed.films[4].name).toBe(parsed.films[0].name);
  });
});
