import { Plus, Trash2 } from "lucide-react";
import type { ReactElement } from "react";
import type {
  CashFlowModifier,
  CashFlowModifierKind,
  RetirementPlanInputs,
} from "../retirementDate.js";
import { TimingInput, UnitInput } from "./fields.js";
import { parseNumber } from "./format.js";

export function ModifierEditor(props: {
  inputs: RetirementPlanInputs;
  onChange: (inputs: RetirementPlanInputs) => void;
}): ReactElement {
  function updateModifier(id: string, updates: Partial<CashFlowModifier>): void {
    props.onChange({
      ...props.inputs,
      modifiers: props.inputs.modifiers.map((modifier) => (modifier.id === id ? { ...modifier, ...updates } : modifier)),
    });
  }

  function addModifier(): void {
    props.onChange({
      ...props.inputs,
      modifiers: [
        ...props.inputs.modifiers,
        {
          id: crypto.randomUUID(),
          name: "New change",
          kind: "monthlyExpense",
          amount: 100,
          start: "now",
          end: "atRetirement",
        },
      ],
    });
  }

  function removeModifier(id: string): void {
    props.onChange({ ...props.inputs, modifiers: props.inputs.modifiers.filter((modifier) => modifier.id !== id) });
  }

  return (
    <details className="modifiers" open={props.inputs.modifiers.length > 0}>
      <summary>Cash-flow changes</summary>
      <div className="modifier-list">
        {props.inputs.modifiers.map((modifier) => (
          <div className="modifier-row" key={modifier.id}>
            <input value={modifier.name} aria-label="Change name" onChange={(event) => updateModifier(modifier.id, { name: event.target.value })} />
            <select
              value={modifier.kind}
              aria-label="Change type"
              onChange={(event) => updateModifier(modifier.id, { kind: event.target.value as CashFlowModifierKind })}
            >
              <option value="monthlyExpense">Monthly expense</option>
              <option value="monthlyIncome">Monthly income</option>
              <option value="oneTimeExpense">One-time expense</option>
              <option value="oneTimeIncome">One-time income</option>
            </select>
            <UnitInput
              ariaLabel="Change amount"
              value={modifier.amount}
              kind="money"
              unit="$"
              onChange={(value) => updateModifier(modifier.id, { amount: parseNumber(value) })}
            />
            <TimingInput
              label={modifier.kind.startsWith("oneTime") ? "When" : "Start"}
              value={modifier.start}
              onChange={(value) => updateModifier(modifier.id, { start: value })}
            />
            {modifier.kind.startsWith("oneTime") ? null : (
              <TimingInput
                label="End"
                value={modifier.end ?? "atRetirement"}
                onChange={(value) => updateModifier(modifier.id, { end: value })}
              />
            )}
            <button className="icon-button icon-button-danger" title="Remove change" onClick={() => removeModifier(modifier.id)}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      <button className="button button-secondary" onClick={addModifier}>
        <Plus size={16} />
        Add change
      </button>
    </details>
  );
}
