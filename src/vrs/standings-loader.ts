import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { TeamId } from '../types/team.js';

export interface VrsStanding {
  readonly position: number;
  readonly teamId: TeamId;
  readonly rating: number;
}

export interface VrsSnapshot {
  readonly snapshotDate: string;
  readonly source: string;
  readonly standings: readonly VrsStanding[];
  readonly ratings: ReadonlyMap<TeamId, number>;
}

export async function loadVrsStandings(
  filePath: string,
  snapshotDate: string,
): Promise<VrsSnapshot> {
  const source = resolve(filePath);
  const markdown = await readFile(source, 'utf8');
  return parseVrsStandingsMarkdown(markdown, { snapshotDate, source });
}

export function parseVrsStandingsMarkdown(
  markdown: string,
  metadata: { readonly snapshotDate: string; readonly source: string },
): VrsSnapshot {
  validateIsoDate(metadata.snapshotDate);
  validateEmbeddedDate(markdown, metadata.snapshotDate);

  const lines = markdown.split(/\r?\n/u);
  const headerIndex = lines.findIndex((line) => {
    const cells = parseTableRow(line);
    return (
      cells?.some((cell) => normalizeHeader(cell) === 'standing') === true &&
      cells.some((cell) => normalizeHeader(cell) === 'points') &&
      cells.some((cell) => normalizeHeader(cell) === 'team name')
    );
  });

  if (headerIndex === -1) {
    throw new Error(
      'VRS standings table must contain Standing, Points, and Team Name columns.',
    );
  }

  const headerLine = lines[headerIndex];
  if (headerLine === undefined) {
    throw new Error('Unable to locate the VRS standings table header.');
  }
  const headers = parseTableRow(headerLine);
  if (headers === undefined) {
    throw new Error('Unable to parse the VRS standings table header.');
  }

  const positionIndex = findHeader(headers, 'standing');
  const pointsIndex = findHeader(headers, 'points');
  const teamIndex = findHeader(headers, 'team name');
  const standings: VrsStanding[] = [];
  const ratings = new Map<TeamId, number>();

  for (const line of lines.slice(headerIndex + 1)) {
    const cells = parseTableRow(line);
    if (cells === undefined) {
      if (standings.length > 0 && line.trim().length > 0) break;
      continue;
    }

    if (isMarkdownSeparator(cells)) continue;

    const rawPosition = cells[positionIndex]?.trim();
    const rawPoints = cells[pointsIndex]?.trim();
    const teamId = cells[teamIndex]?.trim();

    if (rawPosition === undefined || rawPoints === undefined || !teamId) {
      throw new Error(`Invalid VRS standings row: ${line.trim()}`);
    }

    const position = parseStrictNumber(rawPosition, 'ranking position', teamId);
    const rating = parseStrictNumber(rawPoints, 'VRS rating', teamId);

    if (!Number.isInteger(position) || position < 1) {
      throw new Error(`Invalid ranking position for team "${teamId}".`);
    }
    if (ratings.has(teamId)) {
      throw new Error(
        `Duplicate team identifier "${teamId}" in VRS standings.`,
      );
    }

    ratings.set(teamId, rating);
    standings.push({ position, teamId, rating });
  }

  if (standings.length === 0) {
    throw new Error('VRS standings table contains no team rows.');
  }

  return {
    snapshotDate: metadata.snapshotDate,
    source: metadata.source,
    standings,
    ratings,
  };
}

function parseTableRow(line: string): string[] | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return undefined;
  return trimmed.slice(1, -1).split('|');
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, ' ');
}

function findHeader(headers: readonly string[], name: string): number {
  const index = headers.findIndex((header) => normalizeHeader(header) === name);
  if (index === -1) throw new Error(`Missing ${name} column.`);
  return index;
}

function isMarkdownSeparator(cells: readonly string[]): boolean {
  return cells.every((cell) => /^\s*:?-+:?\s*$/u.test(cell));
}

function parseStrictNumber(
  value: string,
  label: string,
  teamId: string,
): number {
  const normalized = value.replaceAll(',', '');
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/u.test(normalized)) {
    throw new Error(`Invalid ${label} for team "${teamId}": "${value}".`);
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${label} for team "${teamId}": "${value}".`);
  }
  return parsed;
}

function validateIsoDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
    throw new Error(`Snapshot date must use YYYY-MM-DD format: "${date}".`);
  }

  const parsedDate = new Date(`${date}T00:00:00Z`);
  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== date
  ) {
    throw new Error(`Snapshot date must be a valid calendar date: "${date}".`);
  }
}

function validateEmbeddedDate(markdown: string, requestedDate: string): void {
  const match = /Standings\s+as\s+of\s+(\d{4})_(\d{2})_(\d{2})/iu.exec(
    markdown,
  );
  if (match === null) return;

  const year = match[1];
  const month = match[2];
  const day = match[3];
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error('Unable to parse the embedded VRS standings date.');
  }
  const embeddedDate = `${year}-${month}-${day}`;
  if (embeddedDate !== requestedDate) {
    throw new Error(
      `Snapshot date ${requestedDate} does not match standings date ${embeddedDate}.`,
    );
  }
}
