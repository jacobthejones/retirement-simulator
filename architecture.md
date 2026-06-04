# Retirement Simulator Architecture

## Purpose

This repository is a small TypeScript app focused on one product question: how changes to savings, spending, timing, and custom rules affect the earliest viable retirement month.

The repo has two execution layers:

- a deterministic financial simulation and retirement-search core in `src/`
- a React browser app in `src/web/` that edits scenarios, persists them locally, and runs expensive searches in a worker

The most important architectural constraint is that this codebase is expected to be maintained largely by LLMs. That makes fast, realistic, hard-to-ignore automated feedback a first-class architectural concern rather than an afterthought.

## Current Structure

### Core simulation engine

- [`src/types.ts`](/Users/jacob/.codex/worktrees/c66b/retirement-simulator/src/types.ts) defines shared simulation types: accounts, effects, checks, events, snapshots, and results.
- [`src/dates.ts`](/Users/jacob/.codex/worktrees/c66b/retirement-simulator/src/dates.ts) provides `YearMonth` parsing, formatting, and arithmetic.
- [`src/money.ts`](/Users/jacob/.codex/worktrees/c66b/retirement-simulator/src/money.ts) contains balance math and immutable account operations.
- [`src/effects.ts`](/Users/jacob/.codex/worktrees/c66b/retirement-simulator/src/effects.ts) implements reusable month-level state transitions.
- [`src/checks.ts`](/Users/jacob/.codex/worktrees/c66b/retirement-simulator/src/checks.ts) applies post-effect failure conditions.
- [`src/engine.ts`](/Users/jacob/.codex/worktrees/c66b/retirement-simulator/src/engine.ts) executes the month-by-month simulation loop and records snapshots and events.

This layer is still the cleanest part of the repo. It is deterministic, framework-free, and already shaped for high-signal regression tests.

### Historical returns and retirement search

- [`src/data/damodaran-returns.ts`](/Users/jacob/.codex/worktrees/c66b/retirement-simulator/src/data/damodaran-returns.ts) contains the built-in historical return dataset.
- [`src/historical.ts`](/Users/jacob/.codex/worktrees/c66b/retirement-simulator/src/historical.ts) adapts annual return data into monthly return and inflation effects and aggregates window statistics.
- [`src/retirementDate.ts`](/Users/jacob/.codex/worktrees/c66b/retirement-simulator/src/retirementDate.ts) defines plan inputs and defaults, validates recipe JSON, compiles simulation configs, runs the earliest-retirement search, and summarizes results.
- [`src/index.ts`](/Users/jacob/.codex/worktrees/c66b/retirement-simulator/src/index.ts) is the package-style export surface.

`retirementDate.ts` remains the main architectural pressure point. It is still about 1,100 lines and currently combines:

- plan input types and defaults
- input validation
- recipe schema parsing and rule evaluation helpers
- plan compilation into `SimulationConfig`
- retirement spending and withdrawal policy
- historical search orchestration
- result summarization

That concentration is not yet breaking the app, but it is the clearest place where future feature work will accumulate coupling.

### Web app and worker boundary

- [`src/web/RetirementApp.tsx`](/Users/jacob/.codex/worktrees/c66b/retirement-simulator/src/web/RetirementApp.tsx) owns scenario state, local-storage persistence, and worker lifecycle.
- [`src/web/ScenarioEditor.tsx`](/Users/jacob/.codex/worktrees/c66b/retirement-simulator/src/web/ScenarioEditor.tsx) edits the main scenario inputs and wires in recipe and modifier editing.
- [`src/web/ModifierEditor.tsx`](/Users/jacob/.codex/worktrees/c66b/retirement-simulator/src/web/ModifierEditor.tsx) edits pre-retirement and one-time cash-flow modifiers.
- [`src/web/RecipeEditor.tsx`](/Users/jacob/.codex/worktrees/c66b/retirement-simulator/src/web/RecipeEditor.tsx) documents and edits the recipe JSON DSL.
- [`src/web/fields.tsx`](/Users/jacob/.codex/worktrees/c66b/retirement-simulator/src/web/fields.tsx) centralizes reusable field components and formatting behavior.
- [`src/web/ComparisonTables.tsx`](/Users/jacob/.codex/worktrees/c66b/retirement-simulator/src/web/ComparisonTables.tsx) renders scenario outcomes side by side.
- [`src/web/worker.ts`](/Users/jacob/.codex/worktrees/c66b/retirement-simulator/src/web/worker.ts) defines the worker request-response contract and runs searches off the main thread.

The worker seam is still a good decision. It keeps the UI responsive and creates a natural boundary between React state management and expensive domain work.

The main weakness in this layer is that persistence and state migration logic still live directly inside `RetirementApp.tsx`. `loadState()` and `saveState()` already behave like a boundary, but they are not explicit modules and they are not directly tested.

## Important Boundaries

### Boundaries worth preserving

- `engine.ts` should remain generic and unaware of retirement-specific policy.
- `money.ts`, `effects.ts`, and `checks.ts` should stay as small composable primitives.
- `historical.ts` should keep acting as the adapter from fixed historical data to simulation behavior.
- `src/web/` should stay a consumer of domain APIs, not a second implementation of financial rules.
- `worker.ts` should stay thin and message-oriented.
- `src/index.ts` should remain a narrow export surface.

### Boundaries that are currently blurred

- `retirementDate.ts` mixes domain model, compiler, validator, policy engine, and reporting.
- Recipe examples and reference text are embedded in `RecipeEditor.tsx`, while the canonical runtime contract lives in `retirementDate.ts` and tests.
- Scenario persistence, default-filling, and result-stripping are embedded in `RetirementApp.tsx`.
- The worker contract is typed, but it is not treated as a separately tested seam.

## Notable Design Decisions

### Deterministic month-by-month simulation

The simulator advances one month at a time, applies effects in order, then runs checks. That is a strong fit for this problem because it gives exact failure months, a concrete event log, and deterministic regression behavior.

### Historical backtesting instead of Monte Carlo

The app uses rolling historical windows from the Damodaran dataset rather than a stochastic model. That keeps results explainable and reproducible, which is especially useful for automated verification.

### Recipes as the flexibility mechanism

Recipe JSON is effectively a small domain-specific rules layer. It is the repo's main extension point for more complex scenarios such as guardrails, property sales, debt payoff, and reserve top-ups. That is the right direction for a client-only app, but it raises the cost of drift between parser behavior, examples, and tests.

### Local-only persistence

Scenarios are intentionally persisted in local storage rather than a backend. That keeps the app simple, but it means storage shape and migration behavior are real compatibility boundaries and should be treated as such.

## Automated Feedback Today

The repo exposes a good top-level local validation command in [`package.json`](/Users/jacob/.codex/worktrees/c66b/retirement-simulator/package.json):

- `pnpm check` runs TypeScript type checking
- `pnpm test` runs the Vitest suite
- `pnpm build` runs `tsc` and the Vite production build
- `pnpm validate` runs all three in sequence

This is the right command surface. There should be one obvious command that answers "is the repo still healthy?" and everything else should compose under it.

The current test layout is also directionally good:

- engine and money primitives are covered in [`src/engine.test.ts`](/Users/jacob/.codex/worktrees/c66b/retirement-simulator/src/engine.test.ts) and [`src/money.test.ts`](/Users/jacob/.codex/worktrees/c66b/retirement-simulator/src/money.test.ts)
- date utilities are covered in [`src/dates.test.ts`](/Users/jacob/.codex/worktrees/c66b/retirement-simulator/src/dates.test.ts)
- historical-return behavior is covered in [`src/historical.test.ts`](/Users/jacob/.codex/worktrees/c66b/retirement-simulator/src/historical.test.ts)
- retirement-plan and recipe behavior is covered in [`src/retirementDate.test.ts`](/Users/jacob/.codex/worktrees/c66b/retirement-simulator/src/retirementDate.test.ts)
- high-value ledger and financial correctness cases are covered in [`src/verification.test.ts`](/Users/jacob/.codex/worktrees/c66b/retirement-simulator/src/verification.test.ts)

During this review I could verify the command surface and test inventory from source, but I could not execute `pnpm validate` in this worktree because dependencies were not installed and there is no checked-in `node_modules/` tree. That is a local environment limitation, not a repo design issue, but it reinforces the importance of CI and hooks for consistent feedback.

## Feedback Gaps

The most important gaps are still in enforcement and boundary-specific verification:

- there is no `.github` workflow in the repository running `pnpm validate`
- there is no pre-commit or pre-push hook checked into the repo
- there is no dedicated `test:critical` style command for the financial simulator's highest-value regression cases
- there are no direct tests for `src/web/worker.ts`
- there are no direct tests for scenario persistence or storage-shape normalization
- recipe examples in `RecipeEditor.tsx` are duplicated documentation rather than a shared source of truth

For an LLM-maintained repository, those gaps matter more than stylistic cleanup. A future edit is much safer when the failure mode is an unavoidable command that fails loudly.

## Highest-Value Improvements

### 1. Make `pnpm validate` unavoidable

Keep `pnpm validate` as the one prominent health check and make all enforcement point at it:

- add CI that runs `pnpm validate` on every pull request and branch push
- require that check before merge
- add a lightweight pre-push hook that runs the same command locally

The important point is not adding more process. It is making the existing command impossible to forget.

### 2. Add a critical validation tier for simulator regressions

The financial simulator deserves a clearly named, easy-to-run critical layer under `pnpm validate`, for example:

- `pnpm test:critical` for exact retirement-search fixtures and high-value verification tests
- `pnpm validate` invoking that command alongside the broader suite

That gives maintainers a fast critical smoke test while preserving one obvious full-suite command.

### 3. Add exact end-to-end retirement-search fixtures

The highest-leverage tests in this repo should assert actual product outputs from `findEarliestRetirementMonth()`, not only helper behavior. Add a small fixture corpus that checks values such as:

- earliest viable retirement month
- success count and success rate
- worst failing window or failure month
- representative ending real portfolio values

Recommended fixture scenarios:

- a baseline plan
- a spending-guardrail plan
- an early-access penalty plan
- a reserve top-up recipe plan
- a multi-account plan with debt or real estate

This is the single best way to make LLM-led changes safer in the critical financial path.

### 4. Split `retirementDate.ts` by responsibility

Before more feature growth lands, split the current module into smaller domain files such as:

- `planInputs.ts`
- `recipe.ts`
- `planCompiler.ts`
- `retirementSearch.ts`

This can be done without behavior changes and would reduce the chance that future edits break unrelated policy.

### 5. Create a canonical recipe contract module

The recipe contract is currently spread across runtime validation, tests, and UI copy. Move the canonical examples and reference data into a shared module or fixtures directory that can be imported by:

- parser tests
- UI docs
- future schema validation helpers

That would reduce duplication and make recipe behavior easier to evolve safely.

### 6. Extract scenario persistence into a tested module

Move `loadState()` and `saveState()` out of `RetirementApp.tsx` into a small storage module such as `src/web/scenarioStorage.ts`. Test:

- loading partial or older saved shapes
- default filling
- stripping `historicalSet` before persistence
- selected-scenario recovery behavior

This is a small cleanup with a good payoff because it protects a real compatibility seam.

### 7. Add targeted worker-boundary tests

The worker protocol is compact enough that it should be cheap to test directly. Add tests that cover:

- progress message ordering
- result and scenario completion sequencing
- failure propagation when a scenario throws
- multi-scenario batching behavior

This is a classic seam where LLM edits can accidentally break behavior without touching core math.

## Practical Recommendations

- Keep the simulation core pure and framework-free.
- Resist putting more business logic into React components.
- Prefer new effects and checks over adding special cases directly into search orchestration.
- Treat recipe JSON as a supported internal contract with fixtures and examples.
- Require at least one realistic end-to-end simulator assertion for new financial behavior.
- Keep one short full validation command and make it prominent in docs, CI, and hooks.
- Fail loudly for correctness drift; use warnings only for non-critical quality signals.

## Recommended Cleanup Order

1. Add CI that runs `pnpm validate` and make it required for merge.
2. Add `pnpm test:critical` plus exact `findEarliestRetirementMonth()` regression fixtures.
3. Split `src/retirementDate.ts` into narrower domain modules without changing behavior.
4. Extract scenario persistence from [`src/web/RetirementApp.tsx`](/Users/jacob/.codex/worktrees/c66b/retirement-simulator/src/web/RetirementApp.tsx).
5. Centralize recipe examples and contract documentation.
6. Add targeted worker and persistence tests.

## Summary

The repo is still in a healthy small-app shape. The simulation core is clean, the worker boundary is sensible, and the validation command surface is better than average for a codebase this size.

The biggest architectural risks are concentrated rather than widespread:

- one overloaded orchestration module in `src/retirementDate.ts`
- untested persistence and worker seams
- validation that is documented but not yet enforced by CI or hooks

The highest-value next steps are small and practical: make `pnpm validate` mandatory, add exact end-to-end retirement-search fixtures, and split `retirementDate.ts` before more rules accumulate there. Those changes would materially improve safety and maintainability without adding much process or complexity.
