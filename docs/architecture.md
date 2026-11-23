# Architecture

## Scope and boundaries

This repository contains only the Node.js/TypeScript probability engine. It
owns the interface for match-winning models and produces matchup probabilities.

The tournament workflow remains split into three independent modules:

1. This probability engine calculates Bo1 and Bo3 matchup probabilities.
2. A separate Python Swiss simulator consumes those probabilities and applies
   tournament and Buchholz pairing rules.
3. A separate Python Monte Carlo optimizer consumes simulated outcomes and
   chooses Pick'Em selections.

The integration point is a versionable JSON file rather than a shared runtime
or a monorepo.

## Probability models

`ProbabilityModel` is the extension boundary. A model exposes a stable
identifier and predicts the probability that `teamA` beats `teamB` in either a
Bo1 or Bo3. Teams remain string identifiers.

`VrsProbabilityModel` receives a map of team identifiers to published VRS
points. It performs no network or data loading. The separate standings loader
reads Valve's Markdown table, validates positions and points, rejects duplicate
team identifiers, and preserves the source path and snapshot date.

Valve's [`model/fit.js`](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/main/model/fit.js)
evaluates expected wins by creating fixed-RD Glicko teams, calculating rating
deltas for a hypothetical win and loss, and taking their ratio. Algebraically,
that ratio is the expected-score term in
[`model/glicko.js`](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/main/model/glicko.js):

```text
q = ln(10) / 400
g = 1 / sqrt(1 + 3q²(75²) / π²)
p = 1 / (1 + 10^(-g(ratingA - ratingB) / 400))
```

This implementation extracts only that calculation rather than importing the
ranking generation and raw-data pipeline. Tests compare it with fixed outputs
from Valve's original win/loss delta calculation.

Valve's VRS ranking values are still **not proven to be perfectly calibrated
match-winning probabilities**. Valve uses the expectation for historical model
evaluation, but further empirical calibration is outside this step.

### Match formats

Bo1 uses the base VRS expectation. Valve's calculation does not expose separate
Bo1 and Bo3 models. For Bo3, this implementation provisionally treats the base
match expectation as an identical, independent map-win probability and applies:

```text
P(Bo3) = p²(3 - 2p)
```

Treating a match-level expectation as a map probability is an unvalidated
approximation. Map pool, side, opponent, and map-to-map dependence are not
modeled. The conversion is separate so it can be replaced without changing the
underlying VRS calculation.

## Python integration contract

The CLI writes one JSON document per model input snapshot:

```json
{
  "model": "vrs",
  "snapshotDate": "2025-06-02",
  "source": "/absolute/path/to/standings_global_2025_06_02.md",
  "teams": ["team-a", "team-b"],
  "bo1": [
    [0.5, 0.6],
    [0.4, 0.5]
  ],
  "bo3": [
    [0.5, 0.648],
    [0.352, 0.5]
  ]
}
```

The `teams` array defines row and column ordering for both square matrices. For
each matrix, element `[i][j]` is the probability that `teams[i]` beats
`teams[j]`. A 16-team stage therefore produces two 16-by-16 matrices.

Contract invariants:

- every value is finite and in the inclusive range `[0, 1]`;
- diagonal values are `0.5`;
- for distinct indices, `matrix[i][j] + matrix[j][i] = 1` within floating-point
  tolerance;
- team identifiers are unique, known to the snapshot, and stable across the
  producing and consuming systems;
- `model` identifies the implementation, `snapshotDate` records the historical
  standings date in ISO 8601 form, and `source` records the resolved local
  snapshot path.

The loader validates source data and the matrix generator validates identifiers
and calculated probabilities. Matrix consumers should still validate this
contract at their own boundary.
