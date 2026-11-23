import type { TeamId } from '../types/team.js';

export type MatchFormat = 'bo1' | 'bo3';

/**
 * Calculates the probability that the first team beats the second team.
 * Implementations must return a value in the inclusive range [0, 1].
 */
export interface ProbabilityModel {
  readonly id: string;

  predict(teamA: TeamId, teamB: TeamId, format: MatchFormat): number;
}
