import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import {
  defaultRetirementPlanInputs,
  type RetirementPlanInputs,
  type RetirementSearchResult,
} from "../retirementDate.js";
import type { YearMonth } from "../types.js";
import { ComparisonTables } from "./ComparisonTables.js";
import { ScenarioEditor } from "./ScenarioEditor.js";
import type { ScenarioState } from "./types.js";
import type { WorkerResponse } from "./worker.js";

const STORAGE_KEY = "retirement-simulator-v1";

function loadState(): { scenarios: ScenarioState[]; selectedScenarioId: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as { scenarios: ScenarioState[]; selectedScenarioId: string };
    return {
      ...state,
      scenarios: state.scenarios.map((scenario) => ({
        ...scenario,
        inputs: {
          ...defaultRetirementPlanInputs,
          ...scenario.inputs,
          allocation: { ...defaultRetirementPlanInputs.allocation, ...scenario.inputs.allocation },
          modifiers: scenario.inputs.modifiers ?? [],
          recipeJson: scenario.inputs.recipeJson ?? "",
        },
      })),
    };
  } catch {
    return null;
  }
}

function saveState(scenarios: ScenarioState[], selectedScenarioId: string): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        selectedScenarioId,
        scenarios: scenarios.map((s) => ({
          ...s,
          result: s.result ? ({ ...s.result, historicalSet: null } satisfies RetirementSearchResult) : null,
        })),
      }),
    );
  } catch {
    // localStorage unavailable or full
  }
}

const defaultScenarios: ScenarioState[] = [
  { id: "scenario-1", inputs: { ...defaultRetirementPlanInputs, name: "Scenario 1" }, result: null, error: null },
];

export function App(): ReactElement {
  const [scenarios, setScenarios] = useState<ScenarioState[]>(() => loadState()?.scenarios ?? defaultScenarios);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(
    () => loadState()?.selectedScenarioId ?? "scenario-1",
  );
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [recalcProgress, setRecalcProgress] = useState<{
    scenarioDone: number;
    scenarioTotal: number;
    candidateMonth: YearMonth;
  } | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const selectedScenario = scenarios.find((s) => s.id === selectedScenarioId) ?? scenarios[0]!;

  useEffect(() => {
    saveState(scenarios, selectedScenarioId);
  }, [scenarios, selectedScenarioId]);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  function updateScenario(id: string, inputs: RetirementPlanInputs): void {
    setScenarios((current) =>
      current.map((s) => (s.id === id ? { ...s, inputs, result: null, error: null } : s)),
    );
  }

  function addScenario(): void {
    const id = crypto.randomUUID();
    const source = selectedScenario;
    setScenarios((current) => [
      ...current,
      {
        id,
        inputs: { ...source.inputs, name: `Scenario ${current.length + 1}`, modifiers: [...source.inputs.modifiers] },
        result: null,
        error: null,
      },
    ]);
    setSelectedScenarioId(id);
  }

  function deleteScenario(id: string): void {
    setScenarios((current) => {
      if (current.length === 1) return current;
      const next = current.filter((s) => s.id !== id);
      if (selectedScenarioId === id) setSelectedScenarioId(next[0]!.id);
      return next;
    });
  }

  function recalculateAll(): void {
    const dirty = scenarios.filter((s) => s.result === null);
    if (dirty.length === 0) return;

    workerRef.current?.terminate();
    setIsRecalculating(true);
    setRecalcProgress(null);

    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (msg.type === "result") {
        setScenarios((current) =>
          current.map((s) => (s.id === msg.scenarioId ? { ...s, result: msg.result, error: msg.error } : s)),
        );
      } else if (msg.type === "progress") {
        setRecalcProgress({ scenarioDone: msg.scenarioDone, scenarioTotal: msg.scenarioTotal, candidateMonth: msg.candidateMonth });
      } else if (msg.type === "scenarioDone") {
        setRecalcProgress(null);
      } else if (msg.type === "done") {
        setIsRecalculating(false);
        setRecalcProgress(null);
        worker.terminate();
      }
    };

    worker.onerror = () => {
      setIsRecalculating(false);
      setRecalcProgress(null);
      worker.terminate();
    };

    worker.postMessage({ type: "run", scenarios: dirty.map((s) => ({ id: s.id, inputs: s.inputs })) });
  }

  return (
    <main className="app-shell">
      <Analytics />
      <header className="app-header">
        <div>
          <p className="eyebrow">Retirement date simulator</p>
          <h1>Find how a change moves your retirement date.</h1>
        </div>
      </header>

      <section className="workspace">
        <section className="setup-column">
          <ScenarioEditor
            scenarios={scenarios}
            selectedScenario={selectedScenario}
            onSelect={setSelectedScenarioId}
            onChange={(inputs) => updateScenario(selectedScenario.id, inputs)}
            onDelete={() => deleteScenario(selectedScenario.id)}
            onAddScenario={addScenario}
          />
        </section>

        <section className="results-column">
          {isRecalculating ? (
            <div className="loading-bar" aria-live="polite">
              {recalcProgress
                ? `Scenario ${recalcProgress.scenarioDone + 1} of ${recalcProgress.scenarioTotal} — testing ${recalcProgress.candidateMonth}`
                : "Starting..."}
            </div>
          ) : null}
          <ComparisonTables scenarios={scenarios} onRunAll={recalculateAll} isRecalculating={isRecalculating} />
        </section>
      </section>
    </main>
  );
}
