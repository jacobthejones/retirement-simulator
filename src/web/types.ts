import type { RetirementPlanInputs, RetirementSearchResult } from "../retirementDate.js";

export interface ScenarioState {
  id: string;
  inputs: RetirementPlanInputs;
  result: RetirementSearchResult | null;
  error: string | null;
}

export type NumericField =
  | "birthYear"
  | "estimatedDeathAge"
  | "accessiblePortfolio"
  | "retirementPortfolio"
  | "monthlyIncome"
  | "monthlyExpenses"
  | "monthlyRetirementContribution"
  | "monthlyRetirementSpending"
  | "successTarget"
  | "retirementAccessAge"
  | "earlyWithdrawalPenalty";

export type NumberFormatKind = "money" | "percent" | "number" | "year" | "age";
