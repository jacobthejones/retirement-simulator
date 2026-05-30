import { minimumBalanceCheck } from "./checks.js";
import { DAMODARAN_RETURNS } from "./data/damodaran-returns.js";
import { addMonths, compareYearMonth, formatYearMonth, parseYearMonth } from "./dates.js";
import { rebalanceAccount } from "./effects.js";
import { runSimulation } from "./engine.js";
import { historicalInflationEffect, historicalReturnEffect, runHistoricalSimulations, type HistoricalSimulationRun, type HistoricalSimulationSet } from "./historical.js";
import { addToBalance, getBalance, roundMoney, setBalance, transferBalance } from "./money.js";
import type { Account, AccountId, AccountKind, Accounts, AssetClass, Effect, EventKind, SimulationConfig, SimulationEvent, SimulationState, YearMonth } from "./types.js";

export type ScenarioId = string;

export interface RetirementPlanInputs {
  name: string;
  startMonth: YearMonth;
  birthYear: number;
  estimatedDeathAge: number;
  accessiblePortfolio: number;
  retirementPortfolio: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyRetirementContribution: number;
  monthlyRetirementSpending: number;
  allocation: AssetAllocation;
  successTarget: number;
  retirementAccessAge: number;
  allowEarlyRetirementAccess: boolean;
  earlyWithdrawalPenalty: number;
  modifiers: CashFlowModifier[];
  recipeJson: string;
}

export interface AssetAllocation {
  stocks: number;
  bonds: number;
  cash: number;
}

export type CashFlowModifierKind =
  | "monthlyExpense"
  | "monthlyIncome"
  | "oneTimeExpense"
  | "oneTimeIncome";

export type CashFlowTiming = "now" | "atRetirement" | YearMonth;

export interface CashFlowModifier {
  id: string;
  name: string;
  kind: CashFlowModifierKind;
  amount: number;
  start: CashFlowTiming;
  end?: CashFlowTiming;
}

export type RecipeComparisonOperator = "<" | "<=" | ">" | ">=" | "==" | "!=";

export interface ScenarioRecipe {
  version?: 1;
  accounts?: RecipeAccount[];
  rules: RecipeRule[];
}

export interface RecipeAccount {
  id: string;
  name: string;
  kind: AccountKind;
  balances: Record<AssetClass, number>;
  metadata?: Record<string, unknown>;
}

export interface RecipeRule {
  id: string;
  description?: string;
  when?: RecipeCondition | RecipeCondition[];
  actions: RecipeAction[];
}

export type RecipeCondition =
  | {
      source: "accountTotal";
      accountId: string;
      operator: RecipeComparisonOperator;
      value: number;
    }
  | {
      source: "accountBalance";
      accountId: string;
      assetClass: AssetClass;
      operator: RecipeComparisonOperator;
      value: number;
    }
  | {
      source: "portfolioTotal";
      accountIds?: string[];
      operator: RecipeComparisonOperator;
      value: number;
    }
  | {
      source: "monthIndex";
      operator: RecipeComparisonOperator;
      value: number;
    }
  | {
      source: "month";
      operator: RecipeComparisonOperator;
      value: YearMonth;
    }
  | {
      source: "retired";
      equals: boolean;
    };

export type RecipeAmountPeriod = "monthly" | "annual";
const RECIPE_EVENT_KINDS = new Set<EventKind>([
  "income",
  "expense",
  "transfer",
  "return",
  "inflation",
  "purchase",
  "sale",
  "debt-payment",
  "check",
  "failure",
  "note",
]);

export type RecipeAction =
  | {
      type: "setRetirementSpending";
      amount: number;
      period?: RecipeAmountPeriod;
    }
  | {
      type: "addAmount";
      accountId: AccountId;
      assetClass?: AssetClass;
      amount: number;
      period?: RecipeAmountPeriod;
      inflationAdjusted?: boolean;
      kind?: EventKind;
      description?: string;
    }
  | {
      type: "transfer";
      fromAccountId: AccountId;
      fromAssetClass?: AssetClass;
      toAccountId: AccountId;
      toAssetClass?: AssetClass;
      amount: number;
      period?: RecipeAmountPeriod;
      inflationAdjusted?: boolean;
      limitToAvailable?: boolean;
      kind?: EventKind;
      description?: string;
    };

export interface RetirementSearchResult {
  inputs: RetirementPlanInputs;
  retirementMonth: YearMonth | null;
  historicalSet: HistoricalSimulationSet | null;
  successRate: number;
  successCount: number;
  totalWindows: number;
  worstWindow: HistoricalWindowSummary | null;
  medianEndingRealPortfolio: number | null;
}

export interface HistoricalWindowSummary {
  startYear: number;
  endYear: number;
  endingRealPortfolioValue: number;
  success: boolean;
  failureMonth: YearMonth | null;
}

const NON_RETIREMENT_ACCOUNT_ID = "nonRetirementPortfolio";
const RETIREMENT_ACCOUNT_ID = "retirementPortfolio";
const ASSET_CLASSES = ["cash", "bonds", "stocks"] as const satisfies readonly AssetClass[];

export const defaultRetirementPlanInputs: RetirementPlanInputs = {
  name: "Base plan",
  startMonth: currentYearMonth(),
  birthYear: 1995,
  estimatedDeathAge: 90,
  accessiblePortfolio: 100_000,
  retirementPortfolio: 300_000,
  monthlyIncome: 8_000,
  monthlyExpenses: 5_000,
  monthlyRetirementContribution: 2_000,
  monthlyRetirementSpending: 6_000,
  allocation: { stocks: 80, bonds: 15, cash: 5 },
  successTarget: 1,
  retirementAccessAge: 60,
  allowEarlyRetirementAccess: true,
  earlyWithdrawalPenalty: 0.2,
  modifiers: [],
  recipeJson: "",
};

export function findEarliestRetirementMonth(
  inputs: RetirementPlanInputs,
  onProgress?: (candidate: YearMonth) => void,
): RetirementSearchResult {
  validateInputs(inputs);

  const endMonth = simulationEndMonth(inputs);
  const finalCandidate = addMonths(endMonth, -1);
  let candidate = inputs.startMonth;

  while (compareYearMonth(candidate, finalCandidate) <= 0) {
    onProgress?.(candidate);
    const config = buildRetirementDateConfig(inputs, candidate);
    if (candidateMeetsTarget(config, inputs.successTarget)) {
      const historicalSet = runHistoricalSimulations(config, {
        data: DAMODARAN_RETURNS,
        portfolioAccountIds: [NON_RETIREMENT_ACCOUNT_ID, RETIREMENT_ACCOUNT_ID],
      });
      return summarizeSearchResult(inputs, candidate, historicalSet);
    }
    candidate = addMonths(candidate, 1);
  }

  return summarizeSearchResult(inputs, null, null);
}

function candidateMeetsTarget(config: SimulationConfig, successTarget: number): boolean {
  const startYears = historicalStartYears(config.months);
  if (startYears.length === 0) return false;

  let successes = 0;
  for (let index = 0; index < startYears.length; index += 1) {
    const result = runSimulation({
      ...config,
      metadata: { ...(config.metadata ?? {}), historicalStartYear: startYears[index] },
    });
    if (!result.failed) successes += 1;

    const tested = index + 1;
    const remaining = startYears.length - tested;
    const bestPossibleRate = (successes + remaining) / startYears.length;
    if (bestPossibleRate < successTarget) return false;
  }

  return successes / startYears.length >= successTarget;
}

function historicalStartYears(months: number): number[] {
  const sorted = [...DAMODARAN_RETURNS].sort((a, b) => a.year - b.year);
  const lastYear = sorted.at(-1)?.year;
  if (lastYear === undefined) return [];
  const yearsNeeded = Math.ceil(months / 12);
  return sorted.map((record) => record.year).filter((year) => year + yearsNeeded - 1 <= lastYear);
}

export function buildRetirementDateConfig(inputs: RetirementPlanInputs, retirementMonth: YearMonth): SimulationConfig {
  validateInputs(inputs);
  const recipe = parseScenarioRecipe(inputs.recipeJson);

  const normalizedAllocation = normalizeAllocation(inputs.allocation);
  const endMonth = simulationEndMonth(inputs);
  const months = Math.max(1, monthsBetween(inputs.startMonth, endMonth) + 1);
  const retirementStart = retirementMonth;
  const preRetirementEnd = addMonths(retirementStart, -1);

  const effects: Effect[] = [
    scheduledAmountEffect({
      id: "pre-retirement-income",
      description: "Monthly bank-account income before retirement",
      accountId: NON_RETIREMENT_ACCOUNT_ID,
      amount: (state) => inputs.monthlyIncome * state.inflationIndex,
      kind: "income",
      start: inputs.startMonth,
      end: preRetirementEnd,
    }),
    scheduledAmountEffect({
      id: "pre-retirement-expenses",
      description: "Monthly expenses before retirement",
      accountId: NON_RETIREMENT_ACCOUNT_ID,
      amount: (state) => -inputs.monthlyExpenses * state.inflationIndex,
      kind: "expense",
      start: inputs.startMonth,
      end: preRetirementEnd,
    }),
    retirementContributionEffect(inputs, preRetirementEnd),
    ...modifierEffects(inputs, retirementStart, preRetirementEnd),
    recipeEffect(recipe, retirementStart),
    retirementWithdrawalEffect(inputs, retirementStart, recipe),
    rebalanceAccount({
      id: "rebalance-non-retirement",
      description: "Rebalance non-retirement portfolio to target allocation",
      accountId: NON_RETIREMENT_ACCOUNT_ID,
      targets: normalizedAllocation,
    }),
    rebalanceAccount({
      id: "rebalance-retirement",
      description: "Rebalance retirement portfolio to target allocation",
      accountId: RETIREMENT_ACCOUNT_ID,
      targets: normalizedAllocation,
    }),
    historicalReturnEffect({
      id: "historical-returns",
      description: "Historical market returns",
      data: DAMODARAN_RETURNS,
      mappings: [
        { assetClass: "stocks", returnKey: "stocks" },
        { assetClass: "bonds", returnKey: "bonds" },
        { assetClass: "cash", returnKey: "cash" },
      ],
    }),
    historicalInflationEffect({ id: "historical-inflation", data: DAMODARAN_RETURNS }),
  ];

  return {
    id: `retirement-date-${slug(inputs.name)}-${retirementMonth}`,
    name: `${inputs.name}: retire ${retirementMonth}`,
    startMonth: inputs.startMonth,
    months,
    inflationIndex: 1,
    initialAccounts: {
      [NON_RETIREMENT_ACCOUNT_ID]: allocatedAccount({
        id: NON_RETIREMENT_ACCOUNT_ID,
        name: "Non-retirement portfolio",
        kind: "taxable",
        total: inputs.accessiblePortfolio,
        allocation: normalizedAllocation,
      }),
      [RETIREMENT_ACCOUNT_ID]: allocatedAccount({
        id: RETIREMENT_ACCOUNT_ID,
        name: "Retirement portfolio",
        kind: "traditional-retirement",
        total: inputs.retirementPortfolio,
        allocation: normalizedAllocation,
      }),
      ...recipeAccounts(recipe),
    },
    effects,
    checks: [
      minimumBalanceCheck({
        id: "non-retirement-portfolio-nonnegative",
        accountId: NON_RETIREMENT_ACCOUNT_ID,
        minimum: 0,
        action: { type: "fail", message: "Non-retirement portfolio went below zero." },
      }),
      minimumBalanceCheck({
        id: "retirement-portfolio-nonnegative",
        accountId: RETIREMENT_ACCOUNT_ID,
        minimum: 0,
        action: { type: "fail", message: "Retirement portfolio was exhausted." },
      }),
    ],
    metadata: {
      v1RetirementDate: true,
      retirementMonth,
      simulationEndMonth: endMonth,
      retirementAccessMonth: retirementAccessMonth(inputs),
      displayedMoney: "today-dollars",
    },
  };
}

export function monthlySavings(inputs: RetirementPlanInputs): number {
  const modifierTotal = inputs.modifiers
    .reduce((sum, modifier) => {
      if (modifier.kind === "monthlyExpense" && modifier.start === "now" && modifier.end !== "atRetirement") return sum - modifier.amount;
      if (modifier.kind === "monthlyIncome" && modifier.start === "now" && modifier.end !== "atRetirement") return sum + modifier.amount;
      return sum;
    }, 0);
  return roundMoney(inputs.monthlyIncome - inputs.monthlyExpenses + modifierTotal);
}

export function parseScenarioRecipe(recipeJson: string): ScenarioRecipe | null {
  const trimmed = recipeJson.trim();
  if (!trimmed) return null;

  const parsed: unknown = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object") throw new Error("Recipe must be a JSON object.");

  const recipe = parsed as Partial<ScenarioRecipe>;
  if (recipe.version !== undefined && recipe.version !== 1) {
    throw new Error("Recipe version must be 1.");
  }
  if (!Array.isArray(recipe.rules)) throw new Error("Recipe must include a rules array.");
  if (recipe.accounts !== undefined && !Array.isArray(recipe.accounts)) {
    throw new Error("Recipe accounts must be an array.");
  }

  const accountIds = new Set<string>([NON_RETIREMENT_ACCOUNT_ID, RETIREMENT_ACCOUNT_ID]);
  for (const account of recipe.accounts ?? []) {
    validateRecipeAccount(account);
    if (accountIds.has(account.id)) throw new Error(`Recipe account id is already in use: ${account.id}`);
    accountIds.add(account.id);
  }

  recipe.rules.forEach((rule, index) => {
    validateRecipeRule(rule, index, accountIds);
  });

  return { version: 1, accounts: recipe.accounts, rules: recipe.rules };
}

export function retirementSpendingForState(
  inputs: RetirementPlanInputs,
  state: SimulationState,
  retirementStart: YearMonth,
  recipe: ScenarioRecipe | null = parseScenarioRecipe(inputs.recipeJson),
): { monthlyAmount: number; ruleIds: string[] } {
  let monthlyAmount = inputs.monthlyRetirementSpending;
  const ruleIds: string[] = [];

  for (const rule of recipe?.rules ?? []) {
    if (!recipeRuleMatches(rule, state, retirementStart)) continue;

    for (const action of rule.actions) {
      if (action.type !== "setRetirementSpending") continue;
      monthlyAmount = action.period === "annual" ? action.amount / 12 : action.amount;
      ruleIds.push(rule.id);
    }
  }

  return { monthlyAmount, ruleIds };
}

export function simulationEndMonth(inputs: Pick<RetirementPlanInputs, "birthYear" | "estimatedDeathAge">): YearMonth {
  return formatYearMonth(inputs.birthYear + inputs.estimatedDeathAge, 12);
}

export function retirementAccessMonth(inputs: Pick<RetirementPlanInputs, "birthYear" | "retirementAccessAge">): YearMonth {
  return formatYearMonth(inputs.birthYear + Math.ceil(inputs.retirementAccessAge) + 1, 1);
}

export function monthsBetween(start: YearMonth, end: YearMonth): number {
  const left = parseYearMonth(start);
  const right = parseYearMonth(end);
  return right.year * 12 + right.month - (left.year * 12 + left.month);
}

export function summarizeSearchResult(
  inputs: RetirementPlanInputs,
  retirementMonth: YearMonth | null,
  historicalSet: HistoricalSimulationSet | null,
): RetirementSearchResult {
  if (!historicalSet) {
    return {
      inputs,
      retirementMonth,
      historicalSet,
      successRate: 0,
      successCount: 0,
      totalWindows: 0,
      worstWindow: null,
      medianEndingRealPortfolio: null,
    };
  }

  const windows = historicalSet.simulations.map(summarizeWindow);
  const sortedByEnding = [...windows].sort((a, b) => a.endingRealPortfolioValue - b.endingRealPortfolioValue);
  const worstWindow =
    [...windows].sort((a, b) => {
      if (a.success !== b.success) return a.success ? 1 : -1;
      return a.endingRealPortfolioValue - b.endingRealPortfolioValue;
    })[0] ?? null;

  return {
    inputs,
    retirementMonth,
    historicalSet,
    successRate: historicalSet.stats.successRate,
    successCount: historicalSet.stats.successes,
    totalWindows: historicalSet.stats.count,
    worstWindow,
    medianEndingRealPortfolio: sortedByEnding[Math.round((sortedByEnding.length - 1) * 0.5)]?.endingRealPortfolioValue ?? null,
  };
}

function retirementContributionEffect(inputs: RetirementPlanInputs, end: YearMonth): Effect {
  return {
    id: "retirement-contributions",
    description: "Monthly automatic retirement savings before retirement",
    appliesTo: (state) => compareYearMonth(state.month, inputs.startMonth) >= 0 && compareYearMonth(state.month, end) <= 0,
    apply: (state) => {
      const amount = roundMoney(inputs.monthlyRetirementContribution * state.inflationIndex);
      const accounts = addToBalance(state.accounts, RETIREMENT_ACCOUNT_ID, "cash", amount);

      return {
        state: { ...state, accounts },
        events: [
          {
            month: state.month,
            effectId: "retirement-contributions",
            kind: "income",
            accountId: RETIREMENT_ACCOUNT_ID,
            assetClass: "cash",
            amount,
            description: "Added monthly retirement savings directly to retirement portfolio.",
          },
        ],
      };
    },
  };
}

function modifierEffects(inputs: RetirementPlanInputs, retirementStart: YearMonth, preRetirementEnd: YearMonth): Effect[] {
  return inputs.modifiers.map((modifier) => {
      if (modifier.kind === "monthlyExpense" || modifier.kind === "monthlyIncome") {
        const start = resolveTiming(modifier.start, inputs.startMonth, retirementStart);
        const end = modifier.end ? resolveTiming(modifier.end, inputs.startMonth, retirementStart) : undefined;
        return scheduledAmountEffect({
          id: `modifier-${modifier.id}`,
          description: modifier.name,
          accountId: NON_RETIREMENT_ACCOUNT_ID,
          kind: modifier.kind === "monthlyExpense" ? "expense" : "income",
          amount: (state) =>
            (modifier.kind === "monthlyExpense" ? -modifier.amount : modifier.amount) * state.inflationIndex,
          start,
          end,
        });
      }

      const month = resolveTiming(modifier.start, inputs.startMonth, retirementStart);
      return scheduledAmountEffect({
        id: `modifier-${modifier.id}`,
        description: modifier.name,
        accountId: NON_RETIREMENT_ACCOUNT_ID,
        kind: modifier.kind === "oneTimeExpense" ? "expense" : "income",
        amount: (state) => (modifier.kind === "oneTimeExpense" ? -modifier.amount : modifier.amount) * state.inflationIndex,
        start: month,
        end: month,
      });
    });
}

function retirementWithdrawalEffect(
  inputs: RetirementPlanInputs,
  retirementStart: YearMonth,
  recipe: ScenarioRecipe | null,
): Effect {
  return {
    id: "retirement-spending",
    description: "Inflation-adjusted retirement spending",
    appliesTo: (state) => compareYearMonth(state.month, retirementStart) >= 0,
    apply: (state) => {
      const recipeSpending = retirementSpendingForState(inputs, state, retirementStart, recipe);
      const spending = roundMoney(recipeSpending.monthlyAmount * state.inflationIndex);
      const accessMonth = retirementAccessMonth(inputs);
      const events: SimulationEvent[] = [];
      let accounts = state.accounts;

      const nonRetirementWithdrawal = withdrawFromAccount(accounts, NON_RETIREMENT_ACCOUNT_ID, spending);
      accounts = nonRetirementWithdrawal.accounts;
      let remaining = roundMoney(spending - nonRetirementWithdrawal.withdrawn);

      if (nonRetirementWithdrawal.withdrawn > 0) {
        events.push({
          month: state.month,
          effectId: "retirement-spending",
          kind: "expense",
          accountId: NON_RETIREMENT_ACCOUNT_ID,
          amount: -nonRetirementWithdrawal.withdrawn,
          description: "Paid retirement spending from non-retirement portfolio.",
          metadata: recipeSpending.ruleIds.length > 0 ? { recipeRuleIds: recipeSpending.ruleIds } : undefined,
        });
      }

      if (remaining <= 0) return { state: { ...state, accounts }, events };

      const beforeAccess = compareYearMonth(state.month, accessMonth) < 0;
      if (beforeAccess && !inputs.allowEarlyRetirementAccess) {
        accounts = addToBalance(accounts, NON_RETIREMENT_ACCOUNT_ID, "cash", -remaining);
        events.push({
          month: state.month,
          effectId: "retirement-spending",
          kind: "failure",
          amount: remaining,
          description: "Non-retirement portfolio ran out before retirement funds were configured to be available.",
        });
        return { state: { ...state, accounts }, events };
      }

      const grossNeeded = beforeAccess ? roundMoney(remaining / Math.max(0.01, 1 - inputs.earlyWithdrawalPenalty)) : remaining;
      const retirementWithdrawal = withdrawFromAccount(accounts, RETIREMENT_ACCOUNT_ID, grossNeeded);
      accounts = retirementWithdrawal.accounts;
      const netProvided = beforeAccess
        ? roundMoney(retirementWithdrawal.withdrawn * (1 - inputs.earlyWithdrawalPenalty))
        : retirementWithdrawal.withdrawn;
      remaining = roundMoney(remaining - netProvided);

      if (retirementWithdrawal.withdrawn > 0) {
        events.push({
          month: state.month,
          effectId: "retirement-spending",
          kind: "expense",
          accountId: RETIREMENT_ACCOUNT_ID,
          amount: -retirementWithdrawal.withdrawn,
          description: beforeAccess
            ? "Paid retirement spending from retirement portfolio with early-access penalty."
            : "Paid retirement spending from retirement portfolio.",
          metadata: {
            ...(beforeAccess ? { penaltyRate: inputs.earlyWithdrawalPenalty } : {}),
            netProvided,
            ...(recipeSpending.ruleIds.length > 0 ? { recipeRuleIds: recipeSpending.ruleIds } : {}),
          },
        });
      }

      if (remaining > 0.01) {
        accounts = addToBalance(accounts, NON_RETIREMENT_ACCOUNT_ID, "cash", -remaining);
        events.push({
          month: state.month,
          effectId: "retirement-spending",
          kind: "failure",
          amount: remaining,
          description: "Portfolio could not fund the requested retirement spending.",
        });
      }

      return { state: { ...state, accounts }, events };
    },
  };
}

function recipeEffect(recipe: ScenarioRecipe | null, retirementStart: YearMonth): Effect {
  return {
    id: "recipe-actions",
    description: "Scenario recipe actions",
    appliesTo: () => recipe !== null,
    apply: (state) => {
      let accounts = state.accounts;
      const events: SimulationEvent[] = [];

      for (const rule of recipe?.rules ?? []) {
        if (!recipeRuleMatches(rule, { ...state, accounts }, retirementStart)) continue;

        for (const action of rule.actions) {
          if (action.type === "setRetirementSpending") continue;

          if (action.type === "addAmount") {
            const amount = recipeActionAmount(action, state);
            if (amount === 0) continue;
            const assetClass = action.assetClass ?? "cash";
            accounts = addToBalance(accounts, action.accountId, assetClass, amount);
            events.push({
              month: state.month,
              effectId: `recipe-${rule.id}`,
              kind: action.kind ?? (amount < 0 ? "expense" : "income"),
              accountId: action.accountId,
              assetClass,
              amount,
              description: action.description ?? rule.description ?? `Applied recipe rule ${rule.id}.`,
              metadata: { recipeRuleId: rule.id, actionType: action.type },
            });
          } else {
            const requestedAmount = recipeActionAmount(action, state);
            const available = getBalance(accounts, action.fromAccountId, action.fromAssetClass ?? "cash");
            const amount = action.limitToAvailable ? roundMoney(Math.min(Math.max(0, available), requestedAmount)) : requestedAmount;
            if (amount === 0) continue;
            const fromAssetClass = action.fromAssetClass ?? "cash";
            const toAssetClass = action.toAssetClass ?? "cash";
            accounts = transferBalance(accounts, action.fromAccountId, fromAssetClass, action.toAccountId, toAssetClass, amount);
            events.push({
              month: state.month,
              effectId: `recipe-${rule.id}`,
              kind: action.kind ?? "transfer",
              accountId: action.fromAccountId,
              assetClass: fromAssetClass,
              amount: -amount,
              description: action.description ?? rule.description ?? `Applied recipe rule ${rule.id}.`,
              metadata: {
                recipeRuleId: rule.id,
                actionType: action.type,
                toAccountId: action.toAccountId,
                toAssetClass,
              },
            });
          }
        }
      }

      return { state: { ...state, accounts }, events };
    },
  };
}

function scheduledAmountEffect(options: {
  id: string;
  description: string;
  accountId: string;
  kind: "income" | "expense";
  amount: (state: SimulationState) => number;
  start: YearMonth;
  end?: YearMonth;
}): Effect {
  return {
    id: options.id,
    description: options.description,
    appliesTo: (state) =>
      compareYearMonth(state.month, options.start) >= 0 && (!options.end || compareYearMonth(state.month, options.end) <= 0),
    apply: (state) => {
      const amount = roundMoney(options.amount(state));
      const accounts = addToBalance(state.accounts, options.accountId, "cash", amount);
      return {
        state: { ...state, accounts },
        events: [
          {
            month: state.month,
            effectId: options.id,
            kind: options.kind,
            accountId: options.accountId,
            assetClass: "cash",
            amount,
            description: options.description,
          },
        ],
      };
    },
  };
}

function resolveTiming(timing: CashFlowTiming, startMonth: YearMonth, retirementMonth: YearMonth): YearMonth {
  if (timing === "now") return startMonth;
  if (timing === "atRetirement") return retirementMonth;
  return timing;
}

function withdrawFromAccount(accounts: Accounts, accountId: string, requested: number): { accounts: Accounts; withdrawn: number } {
  let next = accounts;
  let remaining = roundMoney(Math.max(0, requested));
  let withdrawn = 0;

  for (const assetClass of ASSET_CLASSES) {
    if (remaining <= 0) break;
    const available = Math.max(0, getBalance(next, accountId, assetClass));
    const amount = roundMoney(Math.min(available, remaining));
    if (amount <= 0) continue;
    next = setBalance(next, accountId, assetClass, available - amount);
    remaining = roundMoney(remaining - amount);
    withdrawn = roundMoney(withdrawn + amount);
  }

  return { accounts: next, withdrawn };
}

function validateRecipeAccount(account: unknown): asserts account is RecipeAccount {
  if (!account || typeof account !== "object") throw new Error("Recipe account must be an object.");
  const candidate = account as Partial<RecipeAccount>;
  if (!candidate.id || typeof candidate.id !== "string") throw new Error("Recipe account must include an id.");
  if (!candidate.name || typeof candidate.name !== "string") throw new Error(`Recipe account ${candidate.id} must include a name.`);
  if (!candidate.kind || typeof candidate.kind !== "string") throw new Error(`Recipe account ${candidate.id} must include a kind.`);
  if (!candidate.balances || typeof candidate.balances !== "object") {
    throw new Error(`Recipe account ${candidate.id} must include balances.`);
  }
  for (const [assetClass, balance] of Object.entries(candidate.balances)) {
    if (!assetClass || !Number.isFinite(balance)) {
      throw new Error(`Recipe account ${candidate.id} balances must be finite numbers.`);
    }
  }
}

function validateRecipeRule(rule: unknown, index: number, accountIds: Set<string>): asserts rule is RecipeRule {
  if (!rule || typeof rule !== "object") throw new Error(`Recipe rule ${index + 1} must be an object.`);
  const candidate = rule as Partial<RecipeRule>;
  if (!candidate.id || typeof candidate.id !== "string") throw new Error(`Recipe rule ${index + 1} must include an id.`);
  if (!Array.isArray(candidate.actions) || candidate.actions.length === 0) {
    throw new Error(`Recipe rule ${candidate.id} must include at least one action.`);
  }
  const conditions = Array.isArray(candidate.when) ? candidate.when : candidate.when ? [candidate.when] : [];
  for (const condition of conditions) {
    validateRecipeCondition(condition, candidate.id, accountIds);
  }

  for (const action of candidate.actions) {
    if (!action || typeof action !== "object") throw new Error(`Recipe rule ${candidate.id} has an invalid action.`);
    const maybeAction = action as Partial<RecipeAction>;
    const maybeKind = (action as { kind?: unknown }).kind;
    if (maybeAction.type !== "setRetirementSpending" && maybeAction.type !== "addAmount" && maybeAction.type !== "transfer") {
      throw new Error(`Recipe action in ${candidate.id} has an unsupported type.`);
    }
    if (!Number.isFinite(maybeAction.amount)) throw new Error(`Recipe action in ${candidate.id} must include a finite amount.`);
    if (maybeAction.period !== undefined && maybeAction.period !== "monthly" && maybeAction.period !== "annual") {
      throw new Error(`Recipe action in ${candidate.id} has an unsupported period.`);
    }
    if (maybeKind !== undefined && (typeof maybeKind !== "string" || !RECIPE_EVENT_KINDS.has(maybeKind as EventKind))) {
      throw new Error(`Recipe action in ${candidate.id} has an unsupported event kind.`);
    }
    if (maybeAction.type === "addAmount") {
      if (!maybeAction.accountId) throw new Error(`Recipe addAmount action in ${candidate.id} must include an accountId.`);
      if (!accountIds.has(maybeAction.accountId)) {
        throw new Error(`Recipe addAmount action in ${candidate.id} references unknown account ${maybeAction.accountId}.`);
      }
    }
    if (maybeAction.type === "transfer") {
      if (!maybeAction.fromAccountId) throw new Error(`Recipe transfer action in ${candidate.id} must include a fromAccountId.`);
      if (!maybeAction.toAccountId) throw new Error(`Recipe transfer action in ${candidate.id} must include a toAccountId.`);
      if (!accountIds.has(maybeAction.fromAccountId)) {
        throw new Error(`Recipe transfer action in ${candidate.id} references unknown account ${maybeAction.fromAccountId}.`);
      }
      if (!accountIds.has(maybeAction.toAccountId)) {
        throw new Error(`Recipe transfer action in ${candidate.id} references unknown account ${maybeAction.toAccountId}.`);
      }
    }
  }
}

function validateRecipeCondition(condition: unknown, ruleId: string, accountIds: Set<string>): asserts condition is RecipeCondition {
  if (!condition || typeof condition !== "object") throw new Error(`Recipe rule ${ruleId} has an invalid condition.`);
  const candidate = condition as Partial<RecipeCondition>;

  if (candidate.source === "retired") {
    if (typeof candidate.equals !== "boolean") throw new Error(`Recipe condition in ${ruleId} must include a boolean equals value.`);
    return;
  }

  if (
    candidate.source !== "accountTotal" &&
    candidate.source !== "accountBalance" &&
    candidate.source !== "portfolioTotal" &&
    candidate.source !== "monthIndex" &&
    candidate.source !== "month"
  ) {
    throw new Error(`Recipe condition in ${ruleId} has an unsupported source.`);
  }
  if (!isRecipeComparisonOperator(candidate.operator)) {
    throw new Error(`Recipe condition in ${ruleId} has an unsupported operator.`);
  }
  if (candidate.source === "month") {
    if (typeof candidate.value !== "string") throw new Error(`Recipe condition in ${ruleId} must include a month value.`);
    parseYearMonth(candidate.value);
  } else if (!Number.isFinite(candidate.value)) {
    throw new Error(`Recipe condition in ${ruleId} must include a finite value.`);
  }

  if (candidate.source === "accountTotal" || candidate.source === "accountBalance") {
    if (!candidate.accountId) throw new Error(`Recipe condition in ${ruleId} must include an accountId.`);
    if (!accountIds.has(candidate.accountId)) {
      throw new Error(`Recipe condition in ${ruleId} references unknown account ${candidate.accountId}.`);
    }
  }
  if (candidate.source === "accountBalance" && !candidate.assetClass) {
    throw new Error(`Recipe condition in ${ruleId} must include an assetClass.`);
  }
  if (candidate.source === "portfolioTotal" && candidate.accountIds !== undefined && !Array.isArray(candidate.accountIds)) {
    throw new Error(`Recipe condition in ${ruleId} accountIds must be an array.`);
  }
  for (const accountId of candidate.source === "portfolioTotal" ? candidate.accountIds ?? [] : []) {
    if (typeof accountId !== "string" || !accountIds.has(accountId)) {
      throw new Error(`Recipe condition in ${ruleId} references unknown account ${accountId}.`);
    }
  }
}

function recipeRuleMatches(rule: RecipeRule, state: SimulationState, retirementStart: YearMonth): boolean {
  const conditions = Array.isArray(rule.when) ? rule.when : rule.when ? [rule.when] : [];
  return conditions.every((condition) => recipeConditionMatches(condition, state, retirementStart));
}

function recipeConditionMatches(condition: RecipeCondition, state: SimulationState, retirementStart: YearMonth): boolean {
  if (condition.source === "retired") {
    return (compareYearMonth(state.month, retirementStart) >= 0) === condition.equals;
  }
  if (condition.source === "month") {
    return compareNumbers(compareYearMonth(state.month, condition.value), condition.operator, 0);
  }

  const actual = recipeConditionValue(condition, state);
  return compareNumbers(actual, condition.operator, condition.value);
}

function recipeConditionValue(condition: Exclude<RecipeCondition, { source: "retired" } | { source: "month" }>, state: SimulationState): number {
  if (condition.source === "accountTotal") return accountTotal(state.accounts, condition.accountId);
  if (condition.source === "accountBalance") return getBalance(state.accounts, condition.accountId, condition.assetClass);
  if (condition.source === "monthIndex") return state.monthIndex;
  return (condition.accountIds ?? Object.keys(state.accounts)).reduce((sum, accountId) => sum + accountTotal(state.accounts, accountId), 0);
}

function recipeActionAmount(action: Extract<RecipeAction, { type: "addAmount" | "transfer" }>, state: SimulationState): number {
  const monthlyAmount = action.period === "annual" ? action.amount / 12 : action.amount;
  const adjustedAmount = action.inflationAdjusted === false ? monthlyAmount : monthlyAmount * state.inflationIndex;
  return roundMoney(adjustedAmount);
}

function recipeAccounts(recipe: ScenarioRecipe | null): Accounts {
  return Object.fromEntries(
    (recipe?.accounts ?? []).map((account) => [
      account.id,
      {
        ...account,
        balances: Object.fromEntries(
          Object.entries(account.balances).map(([assetClass, balance]) => [assetClass, roundMoney(balance)]),
        ),
        metadata: account.metadata ? { ...account.metadata } : undefined,
      },
    ]),
  );
}

function compareNumbers(actual: number, operator: RecipeComparisonOperator, expected: number): boolean {
  switch (operator) {
    case "<":
      return actual < expected;
    case "<=":
      return actual <= expected;
    case ">":
      return actual > expected;
    case ">=":
      return actual >= expected;
    case "==":
      return actual === expected;
    case "!=":
      return actual !== expected;
  }
}

function isRecipeComparisonOperator(operator: unknown): operator is RecipeComparisonOperator {
  return operator === "<" || operator === "<=" || operator === ">" || operator === ">=" || operator === "==" || operator === "!=";
}

function accountTotal(accounts: Accounts, accountId: string): number {
  return Object.values(accounts[accountId]?.balances ?? {}).reduce((sum, value) => sum + value, 0);
}

function allocatedAccount(options: {
  id: string;
  name: string;
  kind: Account["kind"];
  total: number;
  allocation: Record<AssetClass, number>;
}): Account {
  return {
    id: options.id,
    name: options.name,
    kind: options.kind,
    balances: {
      stocks: roundMoney(options.total * (options.allocation.stocks ?? 0)),
      bonds: roundMoney(options.total * (options.allocation.bonds ?? 0)),
      cash: roundMoney(options.total * (options.allocation.cash ?? 0)),
    },
  };
}

function normalizeAllocation(allocation: AssetAllocation): Record<AssetClass, number> {
  const total = allocation.stocks + allocation.bonds + allocation.cash;
  if (total <= 0) return { stocks: 0.8, bonds: 0.15, cash: 0.05 };
  return {
    stocks: allocation.stocks / total,
    bonds: allocation.bonds / total,
    cash: allocation.cash / total,
  };
}

function summarizeWindow(run: HistoricalSimulationRun): HistoricalWindowSummary {
  return {
    startYear: run.startYear,
    endYear: run.endYear,
    endingRealPortfolioValue: run.endingRealPortfolioValue,
    success: run.success,
    failureMonth: run.failure?.month ?? null,
  };
}

function validateInputs(inputs: RetirementPlanInputs): void {
  parseYearMonth(inputs.startMonth);
  const values = [
    inputs.birthYear,
    inputs.estimatedDeathAge,
    inputs.accessiblePortfolio,
    inputs.retirementPortfolio,
    inputs.monthlyIncome,
    inputs.monthlyExpenses,
    inputs.monthlyRetirementContribution,
    inputs.monthlyRetirementSpending,
    inputs.successTarget,
    inputs.retirementAccessAge,
    inputs.earlyWithdrawalPenalty,
  ];
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error("Retirement plan inputs must be finite numbers.");
  }
  if (inputs.estimatedDeathAge <= 0) throw new Error("Estimated death age must be positive.");
  if (compareYearMonth(simulationEndMonth(inputs), inputs.startMonth) <= 0) {
    throw new Error("Simulation end month must be after the current month.");
  }
}

function currentYearMonth(): YearMonth {
  const now = new Date();
  return formatYearMonth(now.getFullYear(), now.getMonth() + 1);
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "scenario";
}
