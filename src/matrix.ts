import type { ProbabilityModel } from './models/probability-model.js';
import type { TeamId } from './types/team.js';

export interface ProbabilityMatrixOutput {
  readonly model: string;
  readonly snapshotDate: string;
  readonly source: string;
  readonly teams: readonly TeamId[];
  readonly bo1: readonly (readonly number[])[];
  readonly bo3: readonly (readonly number[])[];
}

export function generateProbabilityMatrices(
  teams: readonly TeamId[],
  model: ProbabilityModel,
  metadata: { readonly snapshotDate: string; readonly source: string },
): ProbabilityMatrixOutput {
  validateTeams(teams);

  const bo1 = createEmptyMatrix(teams.length);
  const bo3 = createEmptyMatrix(teams.length);

  for (let i = 0; i < teams.length; i += 1) {
    const bo1Row = valueAt(bo1, i);
    const bo3Row = valueAt(bo3, i);
    bo1Row[i] = 0.5;
    bo3Row[i] = 0.5;

    for (let j = i + 1; j < teams.length; j += 1) {
      const teamA = valueAt(teams, i);
      const teamB = valueAt(teams, j);
      const bo1Probability = model.predict(teamA, teamB, 'bo1');
      const bo3Probability = model.predict(teamA, teamB, 'bo3');
      assertProbability(bo1Probability, teamA, teamB, 'bo1');
      assertProbability(bo3Probability, teamA, teamB, 'bo3');

      bo1Row[j] = bo1Probability;
      valueAt(bo1, j)[i] = 1 - bo1Probability;
      bo3Row[j] = bo3Probability;
      valueAt(bo3, j)[i] = 1 - bo3Probability;
    }
  }

  return {
    model: model.id,
    snapshotDate: metadata.snapshotDate,
    source: metadata.source,
    teams: [...teams],
    bo1,
    bo3,
  };
}

function createEmptyMatrix(size: number): number[][] {
  return Array.from({ length: size }, () => Array<number>(size));
}

function valueAt<T>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) throw new Error('Internal matrix index is invalid.');
  return value;
}

function validateTeams(teams: readonly TeamId[]): void {
  if (teams.length === 0) throw new Error('At least one team is required.');

  const seen = new Set<TeamId>();
  for (const teamId of teams) {
    if (teamId.trim().length === 0) {
      throw new Error('Team identifiers cannot be empty.');
    }
    if (seen.has(teamId)) {
      throw new Error(`Duplicate team identifier "${teamId}".`);
    }
    seen.add(teamId);
  }
}

function assertProbability(
  probability: number,
  teamA: TeamId,
  teamB: TeamId,
  format: string,
): void {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new Error(
      `Model returned invalid ${format} probability for "${teamA}" vs "${teamB}".`,
    );
  }
}
