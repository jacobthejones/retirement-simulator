import { findEarliestRetirementMonth, type RetirementPlanInputs, type RetirementSearchResult } from "../retirementDate.js";
import type { YearMonth } from "../types.js";

export type WorkerRequest = {
  type: "run";
  scenarios: Array<{ id: string; inputs: RetirementPlanInputs }>;
};

export type WorkerResponse =
  | { type: "result"; scenarioId: string; result: RetirementSearchResult | null; error: string | null }
  | { type: "progress"; scenarioDone: number; scenarioTotal: number; candidateMonth: YearMonth }
  | { type: "scenarioDone"; scenarioDone: number; scenarioTotal: number }
  | { type: "done" };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { scenarios } = event.data;
  const scenarioTotal = scenarios.length;

  for (let si = 0; si < scenarios.length; si++) {
    const scenario = scenarios[si]!;
    let result: RetirementSearchResult | null = null;
    let error: string | null = null;

    const onProgress = (candidateMonth: YearMonth) => {
      self.postMessage({
        type: "progress",
        scenarioDone: si,
        scenarioTotal,
        candidateMonth,
      } satisfies WorkerResponse);
    };

    try {
      result = findEarliestRetirementMonth(scenario.inputs, onProgress);
    } catch (err) {
      error = err instanceof Error ? err.message : "Could not run scenario.";
    }

    self.postMessage({ type: "result", scenarioId: scenario.id, result, error } satisfies WorkerResponse);
    self.postMessage({ type: "scenarioDone", scenarioDone: si + 1, scenarioTotal } satisfies WorkerResponse);
  }

  self.postMessage({ type: "done" } satisfies WorkerResponse);
};
