# CS2 Pick'Em Probability Engine

A small Node.js/TypeScript module for calculating match-winning probabilities
for a Counter-Strike 2 Major Pick'Em optimizer. Its first model implements the
expected-win calculation used by Valve to evaluate its official VRS rankings.

## System context

The full system consists of three independent modules:

1. **Probability engine (this repository):** produces Bo1 and Bo3 matchup
   probabilities.
2. **Swiss simulator (Python, separate repository):** applies Swiss-stage and
   Buchholz pairing rules.
3. **Monte Carlo optimizer (Python, separate repository):** simulates outcomes
   and selects Pick'Em choices that maximize the chance of at least five correct
   predictions.

The modules exchange JSON data and do not share a runtime. See
[the architecture documentation](docs/architecture.md) for the boundary and
JSON contract.

## Prerequisites

- [`nvm`](https://github.com/nvm-sh/nvm)
- npm (included with Node.js)

`.nvmrc` contains the `node` alias, so it resolves to the latest stable Node.js
release available through nvm. Install and select it with:

```sh
nvm install
nvm use
```

## Development

```sh
npm install
npm run dev
```

`npm run dev` builds and runs the CLI. With no arguments, it prints help. The
built entry point is also available as:

```sh
node dist/cli.js --help
```

Available commands:

| Command                | Purpose                                              |
| ---------------------- | ---------------------------------------------------- |
| `npm run dev`          | Build and run the CLI                                |
| `npm run build`        | Compile ESM JavaScript and declarations into `dist/` |
| `npm run typecheck`    | Run strict TypeScript checks without emitting files  |
| `npm run lint`         | Run ESLint with type-aware rules                     |
| `npm run format`       | Format the repository with Prettier                  |
| `npm run format:check` | Check formatting without modifying files             |
| `npm test`             | Build and run the built-in Node.js validation suite  |

## Generate matrices

Provide a JSON file with team identifiers matching the names in a local Valve
Markdown standings snapshot:

```json
{
  "teams": ["Vitality", "MOUZ", "Spirit"]
}
```

Then run:

```sh
npm run dev -- \
  --model vrs \
  --teams ./data/austin-2025/teams.json \
  --snapshot ./data/austin-2025/vrs.md \
  --date 2025-06-02 \
  --output ./outputs/austin-2025.json
```

The date must use `YYYY-MM-DD` and agree with an embedded
`Standings as of YYYY_MM_DD` heading when the snapshot contains one. The CLI
does not download or discover snapshots; it reads only the local file supplied
by `--snapshot`.

## Adding a probability model

Implement `ProbabilityModel` from `src/models/probability-model.ts`, give the
implementation a stable `id`, and keep model-specific data loading and
calibration separate from the shared domain types. Export the model from
`src/index.ts`. Teams remain `TeamId = string`.

## VRS model and Python integration

The VRS model applies the Glicko expected-score calculation from Valve's
[`model/glicko.js`](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/main/model/glicko.js)
using the fixed RD of 75 configured by
[`model/fit.js`](https://github.com/ValveSoftware/counter-strike_regional_standings/blob/main/model/fit.js).
The published standings points are supplied as the two ratings.

For Bo1, the model returns this base expectation. Valve does not publish a
separately calibrated Bo3 expectation. This project initially treats the base
match expectation as an identical independent per-map probability and uses
`p²(3 − 2p)` for the chance of winning at least two of three maps. That is an
explicit, unvalidated approximation—not an official Valve methodology.

The CLI writes ordered team identifiers, snapshot metadata, and complete Bo1
and Bo3 matrices. Both matrices are complementary across the diagonal, use
`0.5` on the diagonal, and contain only values from 0 through 1. See
[`docs/architecture.md`](docs/architecture.md) for the exact contract and
limitations.

## Not implemented

- independent empirical calibration of VRS expectations
- format-specific or map-specific probability calibration
- Swiss-stage pairing or simulation
- Monte Carlo simulation and Pick'Em optimization
- HLTV or other external data collection

The next model step is to validate and calibrate the expectation against
historical outcomes, especially the match-to-map and Bo1/Bo3 assumptions. The
separate Python modules can now consume the generated matrices.
