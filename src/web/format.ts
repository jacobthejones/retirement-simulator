import type {
  CashFlowModifier,
  CashFlowModifierKind,
  CashFlowTiming,
  RetirementSearchResult,
} from "../retirementDate.js";
import type { YearMonth } from "../types.js";
import type { NumberFormatKind } from "./types.js";

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

export const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});

export function formatMoney(value: number): string {
  return moneyFormatter.format(value);
}

export function formatInputNumber(value: number, kind: NumberFormatKind): string {
  if (!Number.isFinite(value)) return "0";
  if (kind === "year") return String(Math.round(value));
  return numberFormatter.format(value);
}

export function parseNumber(value: string): number {
  const parsed = Number(value.replace(/[$,%\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatMonth(month: YearMonth): string {
  const [year, monthText] = month.split("-");
  const date = new Date(Number(year), Number(monthText) - 1, 1);
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(date);
}

export function formatResultMonth(result: RetirementSearchResult | null): string {
  if (!result) return "Not run";
  return result.retirementMonth ? formatMonth(result.retirementMonth) : "No viable month";
}

export function formatDifference(
  reference: RetirementSearchResult | null | undefined,
  result: RetirementSearchResult | null,
): string {
  if (!reference?.retirementMonth || !result?.retirementMonth) return "-";
  const difference = monthIndex(result.retirementMonth) - monthIndex(reference.retirementMonth);
  if (difference === 0) return "No change";
  return `${difference > 0 ? "+" : ""}${difference} month${Math.abs(difference) === 1 ? "" : "s"}`;
}

export function formatHistoricalSuccess(result: RetirementSearchResult | null): string {
  if (!result || result.totalWindows === 0) return "-";
  return `${result.successCount}/${result.totalWindows}`;
}

export function formatWorstWindow(result: RetirementSearchResult | null): string {
  if (!result?.worstWindow) return "-";
  return `${result.worstWindow.startYear}-${result.worstWindow.endYear}`;
}

export function formatModifiers(modifiers: CashFlowModifier[]): string {
  if (modifiers.length === 0) return "None";
  return modifiers
    .map((modifier) => {
      const amount = formatMoney(modifier.amount);
      const kind = formatModifierKind(modifier.kind);
      const timing = formatTimingRange(modifier);
      return `${modifier.name} (${kind}): ${amount} ${timing}`;
    })
    .join("; ");
}

function formatModifierKind(kind: CashFlowModifierKind): string {
  switch (kind) {
    case "monthlyExpense":
      return "monthly expense";
    case "monthlyIncome":
      return "monthly income";
    case "oneTimeExpense":
      return "one-time expense";
    case "oneTimeIncome":
      return "one-time income";
  }
}

function formatTimingRange(modifier: CashFlowModifier): string {
  if (modifier.kind.startsWith("oneTime")) {
    return `at ${formatTiming(modifier.start)}`;
  }
  return `from ${formatTiming(modifier.start)} to ${formatTiming(modifier.end ?? "atRetirement")}`;
}

function formatTiming(timing: CashFlowTiming): string {
  if (timing === "now") return "now";
  if (timing === "atRetirement") return "retirement";
  return formatMonth(timing);
}

export function monthIndex(month: YearMonth): number {
  const [year, monthText] = month.split("-");
  return Number(year) * 12 + Number(monthText);
}

export function timingSelectValue(value: string): CashFlowTiming {
  if (value === "now" || value === "atRetirement") return value;
  return "now";
}
