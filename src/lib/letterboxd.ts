import type { FilmRecord, LetterboxdMetadata, ParsedLetterboxdCsv } from './types';

const PREAMBLE_HEADER = ['Date', 'Name', 'Tags', 'URL', 'Description'];
const FILM_HEADER = ['Position', 'Name', 'Year', 'URL', 'Description'];

function stripBom(input: string): string {
  return input.replace(/^\uFEFF/, '');
}

export function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };

  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  const source = stripBom(input);

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (inQuotes) {
      if (character === '"') {
        const next = source[index + 1];

        if (next === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;
      }

      continue;
    }

    if (character === '"') {
      inQuotes = true;
      continue;
    }

    if (character === ',') {
      pushField();
      continue;
    }

    if (character === '\r') {
      continue;
    }

    if (character === '\n') {
      pushField();
      pushRow();
      continue;
    }

    field += character;
  }

  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }

  return rows;
}

function rowMatches(row: string[] | undefined, expected: string[]): boolean {
  return expected.every((value, index) => row?.[index] === value);
}

function unwrapOverQuotedRow(row: string[]): string[] {
  if (row.length !== 1) {
    return row;
  }

  const [field] = row;

  if (!field.includes(',')) {
    return row;
  }

  const reparsed = parseCsvRows(field);
  return reparsed[0] ?? row;
}

function normaliseDescription(value: string | undefined): string {
  return value ?? '';
}

function parseMetadata(rows: string[][]): LetterboxdMetadata {
  if (rows[0]?.[0] !== 'Letterboxd list export v7') {
    throw new Error('Le fichier doit commencer par "Letterboxd list export v7".');
  }

  if (!rowMatches(rows[1], PREAMBLE_HEADER)) {
    throw new Error("En-tête du préambule Letterboxd introuvable.");
  }

  const metadataRow = rows[2];

  if (!metadataRow) {
    throw new Error('Ligne de métadonnées Letterboxd manquante.');
  }

  return {
    exportVersion: rows[0][0],
    date: metadataRow[0] ?? '',
    name: metadataRow[1] ?? '',
    tags: metadataRow[2] ?? '',
    url: metadataRow[3] ?? '',
    description: metadataRow[4] ?? ''
  };
}

function parseYear(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseLetterboxdCsv(input: string): ParsedLetterboxdCsv {
  const rawRows = parseCsvRows(input);
  const rows = rawRows.map(unwrapOverQuotedRow);
  const metadata = parseMetadata(rows);
  const filmHeaderIndex = rows.findIndex((row) => rowMatches(row, FILM_HEADER));

  if (filmHeaderIndex === -1) {
    throw new Error('Tableau des films introuvable dans le CSV.');
  }

  const dataRows = rows.slice(filmHeaderIndex + 1).filter((row) => {
    return row.some((value) => value.trim().length > 0);
  });

  if (dataRows.length === 0) {
    throw new Error('Le CSV ne contient aucun film.');
  }

  const films = dataRows.map<FilmRecord>((row, index) => {
    const position = Number.parseInt(row[0] ?? '', 10);
    const name = row[1]?.trim();

    if (!Number.isFinite(position) || !name) {
      throw new Error(`Ligne de film invalide à l'index ${index + 1}.`);
    }

    return {
      id: index,
      sourcePosition: position,
      name,
      year: parseYear(row[2]),
      url: row[3] ?? '',
      description: normaliseDescription(row[4])
    };
  });

  return {
    metadata,
    films
  };
}

function escapeCsvField(value: string | number | null): string {
  const text = value === null ? '' : String(value);

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function exportLetterboxdCsv(
  metadata: LetterboxdMetadata,
  films: FilmRecord[],
  rankedIds: number[]
): string {
  const orderedFilms = rankedIds.map((id) => {
    const film = films.find((entry) => entry.id === id);

    if (!film) {
      throw new Error(`Film introuvable pour l'identifiant ${id}.`);
    }

    return film;
  });

  const lines = [
    metadata.exportVersion || 'Letterboxd list export v7',
    PREAMBLE_HEADER.join(','),
    [
      escapeCsvField(metadata.date),
      escapeCsvField(metadata.name),
      escapeCsvField(metadata.tags),
      escapeCsvField(metadata.url),
      escapeCsvField(metadata.description)
    ].join(','),
    '',
    FILM_HEADER.join(','),
    ...orderedFilms.map((film, index) => {
      return [
        escapeCsvField(index + 1),
        escapeCsvField(film.name),
        escapeCsvField(film.year),
        escapeCsvField(film.url),
        escapeCsvField(film.description)
      ].join(',');
    })
  ];

  return lines.join('\r\n');
}
