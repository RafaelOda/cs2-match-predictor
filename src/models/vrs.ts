import type { MatchFormat, ProbabilityModel } from './probability-model.js';
import type { TeamId } from '../types/team.js';

/**
 * Valve's Glicko expected-score calculation with fixed rating deviation 75.
 *
 * This is algebraically equivalent to `Fit.priorWinExpectation` in Valve's
 * `model/fit.js`: its win/loss delta ratio simplifies to this expected-score
 * term from `model/glicko.js`.
 */
export function valveVrsWinProbability(
  ratingA: number,
  ratingB: number,
): number {
  assertFiniteRating(ratingA, 'Team A');
  assertFiniteRating(ratingB, 'Team B');

  const q = Math.log(10) / 400;
  const fixedRatingDeviation = 75;
  const g =
    1 /
    Math.sqrt(
      1 +
        (3 * q * q * fixedRatingDeviation * fixedRatingDeviation) /
          (Math.PI * Math.PI),
    );

  return 1 / (1 + Math.pow(10, (g * (ratingA - ratingB)) / -400));
}

/**
 * Converts a map win probability to a Bo3 series win probability, assuming
 * identical and independent map outcomes.
 */
export function bestOfThreeWinProbability(mapWinProbability: number): number {
  if (
    !Number.isFinite(mapWinProbability) ||
    mapWinProbability < 0 ||
    mapWinProbability > 1
  ) {
    throw new RangeError('Map win probability must be between 0 and 1.');
  }

  return mapWinProbability * mapWinProbability * (3 - 2 * mapWinProbability);
}

export class VrsProbabilityModel implements ProbabilityModel {
  readonly id = 'vrs';
  readonly #ratings: ReadonlyMap<TeamId, number>;

  constructor(ratings: ReadonlyMap<TeamId, number>) {
    this.#ratings = new Map(ratings);

    for (const [teamId, rating] of this.#ratings) {
      if (teamId.trim().length === 0) {
        throw new Error('VRS ratings contain an empty team identifier.');
      }
      assertFiniteRating(rating, `Team "${teamId}"`);
    }
  }

  predict(teamA: TeamId, teamB: TeamId, format: MatchFormat): number {
    const ratingA = this.#ratingFor(teamA);
    const ratingB = this.#ratingFor(teamB);
    const baseProbability = valveVrsWinProbability(ratingA, ratingB);

    switch (format) {
      case 'bo1':
        return baseProbability;
      case 'bo3':
        return bestOfThreeWinProbability(baseProbability);
    }
  }

  #ratingFor(teamId: TeamId): number {
    const rating = this.#ratings.get(teamId);
    if (rating === undefined) {
      throw new Error(`No VRS rating found for team "${teamId}".`);
    }
    return rating;
  }
}

function assertFiniteRating(rating: number, label: string): void {
  if (!Number.isFinite(rating)) {
    throw new TypeError(`${label} VRS rating must be a finite number.`);
  }
}
