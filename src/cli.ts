#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { generateProbabilityMatrices } from './matrix.js';
import { VrsProbabilityModel } from './models/vrs.js';
import { loadVrsStandings } from './vrs/standings-loader.js';

const help = `CS2 Pick'Em Probability Engine

Usage:
  cs2-pickem-probability --model vrs --teams <file> --snapshot <file> --date <YYYY-MM-DD> --output <file>

Options:
  --model <name>      Probability model (currently: vrs)
  --teams <file>      JSON file containing { "teams": ["Team A", "Team B"] }
  --snapshot <file>   Local Valve VRS Markdown standings snapshot
  --date <date>       Snapshot date in YYYY-MM-DD format
  --output <file>     Destination JSON file
  -h, --help          Show this help message
`;

interface CliOptions {
  readonly model: string;
  readonly teams: string;
  readonly snapshot: string;
  readonly date: string;
  readonly output: string;
}

async function main(args: readonly string[]): Promise<void> {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    process.stdout.write(help);
    return;
  }

  const options = parseOptions(args);
  if (options.model !== 'vrs') {
    throw new Error(`Unsupported probability model "${options.model}".`);
  }

  const teams = await loadTeams(options.teams);
  const snapshot = await loadVrsStandings(options.snapshot, options.date);
  assertTeamsHaveRatings(teams, snapshot.ratings);
  const model = new VrsProbabilityModel(snapshot.ratings);
  const output = generateProbabilityMatrices(teams, model, snapshot);
  const outputPath = resolve(options.output);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(output, undefined, 2)}\n`,
    'utf8',
  );
  process.stdout.write(`Wrote probability matrices to ${outputPath}\n`);
}

function parseOptions(args: readonly string[]): CliOptions {
  const values = new Map<string, string>();
  const supported = new Set([
    '--model',
    '--teams',
    '--snapshot',
    '--date',
    '--output',
  ]);

  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (name === undefined || !supported.has(name)) {
      throw new Error(`Unknown option "${name ?? ''}".\n\n${help}`);
    }
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for ${name}.`);
    }
    if (values.has(name)) throw new Error(`Option ${name} was provided twice.`);
    values.set(name, value);
  }

  return {
    model: requiredOption(values, '--model'),
    teams: requiredOption(values, '--teams'),
    snapshot: requiredOption(values, '--snapshot'),
    date: requiredOption(values, '--date'),
    output: requiredOption(values, '--output'),
  };
}

async function loadTeams(filePath: string): Promise<readonly string[]> {
  const source = resolve(filePath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(source, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(`Unable to read teams JSON from ${source}.`, {
      cause: error,
    });
  }

  if (!isObject(parsed) || !Array.isArray(parsed.teams)) {
    throw new Error('Teams JSON must be an object with a "teams" array.');
  }
  if (!parsed.teams.every((team): team is string => typeof team === 'string')) {
    throw new Error('Every team identifier must be a string.');
  }
  return parsed.teams;
}

function requiredOption(
  values: ReadonlyMap<string, string>,
  name: string,
): string {
  const value = values.get(name);
  if (value === undefined) throw new Error(`Missing required option ${name}.`);
  return value;
}

function assertTeamsHaveRatings(
  teams: readonly string[],
  ratings: ReadonlyMap<string, number>,
): void {
  const missing = teams.filter((teamId) => !ratings.has(teamId));
  if (missing.length > 0) {
    throw new Error(`No VRS rating found for: ${missing.join(', ')}.`);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
