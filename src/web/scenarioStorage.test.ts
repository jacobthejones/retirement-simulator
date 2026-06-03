import { describe, expect, it } from "vitest";
import { defaultRetirementPlanInputs, findEarliestRetirementMonth } from "../retirementDate.js";
import { buildPersistedState, loadState, saveState, STORAGE_KEY } from "./scenarioStorage.js";
import type { ScenarioState } from "./types.js";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("scenario storage", () => {
  it("fills missing persisted input fields from defaults", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        selectedScenarioId: "scenario-2",
        scenarios: [
          {
            id: "scenario-2",
            inputs: {
              name: "Lean plan",
              allocation: { stocks: 100 },
            },
            result: null,
            error: null,
          },
        ],
      }),
    );

    const loaded = loadState(storage);

    expect(loaded).not.toBeNull();
    expect(loaded?.selectedScenarioId).toBe("scenario-2");
    expect(loaded?.scenarios[0]?.inputs).toEqual({
      ...defaultRetirementPlanInputs,
      name: "Lean plan",
      allocation: { stocks: 100, bonds: 15, cash: 5 },
      modifiers: [],
      recipeJson: "",
    });
  });

  it("returns null when persisted JSON is malformed", () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, "{not-json");

    expect(loadState(storage)).toBeNull();
  });

  it("strips historical windows before saving scenarios", () => {
    const storage = new MemoryStorage();
    const scenario: ScenarioState = {
      id: "scenario-1",
      inputs: defaultRetirementPlanInputs,
      result: findEarliestRetirementMonth(defaultRetirementPlanInputs),
      error: null,
    };

    saveState(storage, [scenario], "scenario-1");

    const saved = JSON.parse(storage.getItem(STORAGE_KEY) ?? "null") as ReturnType<typeof buildPersistedState>;
    expect(saved.scenarios[0]?.result?.historicalSet).toBeNull();
    expect(saved.scenarios[0]?.result?.retirementMonth).toBe(scenario.result?.retirementMonth);
  });
});
