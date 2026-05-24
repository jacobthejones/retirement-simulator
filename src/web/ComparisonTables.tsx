import { RefreshCw } from "lucide-react";
import type { ReactElement } from "react";
import { monthlySavings, retirementAccessMonth } from "../retirementDate.js";
import {
  formatDifference,
  formatHistoricalSuccess,
  formatModifiers,
  formatMoney,
  formatResultMonth,
  formatWorstWindow,
  percentFormatter,
} from "./format.js";
import type { ScenarioState } from "./types.js";

export function ComparisonTables(props: {
  scenarios: ScenarioState[];
  onRunAll: () => void;
  isRecalculating: boolean;
}): ReactElement {
  const firstScenario = props.scenarios[0];
  return (
    <section className="panel comparison-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Comparison</p>
          <h2>Scenario comparison</h2>
        </div>
        <div className="comparison-heading-actions">
          <span className="muted">{props.scenarios.length} scenario{props.scenarios.length === 1 ? "" : "s"}</span>
          <button className="button" onClick={props.onRunAll} disabled={props.isRecalculating}>
            <RefreshCw className={props.isRecalculating ? "spin" : ""} size={17} />
            {props.isRecalculating ? "Recalculating..." : "Recalculate"}
          </button>
        </div>
      </div>

      <ComparisonTable
        title="Scenario parameters"
        scenarios={props.scenarios}
        rows={[
          row("Current month", (scenario) => scenario.inputs.startMonth),
          row("Non-retirement portfolio", (scenario) => formatMoney(scenario.inputs.accessiblePortfolio)),
          row("Retirement portfolio", (scenario) => formatMoney(scenario.inputs.retirementPortfolio)),
          row("Monthly bank-account income", (scenario) => formatMoney(scenario.inputs.monthlyIncome)),
          row("Monthly expenses", (scenario) => formatMoney(scenario.inputs.monthlyExpenses)),
          row("Monthly retirement savings", (scenario) => formatMoney(scenario.inputs.monthlyRetirementContribution)),
          row("Monthly retirement spending", (scenario) => formatMoney(scenario.inputs.monthlyRetirementSpending)),
          row("Monthly non-retirement savings", (scenario) => formatMoney(monthlySavings(scenario.inputs))),
          row("Success target", (scenario) => percentFormatter.format(scenario.inputs.successTarget)),
          row("Birth year", (scenario) => String(scenario.inputs.birthYear)),
          row("Estimated death age", (scenario) => String(scenario.inputs.estimatedDeathAge)),
          row("Retirement access", (scenario) => `Age ${scenario.inputs.retirementAccessAge}, ${retirementAccessMonth(scenario.inputs)}`),
          row("Early access", (scenario) =>
            scenario.inputs.allowEarlyRetirementAccess
              ? `Yes, ${percentFormatter.format(scenario.inputs.earlyWithdrawalPenalty)} penalty`
              : "No",
          ),
          row("Allocation", (scenario) => `${scenario.inputs.allocation.stocks}% / ${scenario.inputs.allocation.bonds}% / ${scenario.inputs.allocation.cash}%`),
          row("Changes", (scenario) => formatModifiers(scenario.inputs.modifiers)),
        ]}
        reference={firstScenario}
      />

      <ComparisonTable
        title="Search results"
        scenarios={props.scenarios}
        rows={[
          row("Earliest viable retirement month", (scenario) => formatResultMonth(scenario.result)),
          row("Difference from first scenario", (scenario) => formatDifference(firstScenario?.result, scenario.result)),
          row("Historical success", (scenario) => formatHistoricalSuccess(scenario.result)),
          row("Worst historical window", (scenario) => formatWorstWindow(scenario.result)),
          row("Median ending real portfolio", (scenario) =>
            scenario.result?.medianEndingRealPortfolio === null || scenario.result?.medianEndingRealPortfolio === undefined
              ? "-"
              : formatMoney(scenario.result.medianEndingRealPortfolio),
          ),
        ]}
        reference={firstScenario}
      />

      <p className="assumption-note">
        This simulator uses simplified assumptions and historical market data to estimate outcomes. It is a tool to help you reason about retirement decisions, not financial, tax, or legal advice. Money values are shown in today's dollars unless labeled otherwise.
      </p>
    </section>
  );
}

function ComparisonTable(props: {
  title: string;
  scenarios: ScenarioState[];
  rows: Array<{ label: string; value: (scenario: ScenarioState) => string }>;
  reference?: ScenarioState;
}): ReactElement {
  return (
    <div className="table-section">
      <h3>{props.title}</h3>
      <div className="comparison-scroll">
        <table className="comparison-table">
          <thead>
            <tr>
              <th>Field</th>
              {props.scenarios.map((scenario) => (
                <th key={scenario.id}>{scenario.inputs.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.rows.map((item) => {
              const referenceValue = props.reference ? item.value(props.reference) : "";
              return (
                <tr key={item.label}>
                  <td>{item.label}</td>
                  {props.scenarios.map((scenario, index) => {
                    const value = item.value(scenario);
                    const changed = index > 0 && value !== referenceValue;
                    return (
                      <td key={scenario.id} className={changed ? "changed-cell" : ""}>
                        {value}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function row(label: string, value: (scenario: ScenarioState) => string): { label: string; value: (scenario: ScenarioState) => string } {
  return { label, value };
}
