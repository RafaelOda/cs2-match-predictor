import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bestOfThreeWinProbability,
  generateProbabilityMatrices,
  loadVrsStandings,
  parseVrsStandingsMarkdown,
  valveVrsWinProbability,
  VrsProbabilityModel,
} from '../dist/index.js';

const tolerance = 1e-15;

test('VRS expectations match Valve fit.js reference calculations', () => {
  const referenceCases = [
    [1500, 1500, 0.5],
    [1900, 1500, 0.9037847289148188],
    [2124, 1922, 0.7560605767106526],
    [1000, 1800, 0.011206337351900131],
  ];

  for (const [ratingA, ratingB, expected] of referenceCases) {
    assert.ok(
      Math.abs(valveVrsWinProbability(ratingA, ratingB) - expected) < tolerance,
    );
  }
});

test('VRS probability is complementary when teams are reversed', () => {
  const forward = valveVrsWinProbability(2124, 1922);
  const reverse = valveVrsWinProbability(1922, 2124);
  assert.ok(Math.abs(forward + reverse - 1) < tolerance);
});

test('Bo3 conversion handles boundary and midpoint probabilities', () => {
  assert.equal(bestOfThreeWinProbability(0), 0);
  assert.equal(bestOfThreeWinProbability(0.5), 0.5);
  assert.equal(bestOfThreeWinProbability(1), 1);
  assert.throws(() => bestOfThreeWinProbability(1.1), /between 0 and 1/u);
});

test('standings parser extracts Valve Markdown and metadata', () => {
  const markdown = `### Standings as of 2025_06_02<br />

| Standing | Points | Team Name | Roster | |
| :- | -: | :- | :- | :- |
| 1 | 2,124 | Vitality | players | details |
| 2 | 1922 | MOUZ | players | details |
`;
  const snapshot = parseVrsStandingsMarkdown(markdown, {
    snapshotDate: '2025-06-02',
    source: '/snapshots/vrs.md',
  });

  assert.deepEqual(snapshot.standings, [
    { position: 1, teamId: 'Vitality', rating: 2124 },
    { position: 2, teamId: 'MOUZ', rating: 1922 },
  ]);
  assert.equal(snapshot.ratings.get('Vitality'), 2124);
  assert.equal(snapshot.snapshotDate, '2025-06-02');
  assert.equal(snapshot.source, '/snapshots/vrs.md');
});

test('local standings loader reads a historical snapshot file', async () => {
  const fixture = new URL('./fixtures/vrs.md', import.meta.url);
  const snapshot = await loadVrsStandings(fixture.pathname, '2025-06-02');

  assert.equal(snapshot.standings.length, 3);
  assert.equal(snapshot.ratings.get('Spirit'), 1905);
  assert.match(snapshot.source, /test\/fixtures\/vrs\.md$/u);
});

test('standings parser rejects duplicate and invalid ratings', () => {
  const header = `| Standing | Points | Team Name |
| --- | --- | --- |
`;
  assert.throws(
    () =>
      parseVrsStandingsMarkdown(`${header}| 1 | 1000 | A |\n| 2 | 900 | A |`, {
        snapshotDate: '2025-06-02',
        source: 'duplicate.md',
      }),
    /Duplicate team identifier/u,
  );
  assert.throws(
    () =>
      parseVrsStandingsMarkdown(`${header}| 1 | unknown | A |`, {
        snapshotDate: '2025-06-02',
        source: 'invalid.md',
      }),
    /Invalid VRS rating/u,
  );
});

test('matrix generation is ordered, complementary, and deterministic', () => {
  const ratings = new Map([
    ['A', 1800],
    ['B', 1500],
    ['C', 1200],
  ]);
  const model = new VrsProbabilityModel(ratings);
  const metadata = { snapshotDate: '2025-06-02', source: 'vrs.md' };
  const first = generateProbabilityMatrices(['B', 'A', 'C'], model, metadata);
  const second = generateProbabilityMatrices(['B', 'A', 'C'], model, metadata);

  assert.deepEqual(first, second);
  assert.deepEqual(first.teams, ['B', 'A', 'C']);
  assert.equal(first.bo1.length, 3);
  assert.equal(first.bo3.length, 3);

  for (const matrix of [first.bo1, first.bo3]) {
    for (let row = 0; row < matrix.length; row += 1) {
      assert.equal(matrix[row].length, 3);
      assert.equal(matrix[row][row], 0.5);
      for (let column = 0; column < matrix.length; column += 1) {
        assert.ok(Number.isFinite(matrix[row][column]));
        assert.ok(matrix[row][column] >= 0 && matrix[row][column] <= 1);
        assert.ok(
          Math.abs(matrix[row][column] + matrix[column][row] - 1) < tolerance,
        );
      }
    }
  }
});

test('missing and duplicate teams produce clear errors', () => {
  const model = new VrsProbabilityModel(new Map([['A', 1500]]));
  const metadata = { snapshotDate: '2025-06-02', source: 'vrs.md' };

  assert.throws(
    () => generateProbabilityMatrices(['A', 'Missing'], model, metadata),
    /No VRS rating found for team "Missing"/u,
  );
  assert.throws(
    () => generateProbabilityMatrices(['A', 'A'], model, metadata),
    /Duplicate team identifier "A"/u,
  );
});
