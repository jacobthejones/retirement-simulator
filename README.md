# Retirement Simulator

A browser app for answering one question:

> How does this change affect when I can retire?

Create editable scenarios, run historical-return simulations, and compare the earliest viable retirement month side by side.

## Features

- Scenario editor with multiple named scenarios.
- Brute-force search for the earliest retirement month that meets a configurable success target.
- Historical simulations using the included Damodaran annual return dataset.
- Non-retirement and retirement portfolio buckets, with a simplified early-access penalty.
- Recurring and one-time cash-flow changes timed to now, retirement, or a specific month.
- Side-by-side parameter and result comparison.

## Quick Start

Requires Node.js 20+ and pnpm (managed via Corepack, pinned in `package.json`).

```sh
corepack enable
pnpm install
pnpm dev
```

## Build

```sh
pnpm build
pnpm preview
```

The app is fully client-side. `preview` serves the production build from `web-dist/`.

## Validation

```sh
pnpm validate
```

Use this as the default repo health check. It runs type checking, the Vitest suite, and a production build.

## Individual Checks

```sh
pnpm check
pnpm test
pnpm build
```

## Model

The simulator runs one month at a time. Each month starts with a `SimulationState`. Effects update account balances and emit event-log entries; checks can fail a scenario when it runs out of available money.

The retirement-date search tests candidate retirement months in order and returns the first month where the configured share of historical windows succeeds.

Money shown in the UI is in today's dollars unless explicitly labeled otherwise.

## Disclaimer

This is a tool for reasoning about retirement decisions under simplified assumptions. It is not financial, tax, or legal advice.

## License

[MIT](LICENSE)
