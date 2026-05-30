import { Plus, Trash2 } from "lucide-react";
import type { ReactElement } from "react";
import {
  retirementAccessMonth,
  simulationEndMonth,
  type RetirementPlanInputs,
} from "../retirementDate.js";
import type { YearMonth } from "../types.js";
import { NumberField, TextField } from "./fields.js";
import { parseNumber } from "./format.js";
import { ModifierEditor } from "./ModifierEditor.js";
import { RecipeEditor } from "./RecipeEditor.js";
import type { NumericField, ScenarioState } from "./types.js";

const fieldHelp = {
  currentMonth: "The month the simulation starts. Use YYYY-MM format.",
  birthYear: "Your birth year. Birth month is not collected, so retirement-account access defaults conservatively.",
  nonRetirementPortfolio:
    "Money already invested or saved outside retirement accounts. This is the bucket your bank-account surplus goes into before retirement and the first bucket used for retirement spending.",
  retirementPortfolio:
    "Money already in retirement accounts. Automatic retirement savings are added directly here each month.",
  monthlyIncome:
    "Only the money that actually lands in your bank account each month. Enter the amount after taxes, retirement contributions, insurance premiums, HSA deductions, and anything else your employer withholds.",
  monthlyExpenses:
    "The amount that leaves your bank account each month for normal pre-retirement spending. Do not include automatic retirement contributions here.",
  monthlyRetirementSavings:
    "Monthly retirement-account additions that never pass through your bank account. Include your contributions and any employer match.",
  monthlyRetirementSpending:
    "Expected monthly spending after retirement in today's dollars. The simulator inflation-adjusts this internally.",
  estimatedDeathAge: "The age through which the scenario should be simulated.",
  retirementAccessAge:
    "The age when retirement-account money is assumed to be available without the early-access penalty. Defaults to 60 because only birth year is collected.",
  successTarget: "The percentage of historical market windows that must work for a retirement month to count as viable.",
  earlyAccessPenalty:
    "A simplified haircut applied when retirement-account funds are used before the configured access age. This is not tax advice.",
  allocation: "Target allocation used for both portfolio buckets. Values are percentages and are normalized if they do not add to exactly 100%.",
} as const;

export function ScenarioEditor(props: {
  scenarios: ScenarioState[];
  selectedScenario: ScenarioState;
  onSelect: (id: string) => void;
  onChange: (inputs: RetirementPlanInputs) => void;
  onDelete: () => void;
  onAddScenario: () => void;
}): ReactElement {
  const { inputs } = props.selectedScenario;

  function setInput(updates: Partial<RetirementPlanInputs>): void {
    props.onChange({ ...inputs, ...updates });
  }

  function setNumber(field: NumericField, value: string, scale = 1): void {
    setInput({ [field]: parseNumber(value) / scale } as Partial<RetirementPlanInputs>);
  }

  function setAllocation(field: keyof RetirementPlanInputs["allocation"], value: string): void {
    setInput({ allocation: { ...inputs.allocation, [field]: parseNumber(value) } });
  }

  return (
    <article className="panel scenario-editor">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Edit scenario</p>
          <select className="scenario-select" value={props.selectedScenario.id} onChange={(event) => props.onSelect(event.target.value)}>
            {props.scenarios.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.inputs.name}
              </option>
            ))}
          </select>
        </div>
        <div className="icon-actions">
          <button className="icon-button" title="Add scenario" onClick={props.onAddScenario}>
            <Plus size={17} />
          </button>
          {props.scenarios.length > 1 ? (
            <button className="icon-button icon-button-danger" title="Delete selected scenario" onClick={props.onDelete}>
              <Trash2 size={17} />
            </button>
          ) : null}
        </div>
      </div>

      <TextField
        label="Scenario name"
        value={inputs.name}
        unit="name"
        help="A short label for this set of assumptions. This name appears in the comparison table."
        onChange={(value) => setInput({ name: value })}
      />

      <div className="field-grid">
        <TextField
          label="Current month"
          value={inputs.startMonth}
          unit="YYYY-MM"
          help={fieldHelp.currentMonth}
          onChange={(value) => setInput({ startMonth: value as YearMonth })}
        />
        <NumberField label="Birth year" unit="year" value={inputs.birthYear} kind="year" help={fieldHelp.birthYear} onChange={(value) => setNumber("birthYear", value)} />
        <NumberField
          label="Non-retirement portfolio"
          unit="$"
          value={inputs.accessiblePortfolio}
          kind="money"
          help={fieldHelp.nonRetirementPortfolio}
          onChange={(value) => setNumber("accessiblePortfolio", value)}
        />
        <NumberField
          label="Retirement portfolio"
          unit="$"
          value={inputs.retirementPortfolio}
          kind="money"
          help={fieldHelp.retirementPortfolio}
          onChange={(value) => setNumber("retirementPortfolio", value)}
        />
        <NumberField
          label="Monthly bank-account income"
          unit="$ / month"
          value={inputs.monthlyIncome}
          kind="money"
          help={fieldHelp.monthlyIncome}
          onChange={(value) => setNumber("monthlyIncome", value)}
        />
        <NumberField
          label="Monthly expenses"
          unit="$ / month"
          value={inputs.monthlyExpenses}
          kind="money"
          help={fieldHelp.monthlyExpenses}
          onChange={(value) => setNumber("monthlyExpenses", value)}
        />
        <NumberField
          label="Monthly retirement savings"
          unit="$ / month"
          value={inputs.monthlyRetirementContribution}
          kind="money"
          help={fieldHelp.monthlyRetirementSavings}
          onChange={(value) => setNumber("monthlyRetirementContribution", value)}
        />
        <NumberField
          label="Monthly retirement spending"
          unit="$ / month"
          value={inputs.monthlyRetirementSpending}
          kind="money"
          help={fieldHelp.monthlyRetirementSpending}
          onChange={(value) => setNumber("monthlyRetirementSpending", value)}
        />
        <NumberField
          label="Estimated death age"
          unit="years old"
          value={inputs.estimatedDeathAge}
          kind="age"
          help={fieldHelp.estimatedDeathAge}
          onChange={(value) => setNumber("estimatedDeathAge", value)}
        />
        <NumberField
          label="Retirement access age"
          unit="years old"
          value={inputs.retirementAccessAge}
          kind="age"
          help={fieldHelp.retirementAccessAge}
          onChange={(value) => setNumber("retirementAccessAge", value)}
        />
        <NumberField
          label="Success target"
          unit="%"
          value={inputs.successTarget * 100}
          kind="percent"
          help={fieldHelp.successTarget}
          onChange={(value) => setNumber("successTarget", value, 100)}
        />
        <NumberField
          label="Early access penalty"
          unit="%"
          value={inputs.earlyWithdrawalPenalty * 100}
          kind="percent"
          help={fieldHelp.earlyAccessPenalty}
          disabled={!inputs.allowEarlyRetirementAccess}
          onChange={(value) => setNumber("earlyWithdrawalPenalty", value, 100)}
        />
      </div>

      <label className="check-row">
        <input
          type="checkbox"
          checked={inputs.allowEarlyRetirementAccess}
          onChange={(event) => setInput({ allowEarlyRetirementAccess: event.target.checked })}
        />
        <span>Allow retirement funds before access age using the penalty assumption.</span>
      </label>

      <div className="allocation-grid">
        <NumberField label="Stocks" unit="%" value={inputs.allocation.stocks} kind="percent" help={fieldHelp.allocation} onChange={(value) => setAllocation("stocks", value)} />
        <NumberField label="Bonds" unit="%" value={inputs.allocation.bonds} kind="percent" help={fieldHelp.allocation} onChange={(value) => setAllocation("bonds", value)} />
        <NumberField label="Cash" unit="%" value={inputs.allocation.cash} kind="percent" help={fieldHelp.allocation} onChange={(value) => setAllocation("cash", value)} />
      </div>

      <p className="scenario-footnote">
        Simulation runs through {simulationEndMonth(inputs)}. Retirement funds become available in {retirementAccessMonth(inputs)}.
      </p>

      <ModifierEditor inputs={inputs} onChange={props.onChange} />
      <RecipeEditor inputs={inputs} onChange={props.onChange} />

      {props.selectedScenario.error ? <p className="error-text">{props.selectedScenario.error}</p> : null}
    </article>
  );
}
