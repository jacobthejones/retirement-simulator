import { describe, expect, it } from "vitest";
import { minimumBalanceCheck } from "./checks.js";
import { runSimulation } from "./engine.js";
import { monthlyExpense, monthlyIncome, monthlyReturn, monthlyTransfer, rebalanceAccount } from "./effects.js";
import { annualToMonthlyRate, historicalInflationEffect, historicalReturnEffect } from "./historical.js";
import { netWorth, roundMoney } from "./money.js";
import {
  buildRetirementDateConfig,
  defaultRetirementPlanInputs,
  parseScenarioRecipe,
  type RetirementPlanInputs,
} from "./retirementDate.js";
import type { Account, SimulationConfig } from "./types.js";

function account(id: string, balances: Account["balances"]): Account {
  return { id, name: id, kind: "cash", balances };
}

function config(overrides: Partial<SimulationConfig>): SimulationConfig {
  return {
    id: "verification",
    name: "Verification",
    startMonth: "2026-01",
    months: 1,
    initialAccounts: {},
    effects: [],
    ...overrides,
  };
}

describe("software correctness verification", () => {
  it("matches a hand ledger for fixed monthly income, expenses, and transfers", () => {
    const result = runSimulation(
      config({
        months: 6,
        initialAccounts: {
          checking: account("checking", { cash: 1_000 }),
          brokerage: account("brokerage", { cash: 0 }),
        },
        effects: [
          monthlyIncome({ id: "paycheck", accountId: "checking", assetClass: "cash", amount: 1_000 }),
          monthlyExpense({ id: "spending", accountId: "checking", assetClass: "cash", amount: 300 }),
          monthlyTransfer({
            id: "invest",
            fromAccountId: "checking",
            fromAssetClass: "cash",
            toAccountId: "brokerage",
            toAssetClass: "cash",
            amount: 200,
          }),
        ],
      }),
    );

    expect(result.finalState.accounts.checking!.balances.cash).toBe(4_000);
    expect(result.finalState.accounts.brokerage!.balances.cash).toBe(1_200);
    expect(netWorth(result.finalState.accounts)).toBe(5_200);
    expect(result.snapshots).toHaveLength(7);
    expect(result.events.map((event) => event.effectId).slice(0, 6)).toEqual([
      "paycheck",
      "spending",
      "invest",
      "paycheck",
      "spending",
      "invest",
    ]);
  });

  it("matches an independent ledger across deterministic generated cash-flow cases", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const months = 1 + (seed % 36);
      const startingChecking = 500 + seed * 13;
      const startingBrokerage = 100 + seed * 7;
      const income = 300 + (seed % 11) * 25;
      const expense = 50 + (seed % 7) * 10;
      const transfer = 20 + (seed % 5) * 5;

      const result = runSimulation(
        config({
          id: `generated-${seed}`,
          months,
          initialAccounts: {
            checking: account("checking", { cash: startingChecking }),
            brokerage: account("brokerage", { cash: startingBrokerage }),
          },
          effects: [
            monthlyIncome({ id: "income", accountId: "checking", assetClass: "cash", amount: income }),
            monthlyExpense({ id: "expense", accountId: "checking", assetClass: "cash", amount: expense }),
            monthlyTransfer({
              id: "transfer",
              fromAccountId: "checking",
              fromAssetClass: "cash",
              toAccountId: "brokerage",
              toAssetClass: "cash",
              amount: transfer,
            }),
          ],
        }),
      );

      const expectedChecking = startingChecking + months * (income - expense - transfer);
      const expectedBrokerage = startingBrokerage + months * transfer;

      expect(result.finalState.accounts.checking!.balances.cash, `checking seed ${seed}`).toBe(expectedChecking);
      expect(result.finalState.accounts.brokerage!.balances.cash, `brokerage seed ${seed}`).toBe(expectedBrokerage);
      expect(netWorth(result.finalState.accounts), `net worth seed ${seed}`).toBe(
        startingChecking + startingBrokerage + months * (income - expense),
      );
    }
  });

  it("applies checks after effects and stops on the exact failure month", () => {
    const result = runSimulation(
      config({
        months: 3,
        initialAccounts: {
          checking: account("checking", { cash: 100 }),
        },
        effects: [monthlyExpense({ id: "large-expense", accountId: "checking", assetClass: "cash", amount: 150 })],
        checks: [
          minimumBalanceCheck({
            id: "cash-floor",
            accountId: "checking",
            assetClass: "cash",
            minimum: 0,
            action: { type: "fail", message: "cash below zero" },
          }),
        ],
      }),
    );

    expect(result.completed).toBe(false);
    expect(result.failed).toBe(true);
    expect(result.failure).toEqual({ month: "2026-01", checkId: "cash-floor", message: "cash below zero" });
    expect(result.finalState.accounts.checking!.balances.cash).toBe(-50);
    expect(result.snapshots).toHaveLength(2);
    expect(result.events.map((event) => event.effectId)).toEqual(["large-expense", "cash-floor"]);
  });

  it("is deterministic and does not mutate input accounts or prior snapshots", () => {
    const simulationConfig = config({
      months: 2,
      initialAccounts: {
        checking: account("checking", { cash: 100 }),
      },
      effects: [monthlyIncome({ id: "income", accountId: "checking", assetClass: "cash", amount: 50 })],
    });

    const first = runSimulation(simulationConfig);
    const second = runSimulation(simulationConfig);

    expect(first.finalState).toEqual(second.finalState);
    expect(first.events).toEqual(second.events);
    expect(simulationConfig.initialAccounts.checking!.balances.cash).toBe(100);
    expect(first.snapshots[0]!.accounts.checking!.balances.cash).toBe(100);
    expect(first.snapshots[1]!.accounts.checking!.balances.cash).toBe(150);
    expect(first.snapshots[2]!.accounts.checking!.balances.cash).toBe(200);
  });

  it("compounds historical returns and inflation to the annual value after twelve months", () => {
    const annualRate = 0.12682503013196977;
    const result = runSimulation(
      config({
        months: 12,
        initialAccounts: {
          brokerage: account("brokerage", { stocks: 1_000 }),
        },
        effects: [
          historicalReturnEffect({
            id: "returns",
            data: [{ year: 2000, stocks: annualRate, smallCaps: 0, cash: 0, bonds: 0, corporateBonds: 0, realEstate: 0, gold: 0, inflation: annualRate }],
            mappings: [{ accountIds: ["brokerage"], assetClass: "stocks", returnKey: "stocks" }],
          }),
          historicalInflationEffect({
            id: "inflation",
            data: [{ year: 2000, stocks: 0, smallCaps: 0, cash: 0, bonds: 0, corporateBonds: 0, realEstate: 0, gold: 0, inflation: annualRate }],
          }),
        ],
        metadata: { historicalStartYear: 2000 },
      }),
    );

    expect(annualToMonthlyRate(annualRate)).toBeCloseTo(0.01, 12);
    expect(result.finalState.accounts.brokerage!.balances.stocks).toBe(1_126.84);
    expect(roundMoney(result.finalState.inflationIndex)).toBe(1.13);
    expect(result.events.filter((event) => event.effectId === "returns")).toHaveLength(12);
    expect(result.events.filter((event) => event.effectId === "inflation")).toHaveLength(12);
  });

  it("preserves account totals when rebalancing and transfer effects move money internally", () => {
    const result = runSimulation(
      config({
        months: 1,
        initialAccounts: {
          taxable: { id: "taxable", name: "Taxable", kind: "taxable", balances: { stocks: 900, bonds: 100, cash: 0 } },
          checking: account("checking", { cash: 250 }),
        },
        effects: [
          rebalanceAccount({
            id: "rebalance",
            accountId: "taxable",
            targets: { stocks: 0.6, bonds: 0.3, cash: 0.1 },
          }),
          monthlyTransfer({
            id: "move-cash",
            fromAccountId: "checking",
            fromAssetClass: "cash",
            toAccountId: "taxable",
            toAssetClass: "cash",
            amount: 50,
          }),
        ],
      }),
    );

    expect(result.finalState.accounts.taxable!.balances).toEqual({ stocks: 600, bonds: 300, cash: 150 });
    expect(result.finalState.accounts.checking!.balances.cash).toBe(200);
    expect(netWorth(result.finalState.accounts)).toBe(1_250);
  });

  it("applies retirement spending rules before withdrawal and records the triggering recipe rule", () => {
    const inputs: RetirementPlanInputs = {
      ...defaultRetirementPlanInputs,
      startMonth: "2026-01",
      birthYear: 1970,
      estimatedDeathAge: 57,
      accessiblePortfolio: 700_000,
      retirementPortfolio: 0,
      allocation: { stocks: 0, bonds: 0, cash: 100 },
      monthlyIncome: 0,
      monthlyExpenses: 0,
      monthlyRetirementContribution: 0,
      monthlyRetirementSpending: 50_000 / 12,
      recipeJson: JSON.stringify({
        version: 1,
        rules: [
          {
            id: "guardrail",
            when: { source: "portfolioTotal", accountIds: ["nonRetirementPortfolio", "retirementPortfolio"], operator: "<", value: 750_000 },
            actions: [{ type: "setRetirementSpending", amount: 36_000, period: "annual" }],
          },
        ],
      }),
    };

    const result = runSimulation(buildRetirementDateConfig(inputs, "2026-01"));
    const spendingEvent = result.events.find((event) => event.effectId === "retirement-spending");

    expect(spendingEvent?.amount).toBe(-3_000);
    expect(spendingEvent?.metadata?.recipeRuleIds).toEqual(["guardrail"]);
  });

  it("applies recipe addAmount and transfer actions using the current inflation index", () => {
    const inputs: RetirementPlanInputs = {
      ...defaultRetirementPlanInputs,
      startMonth: "2026-01",
      birthYear: 1970,
      estimatedDeathAge: 57,
      accessiblePortfolio: 12_000,
      retirementPortfolio: 0,
      allocation: { stocks: 0, bonds: 0, cash: 100 },
      monthlyIncome: 0,
      monthlyExpenses: 0,
      monthlyRetirementContribution: 0,
      monthlyRetirementSpending: 0,
      recipeJson: JSON.stringify({
        version: 1,
        accounts: [{ id: "reserve", name: "Reserve", kind: "cash", balances: { cash: 1_000 } }],
        rules: [
          {
            id: "nominal-side-income",
            actions: [{ type: "addAmount", accountId: "nonRetirementPortfolio", amount: 120, period: "annual", inflationAdjusted: false }],
          },
          {
            id: "inflation-adjusted-expense",
            actions: [{ type: "addAmount", accountId: "nonRetirementPortfolio", amount: -120, period: "annual" }],
          },
          {
            id: "reserve-transfer",
            actions: [
              {
                type: "transfer",
                fromAccountId: "reserve",
                toAccountId: "nonRetirementPortfolio",
                amount: 60,
                period: "annual",
                limitToAvailable: true,
                inflationAdjusted: false,
              },
            ],
          },
        ],
      }),
    };

    const configWithInflation = buildRetirementDateConfig(inputs, "2026-01");
    const result = runSimulation({
      ...configWithInflation,
      months: 1,
      inflationIndex: 2,
      effects: configWithInflation.effects.filter((effect) => effect.id === "recipe-actions"),
      checks: [],
    });

    expect(result.events.map((event) => [event.effectId, event.amount])).toEqual([
      ["recipe-nominal-side-income", 10],
      ["recipe-inflation-adjusted-expense", -20],
      ["recipe-reserve-transfer", -5],
    ]);
    expect(result.finalState.accounts.nonRetirementPortfolio!.balances.cash).toBe(11_995);
    expect(result.finalState.accounts.reserve!.balances.cash).toBe(995);
  });

  it("rejects recipe references that would silently simulate the wrong scenario", () => {
    expect(() =>
      parseScenarioRecipe(
        JSON.stringify({
          version: 1,
          rules: [
            {
              id: "typo",
              when: { source: "accountTotal", accountId: "nonRetirementPortflio", operator: "<", value: 1_000 },
              actions: [{ type: "setRetirementSpending", amount: 1_000 }],
            },
          ],
        }),
      ),
    ).toThrow("unknown account nonRetirementPortflio");

    expect(() =>
      parseScenarioRecipe(
        JSON.stringify({
          version: 1,
          rules: [
            {
              id: "bad-transfer",
              actions: [{ type: "transfer", fromAccountId: "reserve", toAccountId: "nonRetirementPortfolio", amount: 100 }],
            },
          ],
        }),
      ),
    ).toThrow("unknown account reserve");
  });
});
