import { Info } from "lucide-react";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import type { CashFlowTiming } from "../retirementDate.js";
import type { YearMonth } from "../types.js";
import { formatInputNumber } from "./format.js";
import type { NumberFormatKind } from "./types.js";

export function TextField(props: {
  label: string;
  value: string;
  unit: string;
  help: string;
  onChange: (value: string) => void;
}): ReactElement {
  return (
    <label className="field">
      <FieldLabel label={props.label} unit={props.unit} help={props.help} />
      <input value={props.value} onChange={(event) => props.onChange(event.target.value)} />
    </label>
  );
}

export function NumberField(props: {
  label: string;
  unit: string;
  value: number;
  kind: NumberFormatKind;
  help: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}): ReactElement {
  return (
    <label className="field">
      <FieldLabel label={props.label} unit={props.unit} help={props.help} />
      <UnitInput
        ariaLabel={props.label}
        value={props.value}
        kind={props.kind}
        unit={props.unit}
        disabled={props.disabled}
        onChange={props.onChange}
      />
    </label>
  );
}

export function FieldLabel(props: { label: string; unit: string; help: string }): ReactElement {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleMouseDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open]);

  return (
    <span className="field-label" ref={ref}>
      <span>{props.label}</span>
      <button type="button" className="info-button" aria-label={`About ${props.label}`} onClick={() => setOpen((current) => !current)}>
        <Info size={14} />
      </button>
      {open ? <span className="field-help">{props.help}</span> : null}
    </span>
  );
}

export function UnitInput(props: {
  ariaLabel: string;
  value: number;
  kind: NumberFormatKind;
  unit: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}): ReactElement {
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const prefix = props.kind === "money" ? "$" : "";
  const suffix = props.kind === "percent" ? "%" : props.kind === "age" ? "yrs" : "";
  return (
    <span className={`unit-input ${props.disabled ? "unit-input-disabled" : ""}`}>
      {prefix ? <span className="unit-prefix">{prefix}</span> : null}
      <input
        aria-label={props.ariaLabel}
        inputMode="decimal"
        value={editingValue ?? formatInputNumber(props.value, props.kind)}
        disabled={props.disabled}
        onFocus={() => setEditingValue(formatInputNumber(props.value, props.kind))}
        onChange={(event) => {
          setEditingValue(event.target.value);
          props.onChange(event.target.value);
        }}
        onBlur={() => setEditingValue(null)}
      />
      {suffix ? <span className="unit-suffix" aria-hidden="true">{suffix}</span> : null}
    </span>
  );
}

export function TimingInput(props: {
  label: string;
  value: CashFlowTiming;
  onChange: (value: CashFlowTiming) => void;
}): ReactElement {
  const selectValue = props.value === "now" || props.value === "atRetirement" ? props.value : "date";

  function handleSelectChange(event: { target: { value: string } }): void {
    const val = event.target.value;
    if (val === "now" || val === "atRetirement") {
      props.onChange(val);
    } else {
      const now = new Date();
      const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}` as YearMonth;
      props.onChange(defaultMonth);
    }
  }

  return (
    <span className="timing-input">
      <select aria-label={props.label} value={selectValue} onChange={handleSelectChange}>
        <option value="now">Now</option>
        <option value="atRetirement">At retirement</option>
        <option value="date">Specific month</option>
      </select>
      {selectValue === "date" ? (
        <input
          type="month"
          aria-label={`${props.label} month`}
          value={props.value === "now" || props.value === "atRetirement" ? "" : props.value}
          onChange={(event) => props.onChange(event.target.value as YearMonth)}
        />
      ) : null}
    </span>
  );
}
