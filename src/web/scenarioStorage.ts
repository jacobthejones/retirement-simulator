import { defaultRetirementPlanInputs, type RetirementPlanInputs, type RetirementSearchResult } from "../retirementDate.js";
import type { ScenarioState } from "./types.js";

export const STORAGE_KEY = "retirement-simulator-v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface StoredScenarioState {
  scenarios: ScenarioState[];
  selectedScenarioId: string;
}

interface PersistedScenarioState {
  scenarios: Array<{
    id: string;
    inputs: Partial<RetirementPlanInputs>;
    result: RetirementSearchResult | null;
    error: string | null;
  }>;
  selectedScenarioId: string;
}

export function loadState(storage: StorageLike): StoredScenarioState | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeStoredState(JSON.parse(raw) as PersistedScenarioState);
  } catch {
    return null;
  }
}

export function saveState(storage: StorageLike, scenarios: ScenarioState[], selectedScenarioId: string): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(buildPersistedState(scenarios, selectedScenarioId)));
  } catch {
    // localStorage unavailable or full
  }
}

export function normalizeStoredState(state: PersistedScenarioState): StoredScenarioState {
  if (!Array.isArray(state.scenarios) || typeof state.selectedScenarioId !== "string") {
    throw new Error("Stored scenario state is invalid.");
  }

  return {
    selectedScenarioId: state.selectedScenarioId,
    scenarios: state.scenarios.map((scenario) => normalizeScenarioState(scenario)),
  };
}

export function buildPersistedState(
  scenarios: ScenarioState[],
  selectedScenarioId: string,
): PersistedScenarioState {
  return {
    selectedScenarioId,
    scenarios: scenarios.map((scenario) => ({
      ...scenario,
      result: stripHistoricalSet(scenario.result),
    })),
  };
}

function normalizeScenarioState(
  scenario: PersistedScenarioState["scenarios"][number],
): ScenarioState {
  return {
    ...scenario,
    inputs: normalizeScenarioInputs(scenario.inputs),
  };
}

function normalizeScenarioInputs(inputs: Partial<RetirementPlanInputs>): RetirementPlanInputs {
  return {
    ...defaultRetirementPlanInputs,
    ...inputs,
    allocation: {
      ...defaultRetirementPlanInputs.allocation,
      ...inputs.allocation,
    },
    modifiers: inputs.modifiers ?? [],
    recipeJson: inputs.recipeJson ?? "",
  };
}

function stripHistoricalSet(result: RetirementSearchResult | null): RetirementSearchResult | null {
  return result ? ({ ...result, historicalSet: null } satisfies RetirementSearchResult) : null;
}
