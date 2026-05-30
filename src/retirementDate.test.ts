import { describe, expect, it } from "vitest";
import { runSimulation } from "./engine.js";
import {
  buildRetirementDateConfig,
  defaultRetirementPlanInputs,
  findEarliestRetirementMonth,
  monthlySavings,
  parseScenarioRecipe,
  retirementAccessMonth,
  type RetirementPlanInputs,
} from "./retirementDate.js";

describe("retirement date v1 model", () => {
  it("derives monthly non-retirement savings from bank income, expenses, and pre-retirement modifiers", () => {
    const inputs: RetirementPlanInputs = {
      ...defaultRetirementPlanInputs,
      monthlyIncome: 10_000,
      monthlyExpenses: 4_000,
      monthlyRetirementContribution: 1_500,
      modifiers: [
        {
          id: "extra-expense",
          name: "Extra expense",
          kind: "monthlyExpense",
          amount: 500,
          start: "now",
          end: "2028-06",
        },
      ],
    };

    expect(monthlySavings(inputs)).toBe(5_500);
  });

  it("uses a conservative age-60 access month when only birth year is known", () => {
    expect(retirementAccessMonth({ birthYear: 1995, retirementAccessAge: 60 })).toBe("2056-01");
  });

  it("fails when non-retirement money runs out before retirement funds are available and early access is disabled", () => {
    const inputs: RetirementPlanInputs = {
      ...defaultRetirementPlanInputs,
      startMonth: "2026-01",
      birthYear: 1995,
      estimatedDeathAge: 32,
      accessiblePortfolio: 0,
      retirementPortfolio: 100_000,
      monthlyIncome: 0,
      monthlyExpenses: 0,
      monthlyRetirementContribution: 0,
      monthlyRetirementSpending: 1_000,
      allowEarlyRetirementAccess: false,
    };

    const result = runSimulation(buildRetirementDateConfig(inputs, "2026-01"));

    expect(result.failed).toBe(true);
    expect(result.failure?.checkId).toBe("non-retirement-portfolio-nonnegative");
  });

  it("allows early retirement withdrawals with the configured penalty assumption", () => {
    const inputs: RetirementPlanInputs = {
      ...defaultRetirementPlanInputs,
      startMonth: "2026-01",
      birthYear: 1995,
      estimatedDeathAge: 32,
      accessiblePortfolio: 0,
      retirementPortfolio: 100_000,
      monthlyIncome: 0,
      monthlyExpenses: 0,
      monthlyRetirementContribution: 0,
      monthlyRetirementSpending: 1_000,
      allowEarlyRetirementAccess: true,
      earlyWithdrawalPenalty: 0.2,
    };

    const result = runSimulation(buildRetirementDateConfig(inputs, "2026-01"));

    expect(result.failed).toBe(false);
    expect(result.events.some((event) => event.description.includes("early-access penalty"))).toBe(true);
  });

  it("can lower retirement spending from ordered recipe rules", () => {
    const inputs: RetirementPlanInputs = {
      ...defaultRetirementPlanInputs,
      startMonth: "2026-01",
      birthYear: 1995,
      estimatedDeathAge: 32,
      accessiblePortfolio: 700_000,
      retirementPortfolio: 0,
      monthlyIncome: 0,
      monthlyExpenses: 0,
      monthlyRetirementContribution: 0,
      monthlyRetirementSpending: 50_000 / 12,
      recipeJson: JSON.stringify({
        version: 1,
        rules: [
          {
            id: "spending-cut-under-1m",
            when: {
              source: "portfolioTotal",
              accountIds: ["nonRetirementPortfolio", "retirementPortfolio"],
              operator: "<",
              value: 1_000_000,
            },
            actions: [{ type: "setRetirementSpending", amount: 40_000, period: "annual" }],
          },
          {
            id: "spending-cut-under-750k",
            when: {
              source: "portfolioTotal",
              accountIds: ["nonRetirementPortfolio", "retirementPortfolio"],
              operator: "<",
              value: 750_000,
            },
            actions: [{ type: "setRetirementSpending", amount: 35_000, period: "annual" }],
          },
        ],
      }),
    };

    const result = runSimulation(buildRetirementDateConfig(inputs, "2026-01"));
    const spendingEvent = result.events.find((event) => event.effectId === "retirement-spending");

    expect(spendingEvent?.amount).toBe(-2916.67);
    expect(spendingEvent?.metadata?.recipeRuleIds).toEqual([
      "spending-cut-under-1m",
      "spending-cut-under-750k",
    ]);
  });

  it("rejects malformed recipe JSON before simulation starts", () => {
    expect(() => parseScenarioRecipe(JSON.stringify({ version: 1, rules: [{ id: "missing-actions" }] }))).toThrow(
      "must include at least one action",
    );
  });

  it("can represent five complicated hypothetical recipe scenarios", () => {
    const scenarios: Array<{
      name: string;
      inputs: RetirementPlanInputs;
      retirementMonth: `${number}-${string}`;
      expectedRecipeEvents: string[];
    }> = [
      {
        name: "Avery adapts spending and pays down a mortgage",
        retirementMonth: "2026-01",
        inputs: {
          ...defaultRetirementPlanInputs,
          name: "Avery",
          startMonth: "2026-01",
          birthYear: 1970,
          estimatedDeathAge: 57,
          accessiblePortfolio: 700_000,
          retirementPortfolio: 350_000,
          allocation: { stocks: 0, bonds: 0, cash: 100 },
          monthlyIncome: 0,
          monthlyExpenses: 0,
          monthlyRetirementContribution: 0,
          monthlyRetirementSpending: 50_000 / 12,
          recipeJson: JSON.stringify({
            version: 1,
            accounts: [
              { id: "primaryHome", name: "Primary home", kind: "real-estate", balances: { realEstate: 400_000 } },
              { id: "mortgage", name: "Mortgage", kind: "debt", balances: { principal: -200_000 } },
            ],
            rules: [
              {
                id: "pay-mortgage",
                when: { source: "accountTotal", accountId: "mortgage", operator: "<", value: 0 },
                actions: [
                  {
                    type: "transfer",
                    fromAccountId: "nonRetirementPortfolio",
                    fromAssetClass: "cash",
                    toAccountId: "mortgage",
                    toAssetClass: "principal",
                    amount: 1_500,
                    limitToAvailable: true,
                    kind: "debt-payment",
                  },
                ],
              },
              {
                id: "cut-spending-under-1m",
                when: { source: "portfolioTotal", accountIds: ["nonRetirementPortfolio", "retirementPortfolio"], operator: "<", value: 1_000_000 },
                actions: [{ type: "setRetirementSpending", amount: 40_000, period: "annual" }],
              },
              {
                id: "cut-spending-under-750k",
                when: { source: "portfolioTotal", accountIds: ["nonRetirementPortfolio", "retirementPortfolio"], operator: "<", value: 750_000 },
                actions: [{ type: "setRetirementSpending", amount: 35_000, period: "annual" }],
              },
            ],
          }),
        },
        expectedRecipeEvents: ["recipe-pay-mortgage"],
      },
      {
        name: "Blair consults only when retirement reserves are thin",
        retirementMonth: "2026-01",
        inputs: {
          ...defaultRetirementPlanInputs,
          name: "Blair",
          startMonth: "2026-01",
          birthYear: 1968,
          estimatedDeathAge: 58,
          accessiblePortfolio: 350_000,
          retirementPortfolio: 300_000,
          allocation: { stocks: 0, bonds: 0, cash: 100 },
          monthlyIncome: 0,
          monthlyExpenses: 0,
          monthlyRetirementContribution: 0,
          monthlyRetirementSpending: 5_500,
          recipeJson: JSON.stringify({
            version: 1,
            rules: [
              {
                id: "consult-when-under-900k",
                when: [
                  { source: "retired", equals: true },
                  { source: "portfolioTotal", accountIds: ["nonRetirementPortfolio", "retirementPortfolio"], operator: "<", value: 900_000 },
                ],
                actions: [
                  {
                    type: "addAmount",
                    accountId: "nonRetirementPortfolio",
                    assetClass: "cash",
                    amount: 1_800,
                    kind: "income",
                    description: "Part-time consulting income",
                  },
                ],
              },
            ],
          }),
        },
        expectedRecipeEvents: ["recipe-consult-when-under-900k"],
      },
      {
        name: "Casey supports family, then redirects the money to retirement",
        retirementMonth: "2034-01",
        inputs: {
          ...defaultRetirementPlanInputs,
          name: "Casey",
          startMonth: "2032-01",
          birthYear: 1984,
          estimatedDeathAge: 51,
          accessiblePortfolio: 220_000,
          retirementPortfolio: 180_000,
          allocation: { stocks: 0, bonds: 0, cash: 100 },
          monthlyIncome: 8_500,
          monthlyExpenses: 4_500,
          monthlyRetirementContribution: 1_000,
          monthlyRetirementSpending: 5_000,
          recipeJson: JSON.stringify({
            version: 1,
            rules: [
              {
                id: "parent-support-window",
                when: [
                  { source: "month", operator: ">=", value: "2032-01" },
                  { source: "month", operator: "<=", value: "2033-12" },
                  { source: "retired", equals: false },
                ],
                actions: [
                  { type: "addAmount", accountId: "nonRetirementPortfolio", amount: -1_200, kind: "expense" },
                ],
              },
              {
                id: "redirect-support-to-retirement",
                when: [
                  { source: "month", operator: ">=", value: "2034-01" },
                  { source: "retired", equals: false },
                ],
                actions: [
                  { type: "addAmount", accountId: "retirementPortfolio", amount: 1_200, kind: "income" },
                ],
              },
            ],
          }),
        },
        expectedRecipeEvents: ["recipe-parent-support-window"],
      },
      {
        name: "Devon sells a rental and pays off its loan",
        retirementMonth: "2026-01",
        inputs: {
          ...defaultRetirementPlanInputs,
          name: "Devon",
          startMonth: "2026-01",
          birthYear: 1975,
          estimatedDeathAge: 66,
          accessiblePortfolio: 500_000,
          retirementPortfolio: 500_000,
          allocation: { stocks: 0, bonds: 0, cash: 100 },
          monthlyIncome: 0,
          monthlyExpenses: 0,
          monthlyRetirementContribution: 0,
          monthlyRetirementSpending: 5_000,
          recipeJson: JSON.stringify({
            version: 1,
            accounts: [
              { id: "rental", name: "Rental property", kind: "real-estate", balances: { realEstate: 300_000 } },
              { id: "rentalLoan", name: "Rental mortgage", kind: "debt", balances: { principal: -120_000 } },
            ],
            rules: [
              {
                id: "monthly-rental-net-income",
                actions: [{ type: "addAmount", accountId: "nonRetirementPortfolio", amount: 900, kind: "income" }],
              },
              {
                id: "sell-rental",
                when: { source: "month", operator: "==", value: "2040-01" },
                actions: [
                  {
                    type: "transfer",
                    fromAccountId: "rental",
                    fromAssetClass: "realEstate",
                    toAccountId: "nonRetirementPortfolio",
                    toAssetClass: "cash",
                    amount: 300_000,
                  },
                  {
                    type: "transfer",
                    fromAccountId: "nonRetirementPortfolio",
                    fromAssetClass: "cash",
                    toAccountId: "rentalLoan",
                    toAssetClass: "principal",
                    amount: 120_000,
                    kind: "debt-payment",
                  },
                ],
              },
            ],
          }),
        },
        expectedRecipeEvents: ["recipe-monthly-rental-net-income", "recipe-sell-rental"],
      },
      {
        name: "Emery sells business equity when cash gets low",
        retirementMonth: "2026-01",
        inputs: {
          ...defaultRetirementPlanInputs,
          name: "Emery",
          startMonth: "2026-01",
          birthYear: 1972,
          estimatedDeathAge: 80,
          accessiblePortfolio: 140_000,
          retirementPortfolio: 850_000,
          allocation: { stocks: 0, bonds: 0, cash: 100 },
          monthlyIncome: 0,
          monthlyExpenses: 0,
          monthlyRetirementContribution: 0,
          monthlyRetirementSpending: 7_000,
          recipeJson: JSON.stringify({
            version: 1,
            accounts: [
              { id: "businessEquity", name: "Business equity", kind: "other", balances: { privateEquity: 500_000 } },
            ],
            rules: [
              {
                id: "sell-business-tranche",
                when: { source: "accountBalance", accountId: "nonRetirementPortfolio", assetClass: "cash", operator: "<", value: 200_000 },
                actions: [
                  {
                    type: "transfer",
                    fromAccountId: "businessEquity",
                    fromAssetClass: "privateEquity",
                    toAccountId: "nonRetirementPortfolio",
                    toAssetClass: "cash",
                    amount: 100_000,
                    limitToAvailable: true,
                  },
                ],
              },
              {
                id: "health-care-step-up",
                when: { source: "month", operator: ">=", value: "2045-01" },
                actions: [{ type: "addAmount", accountId: "nonRetirementPortfolio", amount: -1_000, kind: "expense" }],
              },
              {
                id: "guardrail-spending",
                when: { source: "portfolioTotal", accountIds: ["nonRetirementPortfolio", "retirementPortfolio"], operator: "<", value: 1_200_000 },
                actions: [{ type: "setRetirementSpending", amount: 60_000, period: "annual" }],
              },
            ],
          }),
        },
        expectedRecipeEvents: ["recipe-sell-business-tranche", "recipe-health-care-step-up"],
      },
    ];

    for (const scenario of scenarios) {
      const result = runSimulation(buildRetirementDateConfig(scenario.inputs, scenario.retirementMonth));
      const recipeEventIds = new Set(result.events.filter((event) => event.effectId.startsWith("recipe-")).map((event) => event.effectId));

      expect(result.events.length, scenario.name).toBeGreaterThan(0);
      for (const expectedEventId of scenario.expectedRecipeEvents) {
        expect(recipeEventIds.has(expectedEventId), scenario.name).toBe(true);
      }
    }
  });

  it("can find the current month when starting portfolios already satisfy the historical target", () => {
    const inputs: RetirementPlanInputs = {
      ...defaultRetirementPlanInputs,
      startMonth: "2026-01",
      birthYear: 1995,
      estimatedDeathAge: 45,
      accessiblePortfolio: 5_000_000,
      retirementPortfolio: 0,
      monthlyIncome: 0,
      monthlyExpenses: 0,
      monthlyRetirementContribution: 0,
      monthlyRetirementSpending: 1_000,
      successTarget: 1,
      allowEarlyRetirementAccess: false,
    };

    const result = findEarliestRetirementMonth(inputs);

    expect(result.retirementMonth).toBe("2026-01");
    expect(result.successRate).toBe(1);
  });
});
