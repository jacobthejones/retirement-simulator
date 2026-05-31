# Retirement Simulator Architecture

## Purpose

This repository is a single-package TypeScript application for exploring one question: how input changes affect the earliest viable retirement month. It is fully client-side and has two major execution layers:

- A pure simulation and search core in `src/`
- A React UI in `src/web/` that edits scenarios, persists state locally, and runs long searches in a web worker

The most important architectural goal for this repo should be trustworthy automation. The codebase is small enough that strong automated feedback is cheaper than defensive process, and that matters even more because much of the maintenance is expected to be done by LLMs.

## Current Structure

### Core simulation engine

- [`/Users/jacob/Documents/retirement-simulator/src/engine.ts`](/Users/jacob/Documents/retirement-simulator/src/engine.ts) runs month-by-month simulations.
- [`/Users/jacob/Documents/retirement-simulator/src/types.ts`](/Users/jacob/Documents/retirement-simulator/src/types.ts) defines the shared simulation model: accounts, effects, checks, events, snapshots, and results.
- [`/Users/jacob/Documents/retirement-simulator/src/money.ts`](/Users/jacob/Documents/retirement-simulator/src/money.ts) contains immutable account and balance operations.
- [`/Users/jacob/Documents/retirement-simulator/src/effects.ts`](/Users/jacob/Documents/retirement-simulator/src/effects.ts) implements reusable state transitions such as scheduled amounts, transfers, returns, and rebalancing.
- [`/Users/jacob/Documents/retirement-simulator/src/checks.ts`](/Users/jacob/Documents/retirement-simulator/src/checks.ts) enforces failure conditions and corrective transfers after effects run.

This layer is the strongest part of the architecture today. It is mostly deterministic, largely free of framework coupling, and already covered by direct tests.

### Historical returns and retirement search

- [`/Users/jacob/Documents/retirement-simulator/src/historical.ts`](/Users/jacob/Documents/retirement-simulator/src/historical.ts) maps annual historical data into monthly return and inflation effects and summarizes scenario runs.
- [`/Users/jacob/Documents/retirement-simulator/src/data/damodaran-returns.ts`](/Users/jacob/Documents/retirement-simulator/src/data/damodaran-returns.ts) is the built-in historical dataset.
- [`/Users/jacob/Documents/retirement-simulator/src/retirementDate.ts`](/Users/jacob/Documents/retirement-simulator/src/retirementDate.ts) is the orchestration layer that:
  - defines plan inputs and defaults
  - translates a plan into simulation accounts, effects, and checks
  - parses and validates recipe JSON
  - searches retirement months
  - computes summary output for the UI

This file is now the main concentration point in the repository. At more than 1,100 lines, it mixes domain modeling, search policy, recipe compilation, validation, and reporting. It still works, but it is the clearest place where future changes will get harder and riskier if not split up.

### Web app and worker boundary

- [`/Users/jacob/Documents/retirement-simulator/src/web/RetirementApp.tsx`](/Users/jacob/Documents/retirement-simulator/src/web/RetirementApp.tsx) owns app state, local storage persistence, and worker lifecycle.
- [`/Users/jacob/Documents/retirement-simulator/src/web/worker.ts`](/Users/jacob/Documents/retirement-simulator/src/web/worker.ts) isolates expensive retirement-date searches from the UI thread.
- [`/Users/jacob/Documents/retirement-simulator/src/web/ScenarioEditor.tsx`](/Users/jacob/Documents/retirement-simulator/src/web/ScenarioEditor.tsx), [`/Users/jacob/Documents/retirement-simulator/src/web/ModifierEditor.tsx`](/Users/jacob/Documents/retirement-simulator/src/web/ModifierEditor.tsx), and [`/Users/jacob/Documents/retirement-simulator/src/web/RecipeEditor.tsx`](/Users/jacob/Documents/retirement-simulator/src/web/RecipeEditor.tsx) handle editing.
- [`/Users/jacob/Documents/retirement-simulator/src/web/ComparisonTables.tsx`](/Users/jacob/Documents/retirement-simulator/src/web/ComparisonTables.tsx) renders the comparison surface.

The worker boundary is a good design choice. It keeps the UI simple and preserves a mostly pure domain core. The main weakness here is that scenario persistence, migration/defaulting, and UI-facing scenario state are still hand-rolled inside `RetirementApp.tsx` rather than being an explicit module with tests.

## Important Boundaries

### Stable boundaries worth preserving

- `engine.ts` should stay generic and unaware of retirement-specific rules.
- `effects.ts` and `checks.ts` should remain small reusable primitives.
- `historical.ts` should continue to be the adapter from raw return data to simulation effects.
- `src/web/` should remain a consumer of domain APIs rather than a second place where simulation logic is recreated.
- `worker.ts` should stay thin and message-oriented.

### Boundaries that are currently blurred

- `retirementDate.ts` currently acts as domain model, compiler, validator, policy engine, and reporting layer.
- Recipe behavior is defined in code, documented in the UI, and tested through scenario construction, but there is no single canonical schema or fixture set to keep those views aligned.
- Scenario persistence defaults are embedded in the app component instead of a dedicated serialization or migration module.

## Notable Design Decisions

### Month-by-month deterministic simulation

The simulator advances one month at a time, applies effects in order, then runs checks. This is easy to reason about and supports precise event logs and failure months. That is a good fit for this problem.

### Historical backtesting over synthetic Monte Carlo

The current design uses historical rolling windows based on Damodaran annual data. This keeps the model transparent and reproducible. It also makes regression testing easier because the inputs are fixed.

### Recipes as a JSON extension point

Recipe JSON is effectively a lightweight rule DSL for scenario-specific behavior. This is powerful and appropriate for an app that needs flexibility without a backend, but it raises the importance of schema validation, fixtures, and regression tests. A permissive or underspecified DSL will become a maintenance trap quickly.

### UI state persisted in local storage

This is fine for a single-user client app. The cost is that migrations and defaulting logic become part of the architecture and should be treated as a real compatibility boundary.

## Automated Feedback Today

The repository already has meaningful automated coverage:

- Type checking via `tsc`
- Unit and integration tests via Vitest
- Verification tests that compare the engine against independent ledgers and realistic recipe scenarios
- Production build verification via Vite

The existing verification tests in [`/Users/jacob/Documents/retirement-simulator/src/verification.test.ts`](/Users/jacob/Documents/retirement-simulator/src/verification.test.ts) are especially valuable. They do more than check syntax or isolated functions; they assert behavioral correctness of the financial simulator and protect against quiet math regressions.

At the time of this review, the following direct checks succeeded locally:

- `./node_modules/.bin/tsc -p tsconfig.json --noEmit`
- `./node_modules/.bin/vitest run`
- `./node_modules/.bin/vite build`

## Highest-Value Improvements

### 1. Add one prominent full-validation command

The repository should have one obvious command that means "tell me if the repo is safe":

```sh
pnpm validate
```

Recommended scope:

- typecheck
- tests
- production build

This should be documented as the default command for humans, LLMs, CI, and pre-push checks. Right now the feedback loop exists, but it is fragmented across separate commands.

### 2. Add a critical-simulator regression layer

The financial simulator is the part of the repo where silent mistakes matter most. In addition to the current tests, add a small corpus of high-signal scenario fixtures that run full retirement searches with representative data and assert exact or tightly-bounded outputs:

- baseline retirement date for a standard plan
- a guardrail recipe case
- early-retirement access with penalty
- reserve top-up behavior
- a scenario with extra accounts such as debt or real estate

These should fail loudly on output drift. They are the best safety mechanism for LLM-led maintenance because they validate the actual product behavior, not just helper functions.

### 3. Split `retirementDate.ts` by responsibility

The current file should be decomposed before more features land. A practical split would be:

- `planInputs.ts`: input types, defaults, input validation
- `recipeSchema.ts` or `recipe.ts`: recipe parsing, schema validation, rule/action typing
- `planCompiler.ts`: convert plan inputs plus retirement month into `SimulationConfig`
- `retirementSearch.ts`: earliest-month search and result summarization

This is the biggest cleanup that would make future changes simpler without changing product behavior.

### 4. Create a single canonical recipe contract

Recipes are now important enough to deserve a dedicated contract. The repo should have one place that defines:

- allowed condition and action shapes
- validation errors
- example fixtures

The UI guide in `RecipeEditor.tsx` should ideally render from that source or from shared fixtures instead of duplicating examples and documentation by hand.

### 5. Promote scenario persistence into a tested module

`RetirementApp.tsx` currently performs storage, deserialization, default-filling, and result stripping inline. Extract that into a small module with tests so future schema changes do not silently break existing saved scenarios.

### 6. Add lightweight commit-time safeguards

For a repo like this, a small hook is justified. Recommended policy:

- pre-commit: fast checks only, such as typecheck and targeted tests if they remain quick
- pre-push or CI-required: full `pnpm validate`

If hooks are added, they should run the same documented commands as CI. The goal is consistency, not a second validation system.

## Suggested Validation Layout

Use a layered command structure that is easy to invoke and easy to interpret:

```sh
pnpm validate:quick
pnpm validate:critical
pnpm validate
```

Recommended behavior:

- `validate:quick`: typecheck plus the fastest unit and integration tests
- `validate:critical`: simulator regression fixtures and verification tests
- `validate`: `validate:quick`, `validate:critical`, and production build

Non-critical issues should warn clearly when possible. Critical correctness issues should fail with explicit scenario names and mismatched outputs.

## Practical Recommendations

- Keep the simulation core pure and framework-free.
- Resist adding more business logic directly to React components.
- Prefer new effects or checks over ad hoc special cases inside search orchestration.
- Treat recipe JSON as a public contract within the repo, not just a UI convenience.
- Keep verification tests readable and scenario-based; they are architectural assets, not just tests.
- When adding financial behavior, require at least one representative end-to-end simulator assertion, not only unit coverage.

## Near-Term Cleanup Order

1. Add `pnpm validate` and make it the default repo health command.
2. Add critical scenario regression fixtures for full retirement-date outputs.
3. Split `retirementDate.ts` into smaller modules without changing behavior.
4. Extract scenario persistence and migration logic from `RetirementApp.tsx`.
5. Centralize recipe schema, docs, and fixtures.

## Summary

The repository is in a good state structurally for a small app: pure core logic, a clean worker seam, and meaningful correctness tests already exist. The main architectural pressure is concentration of responsibility in `src/retirementDate.ts`, followed by the lack of a single prominent validation command and the lack of a fixture-based regression suite around full retirement-search outputs. Those are the highest-value changes for keeping the codebase simple and safe as it continues to be maintained by LLMs.
