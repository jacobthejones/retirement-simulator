import { addMonths } from "./dates.js";
import { cloneAccounts, netWorth, totalByAccount, totalByAssetClass } from "./money.js";
import type {
  Check,
  Effect,
  MonthSnapshot,
  SimulationConfig,
  SimulationEvent,
  SimulationResult,
  SimulationState,
} from "./types.js";

export function runSimulation(config: SimulationConfig): SimulationResult {
  let state: SimulationState = {
    month: config.startMonth,
    monthIndex: 0,
    accounts: cloneAccounts(config.initialAccounts),
    inflationIndex: config.inflationIndex ?? 1,
    metadata: { ...(config.metadata ?? {}) },
  };

  const events: SimulationEvent[] = [];
  const snapshots: MonthSnapshot[] = [snapshotState(state)];
  let failure: SimulationResult["failure"] | undefined;

  for (let monthIndex = 0; monthIndex < config.months; monthIndex += 1) {
    state = { ...state, monthIndex, month: addMonths(config.startMonth, monthIndex) };

    for (const effect of config.effects) {
      if (!effect.appliesTo(state)) continue;

      const result = effect.apply(state);
      state = result.state;
      events.push(...result.events);
    }

    for (const check of config.checks ?? []) {
      if (!check.appliesTo(state)) continue;

      const result = check.evaluate(state);
      state = result.state;
      events.push(...result.events);

      if (result.failed) {
        failure = {
          month: state.month,
          checkId: check.id,
          message: result.message ?? `Check failed: ${check.id}`,
        };
        snapshots.push(snapshotState(state));
        return {
          configId: config.id,
          name: config.name,
          completed: false,
          failed: true,
          failure,
          finalState: state,
          snapshots,
          events,
        };
      }
    }

    snapshots.push(snapshotState(state));
  }

  return {
    configId: config.id,
    name: config.name,
    completed: true,
    failed: false,
    finalState: state,
    snapshots,
    events,
  };
}

export function snapshotState(state: SimulationState): MonthSnapshot {
  return {
    month: state.month,
    monthIndex: state.monthIndex,
    accounts: cloneAccounts(state.accounts),
    inflationIndex: state.inflationIndex,
    totals: {
      netWorth: netWorth(state.accounts),
      ...prefixRecord("account:", totalByAccount(state.accounts)),
      ...prefixRecord("asset:", totalByAssetClass(state.accounts)),
    },
  };
}

export function effectAlways(): boolean {
  return true;
}

export function composeEffects(...effects: Effect[]): Effect[] {
  return effects;
}

function prefixRecord(prefix: string, values: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [`${prefix}${key}`, value]));
}
