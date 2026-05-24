import { runSimulation } from "./engine.js";
import { addToBalance, getBalance, netWorth, roundMoney } from "./money.js";
import type {
  AccountId,
  AssetClass,
  Effect,
  EventKind,
  SimulationConfig,
  SimulationEvent,
  SimulationResult,
  SimulationState,
} from "./types.js";

export type HistoricalReturnKey =
  | "stocks"
  | "smallCaps"
  | "cash"
  | "bonds"
  | "corporateBonds"
  | "realEstate"
  | "gold";

export interface HistoricalReturnRecord {
  year: number;
  stocks: number;
  smallCaps: number;
  cash: number;
  bonds: number;
  corporateBonds: number;
  realEstate: number;
  gold: number;
  inflation: number;
}

export interface HistoricalReturnMapping {
  accountIds?: AccountId[];
  assetClass: AssetClass;
  returnKey: HistoricalReturnKey;
}

export interface HistoricalReturnEffectOptions {
  id: string;
  description?: string;
  data: HistoricalReturnRecord[];
  mappings: HistoricalReturnMapping[];
}

export interface HistoricalInflationEffectOptions {
  id: string;
  data: HistoricalReturnRecord[];
}

export interface HistoricalSimulationSummary {
  simulationNumber: number;
  startYear: number;
  endYear: number;
  success: boolean;
  finalNetWorth: number;
  finalRealNetWorth: number;
  endingPortfolioValue: number;
  endingRealPortfolioValue: number;
  failure?: SimulationResult["failure"];
}

export interface HistoricalSimulationRun extends HistoricalSimulationSummary {
  result: SimulationResult;
}

export interface HistoricalSimulationSet {
  configId: string;
  name: string;
  simulations: HistoricalSimulationRun[];
  stats: HistoricalSimulationStats;
}

export interface HistoricalSimulationStats {
  count: number;
  successes: number;
  failures: number;
  successRate: number;
  finalNetWorth: DistributionStats;
  finalRealNetWorth: DistributionStats;
  endingPortfolioValue: DistributionStats;
  endingRealPortfolioValue: DistributionStats;
}

export interface DistributionStats {
  min: number;
  p10: number;
  median: number;
  average: number;
  p90: number;
  max: number;
}

export interface RunHistoricalSimulationsOptions {
  data: HistoricalReturnRecord[];
  portfolioAccountIds?: AccountId[];
  startYears?: number[];
}

export function historicalReturnEffect(options: HistoricalReturnEffectOptions): Effect {
  const recordsByYear = byYear(options.data);
  return {
    id: options.id,
    description: options.description,
    appliesTo: (state) => Boolean(getHistoricalRecord(state, recordsByYear)),
    apply: (state) => {
      const record = getHistoricalRecord(state, recordsByYear);
      if (!record) return { state, events: [] };

      let accounts = state.accounts;
      const events: SimulationEvent[] = [];

      for (const mapping of options.mappings) {
        const accountIds = mapping.accountIds ?? Object.keys(accounts);
        const annualRate = record[mapping.returnKey];
        const monthlyRate = annualToMonthlyRate(annualRate);

        for (const accountId of accountIds) {
          const balance = getBalance(accounts, accountId, mapping.assetClass);
          if (balance === 0) continue;

          const change = roundMoney(balance * monthlyRate);
          if (change === 0) continue;

          accounts = addToBalance(accounts, accountId, mapping.assetClass, change);
          events.push({
            month: state.month,
            effectId: options.id,
            kind: "return",
            accountId,
            assetClass: mapping.assetClass,
            amount: change,
            description: `${mapping.returnKey} historical return for ${record.year}`,
            metadata: {
              historicalYear: record.year,
              annualRate,
              monthlyRate,
              returnKey: mapping.returnKey,
            },
          });
        }
      }

      return { state: { ...state, accounts }, events };
    },
  };
}

export function historicalInflationEffect(options: HistoricalInflationEffectOptions): Effect {
  const recordsByYear = byYear(options.data);
  return {
    id: options.id,
    appliesTo: (state) => Boolean(getHistoricalRecord(state, recordsByYear)),
    apply: (state) => {
      const record = getHistoricalRecord(state, recordsByYear);
      if (!record) return { state, events: [] };

      const monthlyRate = annualToMonthlyRate(record.inflation);
      const inflationIndex = state.inflationIndex * (1 + monthlyRate);
      return {
        state: { ...state, inflationIndex },
        events: [
          {
            month: state.month,
            effectId: options.id,
            kind: "inflation",
            amount: monthlyRate,
            description: `Inflation update from ${record.year}`,
            metadata: {
              historicalYear: record.year,
              annualRate: record.inflation,
              monthlyRate,
            },
          },
        ],
      };
    },
  };
}

export function runHistoricalSimulations(
  config: SimulationConfig,
  options: RunHistoricalSimulationsOptions,
): HistoricalSimulationSet {
  const sorted = [...options.data].sort((a, b) => a.year - b.year);
  const firstYear = sorted[0]?.year;
  const lastYear = sorted.at(-1)?.year;
  if (firstYear === undefined || lastYear === undefined) {
    throw new Error("Historical return data is empty");
  }

  const yearsNeeded = Math.ceil(config.months / 12);
  const startYears =
    options.startYears ?? sorted.map((record) => record.year).filter((year) => year + yearsNeeded - 1 <= lastYear);

  const simulations = startYears.map((startYear, index) => {
    const result = runSimulation({
      ...config,
      metadata: {
        ...(config.metadata ?? {}),
        historicalStartYear: startYear,
      },
    });
    const summary = summarizeHistoricalResult(result, {
      simulationNumber: index + 1,
      startYear,
      endYear: startYear + yearsNeeded - 1,
      portfolioAccountIds: options.portfolioAccountIds,
    });

    return { ...summary, result };
  });

  return {
    configId: config.id,
    name: config.name,
    simulations,
    stats: summarizeHistoricalSet(simulations),
  };
}

export function annualToMonthlyRate(annualRate: number): number {
  if (annualRate <= -1) return -1;
  return (1 + annualRate) ** (1 / 12) - 1;
}

export function historicalYearForMonth(state: SimulationState): number | undefined {
  const startYear = state.metadata.historicalStartYear;
  if (typeof startYear !== "number") return undefined;
  return startYear + Math.floor(state.monthIndex / 12);
}

function summarizeHistoricalResult(
  result: SimulationResult,
  options: { simulationNumber: number; startYear: number; endYear: number; portfolioAccountIds?: AccountId[] },
): HistoricalSimulationSummary {
  const finalNetWorth = netWorth(result.finalState.accounts);
  const endingPortfolioValue = options.portfolioAccountIds
    ? options.portfolioAccountIds.reduce(
        (sum, accountId) =>
          sum +
          Object.values(result.finalState.accounts[accountId]?.balances ?? {}).reduce(
            (accountSum, value) => accountSum + value,
            0,
          ),
        0,
      )
    : finalNetWorth;
  const inflationIndex = result.finalState.inflationIndex || 1;

  return {
    simulationNumber: options.simulationNumber,
    startYear: options.startYear,
    endYear: options.endYear,
    success: !result.failed,
    finalNetWorth: roundMoney(finalNetWorth),
    finalRealNetWorth: roundMoney(finalNetWorth / inflationIndex),
    endingPortfolioValue: roundMoney(endingPortfolioValue),
    endingRealPortfolioValue: roundMoney(endingPortfolioValue / inflationIndex),
    failure: result.failure,
  };
}

function summarizeHistoricalSet(simulations: HistoricalSimulationRun[]): HistoricalSimulationStats {
  const successes = simulations.filter((simulation) => simulation.success).length;
  return {
    count: simulations.length,
    successes,
    failures: simulations.length - successes,
    successRate: simulations.length === 0 ? 0 : successes / simulations.length,
    finalNetWorth: distribution(simulations.map((simulation) => simulation.finalNetWorth)),
    finalRealNetWorth: distribution(simulations.map((simulation) => simulation.finalRealNetWorth)),
    endingPortfolioValue: distribution(simulations.map((simulation) => simulation.endingPortfolioValue)),
    endingRealPortfolioValue: distribution(simulations.map((simulation) => simulation.endingRealPortfolioValue)),
  };
}

function distribution(values: number[]): DistributionStats {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return { min: 0, p10: 0, median: 0, average: 0, p90: 0, max: 0 };

  return {
    min: sorted[0]!,
    p10: percentile(sorted, 0.1),
    median: percentile(sorted, 0.5),
    average: roundMoney(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
    p90: percentile(sorted, 0.9),
    max: sorted.at(-1)!,
  };
}

function percentile(sortedValues: number[], percentileValue: number): number {
  const index = Math.round((sortedValues.length - 1) * percentileValue);
  return sortedValues[index]!;
}

function byYear(data: HistoricalReturnRecord[]): Map<number, HistoricalReturnRecord> {
  return new Map(data.map((record) => [record.year, record]));
}

function getHistoricalRecord(
  state: SimulationState,
  recordsByYear: Map<number, HistoricalReturnRecord>,
): HistoricalReturnRecord | undefined {
  const year = historicalYearForMonth(state);
  return year === undefined ? undefined : recordsByYear.get(year);
}

export function eventTotal(events: SimulationEvent[], kind: EventKind): number {
  return roundMoney(
    events.filter((event) => event.kind === kind).reduce((sum, event) => sum + (event.amount ?? 0), 0),
  );
}
