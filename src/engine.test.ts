import { describe, expect, it } from "vitest";
import { minimumBalanceCheck } from "./checks.js";
import { runSimulation } from "./engine.js";
import {
  monthlyExpense,
  monthlyIncome,
  monthlyReturn,
  monthlyReturnAboveReserve,
  monthlyTransfer,
  portfolioPercentExpense,
  scheduledAmount,
} from "./effects.js";
import type { Effect, SimulationConfig } from "./types.js";

function baseConfig(overrides: Partial<SimulationConfig> = {}): SimulationConfig {
  return {
    id: "test",
    name: "Test",
    startMonth: "2026-01",
    months: 3,
    initialAccounts: {
      checking: { id: "checking", name: "Checking", kind: "cash", balances: { cash: 100 } },
      taxable: { id: "taxable", name: "Taxable", kind: "taxable", balances: { stocks: 0 } },
      backup: { id: "backup", name: "Backup", kind: "taxable", balances: { stocks: 100 } },
    },
    effects: [],
    ...overrides,
  };
}

describe("simulation engine", () => {
  it("runs effects in order and records snapshots", () => {
    const result = runSimulation(
      baseConfig({
        effects: [
          monthlyIncome({
            id: "income",
            accountId: "checking",
            assetClass: "cash",
            amount: 10,
          }),
          monthlyExpense({
            id: "expense",
            accountId: "checking",
            assetClass: "cash",
            amount: 4,
          }),
        ],
      }),
    );

    expect(result.completed).toBe(true);
    expect(result.finalState.accounts.checking!.balances.cash).toBe(118);
    expect(result.events.map((event) => event.effectId).slice(0, 4)).toEqual([
      "income",
      "expense",
      "income",
      "expense",
    ]);
    expect(result.snapshots).toHaveLength(4);
    expect(result.snapshots.at(-1)!.month).toBe("2026-03");
  });

  it("respects effect date windows", () => {
    const result = runSimulation(
      baseConfig({
        effects: [
          monthlyIncome({
            id: "temporary-income",
            accountId: "checking",
            assetClass: "cash",
            amount: 100,
            start: "2026-02",
            end: "2026-02",
          }),
        ],
      }),
    );

    expect(result.finalState.accounts.checking!.balances.cash).toBe(200);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.month).toBe("2026-02");
  });

  it("supports custom scheduled amounts", () => {
    const result = runSimulation(
      baseConfig({
        months: 2,
        effects: [
          scheduledAmount({
            id: "indexed-income",
            accountId: "checking",
            assetClass: "cash",
            kind: "income",
            amount: (state) => state.monthIndex * 10,
          }),
        ],
      }),
    );

    expect(result.finalState.accounts.checking!.balances.cash).toBe(110);
    expect(result.events.map((event) => event.amount)).toEqual([0, 10]);
  });

  it("transfers between accounts", () => {
    const result = runSimulation(
      baseConfig({
        months: 1,
        effects: [
          monthlyTransfer({
            id: "invest",
            fromAccountId: "checking",
            fromAssetClass: "cash",
            toAccountId: "taxable",
            toAssetClass: "stocks",
            amount: 50,
          }),
        ],
      }),
    );

    expect(result.finalState.accounts.checking!.balances.cash).toBe(50);
    expect(result.finalState.accounts.taxable!.balances.stocks).toBe(50);
  });

  it("applies returns only to matching asset classes", () => {
    const result = runSimulation(
      baseConfig({
        months: 1,
        initialAccounts: {
          checking: { id: "checking", name: "Checking", kind: "cash", balances: { cash: 100 } },
          taxable: { id: "taxable", name: "Taxable", kind: "taxable", balances: { stocks: 100 } },
        },
        effects: [
          monthlyReturn({
            id: "stock-return",
            assetClasses: ["stocks"],
            monthlyRate: 0.1,
          }),
        ],
      }),
    );

    expect(result.finalState.accounts.checking!.balances.cash).toBe(100);
    expect(result.finalState.accounts.taxable!.balances.stocks).toBe(110);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.kind).toBe("return");
  });

  it("can apply returns only above a reserve", () => {
    const result = runSimulation(
      baseConfig({
        months: 1,
        effects: [
          monthlyReturnAboveReserve({
            id: "cash-return",
            accountId: "checking",
            assetClass: "cash",
            reserve: 60,
            monthlyRate: 0.1,
          }),
        ],
      }),
    );

    expect(result.finalState.accounts.checking!.balances.cash).toBe(104);
    expect(result.events[0]!.metadata).toEqual({ rate: 0.1, reserve: 60, investedBalance: 40 });
  });

  it("withdraws a portfolio percentage with an inflation-adjusted floor", () => {
    const result = runSimulation(
      baseConfig({
        months: 1,
        inflationIndex: 2,
        initialAccounts: {
          checking: { id: "checking", name: "Checking", kind: "cash", balances: { cash: 100 } },
          taxable: { id: "taxable", name: "Taxable", kind: "taxable", balances: { stocks: 1_000_000 } },
          backup: { id: "backup", name: "Backup", kind: "taxable", balances: { stocks: 100 } },
        },
        effects: [
          portfolioPercentExpense({
            id: "withdrawal",
            accountId: "checking",
            assetClass: "cash",
            portfolioAccountIds: ["checking", "taxable"],
            annualPercentage: 0.04,
            minimumAnnualAmount: (state) => 12_000 * state.inflationIndex,
          }),
        ],
      }),
    );

    expect(result.finalState.accounts.checking!.balances.cash).toBe(-3233.67);
    expect(result.events[0]!.amount).toBe(-3333.67);
    expect(result.events[0]!.metadata).toMatchObject({
      annualPercentage: 0.04,
      minimumAmount: 2000,
      percentageAmount: 3333.67,
    });
  });

  it("stops when a fail check fails", () => {
    const result = runSimulation(
      baseConfig({
        months: 12,
        effects: [
          monthlyExpense({
            id: "large-expense",
            accountId: "checking",
            assetClass: "cash",
            amount: 200,
          }),
        ],
        checks: [
          minimumBalanceCheck({
            id: "cash-positive",
            accountId: "checking",
            assetClass: "cash",
            minimum: 0,
            action: { type: "fail", message: "cash went negative" },
          }),
        ],
      }),
    );

    expect(result.completed).toBe(false);
    expect(result.failed).toBe(true);
    expect(result.failure).toEqual({
      month: "2026-01",
      checkId: "cash-positive",
      message: "cash went negative",
    });
  });

  it("can repair a failed balance with a transfer action", () => {
    const result = runSimulation(
      baseConfig({
        months: 1,
        effects: [
          monthlyExpense({
            id: "expense",
            accountId: "checking",
            assetClass: "cash",
            amount: 150,
          }),
        ],
        checks: [
          minimumBalanceCheck({
            id: "cash-floor",
            accountId: "checking",
            assetClass: "cash",
            minimum: 0,
            action: {
              type: "transfer",
              fromAccountId: "backup",
              fromAssetClass: "stocks",
              toAccountId: "checking",
              toAssetClass: "cash",
              amount: (_state, deficit) => deficit,
              failIfInsufficient: true,
            },
          }),
        ],
      }),
    );

    expect(result.completed).toBe(true);
    expect(result.finalState.accounts.checking!.balances.cash).toBe(0);
    expect(result.finalState.accounts.backup!.balances.stocks).toBe(50);
    expect(result.events.at(-1)!.kind).toBe("transfer");
  });

  it("fails a repair action when the source account is insufficient", () => {
    const result = runSimulation(
      baseConfig({
        months: 1,
        effects: [
          monthlyExpense({
            id: "expense",
            accountId: "checking",
            assetClass: "cash",
            amount: 250,
          }),
        ],
        checks: [
          minimumBalanceCheck({
            id: "cash-floor",
            accountId: "checking",
            assetClass: "cash",
            minimum: 0,
            action: {
              type: "sell",
              fromAccountId: "backup",
              fromAssetClass: "stocks",
              toAccountId: "checking",
              toAssetClass: "cash",
              amount: (_state, deficit) => deficit,
              failIfInsufficient: true,
              message: "not enough backup assets",
            },
          }),
        ],
      }),
    );

    expect(result.failed).toBe(true);
    expect(result.failure?.message).toBe("not enough backup assets");
  });

  it("supports arbitrary custom effects", () => {
    const metadataEffect: Effect = {
      id: "metadata",
      appliesTo: () => true,
      apply: (state) => ({
        state: { ...state, metadata: { ...state.metadata, touched: (Number(state.metadata.touched) || 0) + 1 } },
        events: [{ month: state.month, effectId: "metadata", kind: "note", description: "Touched metadata" }],
      }),
    };

    const result = runSimulation(baseConfig({ months: 2, effects: [metadataEffect] }));

    expect(result.finalState.metadata.touched).toBe(2);
    expect(result.events).toHaveLength(2);
  });
});
