import { describe, expect, it } from "vitest";
import {
  defaultRetirementPlanInputs,
  findEarliestRetirementMonth,
  type RetirementPlanInputs,
  type RetirementSearchResult,
} from "./retirementDate.js";

type RegressionFixture = {
  name: string;
  inputs: RetirementPlanInputs;
  expected: {
    retirementMonth: RetirementSearchResult["retirementMonth"];
    successRate: number;
    successCount: number;
    totalWindows: number;
    medianEndingRealPortfolio: number;
    worstWindow: RetirementSearchResult["worstWindow"];
  };
};

const regressionFixtures: RegressionFixture[] = [
  {
    name: "baseline standard plan",
    inputs: {
      ...defaultRetirementPlanInputs,
      startMonth: "2026-01",
      birthYear: 1990,
      estimatedDeathAge: 90,
      accessiblePortfolio: 250_000,
      retirementPortfolio: 450_000,
      monthlyIncome: 9_000,
      monthlyExpenses: 4_500,
      monthlyRetirementContribution: 2_000,
      monthlyRetirementSpending: 5_500,
      successTarget: 1,
    },
    expected: {
      retirementMonth: "2035-05",
      successRate: 1,
      successCount: 44,
      totalWindows: 44,
      medianEndingRealPortfolio: 9_557_888.51,
      worstWindow: {
        startYear: 1965,
        endYear: 2019,
        endingRealPortfolioValue: 216_223.61,
        success: true,
        failureMonth: null,
      },
    },
  },
  {
    name: "guardrail spending cut",
    inputs: {
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
            when: {
              source: "portfolioTotal",
              accountIds: ["nonRetirementPortfolio", "retirementPortfolio"],
              operator: "<",
              value: 750_000,
            },
            actions: [{ type: "setRetirementSpending", amount: 36_000, period: "annual" }],
          },
        ],
      }),
    },
    expected: {
      retirementMonth: "2026-01",
      successRate: 1,
      successCount: 97,
      totalWindows: 97,
      medianEndingRealPortfolio: 635_717.55,
      worstWindow: {
        startYear: 1946,
        endYear: 1947,
        endingRealPortfolioValue: 484_790.59,
        success: true,
        failureMonth: null,
      },
    },
  },
  {
    name: "early access with penalty",
    inputs: {
      ...defaultRetirementPlanInputs,
      startMonth: "2026-01",
      birthYear: 1995,
      estimatedDeathAge: 70,
      accessiblePortfolio: 150_000,
      retirementPortfolio: 350_000,
      monthlyIncome: 0,
      monthlyExpenses: 0,
      monthlyRetirementContribution: 0,
      monthlyRetirementSpending: 2_200,
      allowEarlyRetirementAccess: true,
      earlyWithdrawalPenalty: 0.2,
      successTarget: 0.95,
    },
    expected: {
      retirementMonth: "2035-06",
      successRate: 0.9661016949152542,
      successCount: 57,
      totalWindows: 59,
      medianEndingRealPortfolio: 2_004_330.29,
      worstWindow: {
        startYear: 1966,
        endYear: 2005,
        endingRealPortfolioValue: -1_265.64,
        success: false,
        failureMonth: "2055-11",
      },
    },
  },
  {
    name: "reserve top-up rule",
    inputs: {
      ...defaultRetirementPlanInputs,
      startMonth: "2026-01",
      birthYear: 1970,
      estimatedDeathAge: 65,
      accessiblePortfolio: 40_000,
      retirementPortfolio: 550_000,
      allocation: { stocks: 0, bonds: 0, cash: 100 },
      monthlyIncome: 0,
      monthlyExpenses: 0,
      monthlyRetirementContribution: 0,
      monthlyRetirementSpending: 4_000,
      successTarget: 1,
      recipeJson: JSON.stringify({
        version: 1,
        rules: [
          {
            id: "taxable-cash-reserve",
            when: [
              { source: "retired", equals: true },
              {
                source: "accountBalance",
                accountId: "nonRetirementPortfolio",
                assetClass: "cash",
                operator: "<",
                value: 50_000,
              },
            ],
            actions: [
              {
                type: "topUpAccount",
                accountId: "nonRetirementPortfolio",
                assetClass: "cash",
                targetBalance: 50_000,
                fromAccountId: "retirementPortfolio",
                fromAssetClass: "cash",
                penaltyRate: 0.2,
                limitToAvailable: true,
              },
            ],
          },
        ],
      }),
    },
    expected: {
      retirementMonth: "2029-04",
      successRate: 1,
      successCount: 89,
      totalWindows: 89,
      medianEndingRealPortfolio: 201_880.48,
      worstWindow: {
        startYear: 1941,
        endYear: 1950,
        endingRealPortfolioValue: 237.61,
        success: true,
        failureMonth: null,
      },
    },
  },
  {
    name: "extra accounts with rental sale",
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
    expected: {
      retirementMonth: "2026-10",
      successRate: 1,
      successCount: 83,
      totalWindows: 83,
      medianEndingRealPortfolio: 491_516.92,
      worstWindow: {
        startYear: 1941,
        endYear: 1956,
        endingRealPortfolioValue: 85_553.83,
        success: true,
        failureMonth: null,
      },
    },
  },
];

describe("retirement search regressions", () => {
  for (const fixture of regressionFixtures) {
    it(`preserves the ${fixture.name} outcome`, () => {
      const result = findEarliestRetirementMonth(fixture.inputs);

      expect(result.retirementMonth).toBe(fixture.expected.retirementMonth);
      expect(result.successRate).toBeCloseTo(fixture.expected.successRate, 12);
      expect(result.successCount).toBe(fixture.expected.successCount);
      expect(result.totalWindows).toBe(fixture.expected.totalWindows);
      expect(result.medianEndingRealPortfolio).toBe(fixture.expected.medianEndingRealPortfolio);
      expect(result.worstWindow).toEqual(fixture.expected.worstWindow);
    });
  }
});
