# Retirement Simulator Architecture

## Purpose

This repository is a single-package TypeScript application for answering one question: how input changes affect the earliest viable retirement month. It is fully client-side and has two execution layers:

- A deterministic simulation and retirement-search core in `src/`
- A React UI in `src/web/` that edits scenarios, persists state locally, and runs searches in a web worker

The most important architectural goal for this repo should be trustworthy automated feedback. The codebase is small, the financial logic is high-leverage, and much of the maintenance is expected to be done by LLMs. That means the architecture should optimize for easy-to-run checks, loud failures on correctness drift, and clear module boundaries that make unintended coupling obvious.

## Current Structure

### Core simulation engine

- [`/Users/jacob/Documents/retirement-simulator/src/types.ts`](/Users/jacob/Documents/retirement-simulator/src/types.ts) defines the shared simulation model: accounts, effects, checks, events, snapshots, and results.
- [`/Users/jacob/Documents/retirement-simulator/src/dates.ts`](/Users/jacob/Documents/retirement-simulator/src/dates.ts) holds the `YearMonth` utilities used across the engine and retirement search.
- [`/Users/jacob/Documents/retirement-simulator/src/engine.ts`](/Users/jacob/Documents/retirement-simulator/src/engine.ts) runs month-by-month simulations and snapshots state after each month.
- [`/Users/jacob/Documents/retirement-simulator/src/money.ts`](/Users/jacob/Documents/retirement-simulator/src/money.ts) contains immutable account and balance operations.
- [`/Users/jacob/Documents/retirement-simulator/src/effects.ts`](/Users/jacob/Documents/retirement-simulator/src/effects.ts) implements reusable state transitions such as scheduled amounts, transfers, and rebalancing.
- [`/Users/jacob/Documents/retirement-simulator/src/checks.ts`](/Users/jacob/Documents/retirement-simulator/src/checks.ts) enforces failure conditions after effects run.

This layer is still the strongest part of the architecture. It is deterministic, mostly free of framework coupling, and easy to reason about in tests.

### Historical returns and retirement search

- [`/Users/jacob/Documents/retirement-simulator/src/historical.ts`](/Users/jacob/Documents/retirement-simulator/src/historical.ts) maps annual Damodaran data into monthly return and inflation behavior and summarizes simulation windows.
- [`/Users/jacob/Documents/retirement-simulator/src/data/damodaran-returns.ts`](/Users/jacob/Documents/retirement-simulator/src/data/damodaran-returns.ts) is the built-in historical dataset.
- [`/Users/jacob/Documents/retirement-simulator/src/retirementDate.ts`](/Users/jacob/Documents/retirement-simulator/src/retirementDate.ts) defines plan inputs and defaults, parses recipe JSON, builds simulation configs, searches candidate retirement months, and summarizes results.
- [`/Users/jacob/Documents/retirement-simulator/src/index.ts`](/Users/jacob/Documents/retirement-simulator/src/index.ts) is the public barrel for the package-style domain API.

`retirementDate.ts` remains the main concentration point in the repository. At `1112` lines, it currently mixes:

- domain input types and defaults
- validation
- recipe parsing and rule execution
- plan compilation
- retirement withdrawal policy
- historical search orchestration
- result summarization

This is still the clearest architectural pressure point. The file works and is well-tested, but it is where future changes are most likely to accumulate hidden coupling.

### Web app and worker boundary

- [`/Users/jacob/Documents/retirement-simulator/src/web/RetirementApp.tsx`](/Users/jacob/Documents/retirement-simulator/src/web/RetirementApp.tsx) owns scenario state, local-storage persistence, and worker lifecycle.
- [`/Users/jacob/Documents/retirement-simulator/src/web/worker.ts`](/Users/jacob/Documents/retirement-simulator/src/web/worker.ts) isolates expensive retirement-date searches from the UI thread with a small typed message protocol.
- [`/Users/jacob/Documents/retirement-simulator/src/web/ScenarioEditor.tsx`](/Users/jacob/Documents/retirement-simulator/src/web/ScenarioEditor.tsx), [`/Users/jacob/Documents/retirement-simulator/src/web/ModifierEditor.tsx`](/Users/jacob/Documents/retirement-simulator/src/web/ModifierEditor.tsx), and [`/Users/jacob/Documents/retirement-simulator/src/web/RecipeEditor.tsx`](/Users/jacob/Documents/retirement-simulator/src/web/RecipeEditor.tsx) handle editing and inline documentation.
- [`/Users/jacob/Documents/retirement-simulator/src/web/ComparisonTables.tsx`](/Users/jacob/Documents/retirement-simulator/src/web/ComparisonTables.tsx) renders result comparisons.
- [`/Users/jacob/Documents/retirement-simulator/src/web/types.ts`](/Users/jacob/Documents/retirement-simulator/src/web/types.ts) defines the UI scenario state shape shared across the app.

The worker seam is a good architectural choice. It keeps React focused on editing and display while the expensive search stays in a pure domain path.

The current weakness is that persistence and migration logic still live directly inside `RetirementApp.tsx`. `loadState()` and `saveState()` already act like a serialization boundary, but they are not yet explicit modules with tests.

### Build outputs

- `vite build` emits the browser app to `web-dist/`.
- `tsc` emits declarations and JavaScript to `dist/`.
- Those generated outputs are not tracked in Git, which is the right default for this repository.

The separation is fine, but it means the source of truth stays entirely in `src/` and validation should continue to run from source, not against generated artifacts.

## Important Boundaries

### Stable boundaries worth preserving

- `engine.ts` should stay generic and unaware of retirement-specific policy.
- `money.ts`, `effects.ts`, and `checks.ts` should remain small reusable primitives.
- `historical.ts` should keep acting as the adapter from fixed historical data to simulation effects.
- `src/web/` should remain a consumer of domain APIs rather than a second place where financial behavior is reimplemented.
- `worker.ts` should stay thin and message-oriented.
- `src/index.ts` should remain a narrow export surface rather than another place for app-specific orchestration.

### Boundaries that are currently blurred

- `retirementDate.ts` is acting as domain model, compiler, validator, policy engine, and reporting layer at the same time.
- Recipe behavior is defined in code, documented in `RecipeEditor.tsx`, and exercised in tests, but there is no single canonical schema or fixture source keeping those views aligned.
- Scenario persistence, state normalization, and historical-result stripping are embedded in `RetirementApp.tsx` rather than a dedicated persistence module.
- The worker request/response contract is typed, but it is not treated as a separately tested boundary.

## Notable Design Decisions

### Month-by-month deterministic simulation

The simulator advances one month at a time, applies effects in order, then runs checks. This is a good fit for this problem because it supports precise event logs, exact failure months, and deterministic regression tests.

### Historical backtesting over synthetic Monte Carlo

The current design uses historical rolling windows derived from the Damodaran dataset. That keeps the model transparent and reproducible, which is valuable both for users and for automated verification.

### Recipes as a JSON extension point

Recipe JSON is effectively a small rule DSL for scenario-specific behavior. This is the repo's main flexibility mechanism. It is the right direction for a client-only app, but it raises the importance of schema validation, example fixtures, and shared documentation. Without that, small feature additions will spread the contract across parser code, tests, and UI copy.

### Local-only scenario persistence

Persisting scenarios in local storage is appropriate for a single-user browser app. The cost is that storage shape and default-filling become real compatibility boundaries and should be treated that way.

## Automated Feedback Today

The repo has a clear intended local validation entrypoint:

- `pnpm check` runs TypeScript type checking.
- `pnpm test` runs the Vitest suite.
- `pnpm build` verifies the production build.
- `pnpm validate` is the documented full health check and runs all three.

The current source-level test surface covers:

- low-level engine and money behavior
- date utilities
- historical-return behavior
- recipe validation and scenario behavior
- verification tests that compare the engine against independent ledgers and realistic financial-rule cases

## Feedback Gaps

The command surface is better than it was previously, but enforcement is still weak:

- There is no visible CI workflow in `.github/` that runs `pnpm validate`.
- There is no configured pre-commit or pre-push hook that invokes the same command family.
- There is no dedicated regression fixture layer asserting exact `findEarliestRetirementMonth()` outputs across representative plans.
- There are no dedicated tests for scenario persistence or the worker message protocol.
- Recipe examples in `RecipeEditor.tsx` are valuable user-facing documentation, but there is no single shared source that guarantees those examples stay aligned with the parser and tests.
- Ephemeral worktrees depend on local dependency installation before any of the validation commands can run, but the repo does not expose a single bootstrap command or clearly documented setup guard for automation.

For LLM-led maintenance, those gaps matter more than stylistic cleanup. The easiest way for this repo to stay safe is for correctness checks to be obvious, realistic, and unavoidable.

## Highest-Value Improvements

### 1. Make `pnpm validate` mandatory, not just documented

The command already exists and should remain the one prominent "is the repo safe?" entrypoint. The next step is enforcement:

- run `pnpm validate` in CI on every branch and pull request
- require that job before merge
- add a lightweight pre-push hook that runs the same command locally before changes land
- document one bootstrap path such as `pnpm install --frozen-lockfile && pnpm validate` for fresh worktrees and automation

The key principle is to avoid a second validation system. CI, docs, humans, and automation should all point at the same command.

### 2. Add exact retirement-search regression fixtures

The verification tests are already good, but the most critical product behavior is still the result of `findEarliestRetirementMonth()`. Today the suite has only light direct coverage of exact search outputs.

Add a small fixture corpus that runs full retirement searches with representative inputs and asserts exact outputs such as:

- earliest retirement month
- success rate
- worst-window failure month
- median or ending portfolio values where appropriate

Recommended fixture set:

- a standard baseline plan
- a spending-guardrail recipe
- an early-retirement-access case with penalty
- a reserve top-up recipe case
- a scenario with additional accounts such as debt or real estate

For LLM safety, these are the highest-value tests because they validate actual product behavior instead of only helper math.

### 3. Split `retirementDate.ts` by responsibility

This should happen before further feature growth. A practical split would be:

- `planInputs.ts`: input types, defaults, and basic validation
- `recipe.ts`: recipe types, parsing, validation, and rule helpers
- `planCompiler.ts`: convert plan inputs plus candidate retirement month into `SimulationConfig`
- `retirementSearch.ts`: earliest-month search and search-result summarization

That decomposition would reduce cognitive load without changing behavior and would make future recipe or withdrawal-policy changes more local.

### 4. Create a canonical recipe contract

The recipe contract is now spread across:

- TypeScript unions and runtime validation in `retirementDate.ts`
- examples and docs in `RecipeEditor.tsx`
- scenario usage in tests

Move the examples and contract closer together. A small shared module or fixture file that exports:

- allowed action and condition shapes
- example recipes
- user-facing reference text

would remove duplication and lower the chance that the editor docs drift from actual behavior.

### 5. Extract persistence into a tested module

`RetirementApp.tsx` currently performs:

- local-storage reads and writes
- scenario defaulting and shape normalization
- stripping large historical results before persistence

That should become a small `scenarioStorage.ts` or similar module with direct tests. This is a low-effort cleanup with a good payoff because it protects saved-scenario compatibility and keeps React focused on UI concerns.

### 6. Add targeted tests for the worker and persistence seams

The worker and storage boundaries are architecturally important even though they are small. Add focused tests that cover:

- worker progress and result message ordering
- error propagation from search failures
- loading older or partial persisted scenario shapes
- stripping `historicalSet` before save

These are easy to invoke and likely to catch the kinds of accidental breakage LLM edits often introduce.

### 7. Add a critical validation tier for financial regressions

`pnpm validate` should stay the prominent top-level command, but the financial simulator would benefit from a clearly named critical layer underneath it, for example:

- `pnpm test:critical` for exact retirement-search fixtures and high-value verification cases
- `pnpm validate` invoking that command alongside the broader test suite

That split gives maintainers a fast way to run the most important assertions first while keeping one obvious full-suite command for normal use.

## Practical Recommendations

- Keep the simulation core pure and framework-free.
- Resist adding more business logic directly to React components.
- Prefer new effects or checks over ad hoc special cases inside search orchestration.
- Treat recipe JSON as an internal public contract with fixtures, not just an editor convenience.
- When adding financial behavior, require at least one representative end-to-end simulator assertion.
- Keep the full validation command short, memorable, and prominently documented.
- Fail loudly for correctness drift, but allow non-critical warnings to stay advisory rather than blocking when they do not affect financial accuracy.

## Near-Term Cleanup Order

1. Add CI or a required remote check that runs `pnpm validate`.
2. Add exact `findEarliestRetirementMonth()` regression fixtures for representative plans and expose them through a clearly named critical test command.
3. Split `src/retirementDate.ts` into smaller domain modules without changing behavior.
4. Extract scenario persistence and migration logic from `src/web/RetirementApp.tsx`.
5. Centralize recipe contract examples and docs so parser, tests, and UI stay aligned.
6. Add focused worker and persistence seam tests.

## Summary

The repository is still in a healthy small-app shape: the simulation core is deterministic, the worker seam is sensible, the build outputs are cleanly separated, and automated checks are already better than average for a project of this size. The current architectural pressure comes from one overloaded orchestration module and from feedback loops that are documented but not yet enforced.

The highest-value improvements are practical and small in scope: make `pnpm validate` unavoidable in CI or hooks, add exact full-search regression fixtures around the financial simulator, and break `retirementDate.ts` into narrower modules before more rules accumulate there. Those changes would make future LLM-led work materially safer without increasing process complexity.
