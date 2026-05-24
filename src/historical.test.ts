import { describe, expect, it } from "vitest";
import { runSimulation } from "./engine.js";
import { monthlyExpense } from "./effects.js";
import {
  annualToMonthlyRate,
  historicalInflationEffect,
  historicalReturnEffect,
  runHistoricalSimulations,
  type HistoricalReturnRecord,
} from "./historical.js";
import type { SimulationConfig } from "./types.js";

const data: HistoricalReturnRecord[] = [
  {
    year: 2000,
    stocks: 0.12,
    smallCaps: 0.2,
    cash: 0.012,
    bonds: 0.06,
    corporateBonds: 0.07,
    realEstate: 0.03,
    gold: 0.04,
    inflation: 0.024,
  },
  {
    year: 2001,
    stocks: -0.12,
    smallCaps: -0.2,
    cash: 0.012,
    bonds: 0.06,
    corporateBonds: 0.07,
    realEstate: 0.03,
    gold: 0.04,
    inflation: 0.024,
  },
];

describe("historical returns", () => {
  it("converts annual returns to equivalent monthly rates", () => {
    const monthly = annualToMonthlyRate(0.12);
    expect((1 + monthly) ** 12 - 1).toBeCloseTo(0.12, 12);
    expect(annualToMonthlyRate(-1)).toBe(-1);
  });

  it("applies returns based on historical start year and month index", () => {
    const config: SimulationConfig = {
      id: "historical-test",
      name: "Historical Test",
      startMonth: "2026-01",
      months: 13,
      initialAccounts: {
        portfolio: { id: "portfolio", name: "Portfolio", kind: "taxable", balances: { stocks: 100 } },
      },
      metadata: { historicalStartYear: 2000 },
      effects: [
        historicalReturnEffect({
          id: "returns",
          data,
          mappings: [{ assetClass: "stocks", returnKey: "stocks" }],
        }),
      ],
    };

    const result = runSimulation(config);
    const firstYearEnd = result.snapshots.find((snapshot) => snapshot.month === "2026-12");
    const thirteenthMonth = result.snapshots.find((snapshot) => snapshot.month === "2027-01");

    expect(firstYearEnd?.totals["account:portfolio"]).toBeCloseTo(112, 1);
    expect(thirteenthMonth?.totals["account:portfolio"]).toBeLessThan(112);
  });

  it("updates inflation index from historical inflation", () => {
    const result = runSimulation({
      id: "inflation-test",
      name: "Inflation Test",
      startMonth: "2026-01",
      months: 12,
      initialAccounts: {
        cash: { id: "cash", name: "Cash", kind: "cash", balances: { cash: 1 } },
      },
      metadata: { historicalStartYear: 2000 },
      effects: [historicalInflationEffect({ id: "inflation", data })],
    });

    expect(result.finalState.inflationIndex).toBeCloseTo(1.024, 3);
  });

  it("runs every complete historical window and summarizes results", () => {
    const set = runHistoricalSimulations(
      {
        id: "set-test",
        name: "Set Test",
        startMonth: "2026-01",
        months: 12,
        initialAccounts: {
          portfolio: { id: "portfolio", name: "Portfolio", kind: "taxable", balances: { stocks: 100 } },
        },
        effects: [
          monthlyExpense({
            id: "expense",
            accountId: "portfolio",
            assetClass: "stocks",
            amount: 1,
          }),
          historicalReturnEffect({
            id: "returns",
            data,
            mappings: [{ assetClass: "stocks", returnKey: "stocks" }],
          }),
        ],
      },
      { data, portfolioAccountIds: ["portfolio"] },
    );

    expect(set.simulations.map((simulation) => simulation.startYear)).toEqual([2000, 2001]);
    expect(set.stats.count).toBe(2);
    expect(set.stats.successRate).toBe(1);
    expect(set.stats.endingPortfolioValue.max).toBeGreaterThan(set.stats.endingPortfolioValue.min);
  });
});
