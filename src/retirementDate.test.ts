import { describe, expect, it } from "vitest";
import { runSimulation } from "./engine.js";
import {
  buildRetirementDateConfig,
  defaultRetirementPlanInputs,
  findEarliestRetirementMonth,
  monthlySavings,
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
