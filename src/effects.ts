import { isBetweenMonths } from "./dates.js";
import { addToBalance, getBalance, roundMoney, setBalance, transferBalance } from "./money.js";
import type { AccountId, AssetClass, Effect, EventKind, SimulationEvent, SimulationState, YearMonth } from "./types.js";

export interface ActiveWindow {
  start?: YearMonth;
  end?: YearMonth;
}

export interface ScheduledAmountOptions extends ActiveWindow {
  id: string;
  description?: string;
  accountId: AccountId;
  assetClass: AssetClass;
  amount: number | ((state: SimulationState) => number);
  kind: EventKind;
}

export function scheduledAmount(options: ScheduledAmountOptions): Effect {
  return {
    id: options.id,
    description: options.description,
    appliesTo: (state) => isBetweenMonths(state.month, options.start, options.end),
    apply: (state) => {
      const amount = typeof options.amount === "function" ? options.amount(state) : options.amount;
      const accounts = addToBalance(state.accounts, options.accountId, options.assetClass, amount);
      const event: SimulationEvent = {
        month: state.month,
        effectId: options.id,
        kind: options.kind,
        accountId: options.accountId,
        assetClass: options.assetClass,
        amount: roundMoney(amount),
        description: options.description ?? `${options.kind} ${roundMoney(amount)} to ${options.accountId}`,
      };

      return { state: { ...state, accounts }, events: [event] };
    },
  };
}

export function monthlyIncome(options: Omit<ScheduledAmountOptions, "kind">): Effect {
  return scheduledAmount({ ...options, kind: "income" });
}

export function monthlyExpense(options: Omit<ScheduledAmountOptions, "kind" | "amount"> & {
  amount: number | ((state: SimulationState) => number);
}): Effect {
  return scheduledAmount({
    ...options,
    amount: (state) => -Math.abs(typeof options.amount === "function" ? options.amount(state) : options.amount),
    kind: "expense",
  });
}

export interface PortfolioPercentExpenseOptions extends ActiveWindow {
  id: string;
  description?: string;
  accountId: AccountId;
  assetClass: AssetClass;
  portfolioAccountIds: AccountId[];
  annualPercentage: number;
  minimumAnnualAmount?: number | ((state: SimulationState) => number);
}

export function portfolioPercentExpense(options: PortfolioPercentExpenseOptions): Effect {
  return {
    id: options.id,
    description: options.description,
    appliesTo: (state) => isBetweenMonths(state.month, options.start, options.end),
    apply: (state) => {
      const portfolioTotal = roundMoney(
        options.portfolioAccountIds.reduce((sum, accountId) => sum + accountTotal(state, accountId), 0),
      );
      const percentageAmount = roundMoney((portfolioTotal * options.annualPercentage) / 12);
      const minimumAnnualAmount =
        typeof options.minimumAnnualAmount === "function"
          ? options.minimumAnnualAmount(state)
          : (options.minimumAnnualAmount ?? 0);
      const minimumAmount = roundMoney(minimumAnnualAmount / 12);
      const amount = roundMoney(Math.max(percentageAmount, minimumAmount));
      const accounts = addToBalance(state.accounts, options.accountId, options.assetClass, -amount);

      return {
        state: { ...state, accounts },
        events: [
          {
            month: state.month,
            effectId: options.id,
            kind: "expense",
            accountId: options.accountId,
            assetClass: options.assetClass,
            amount: -amount,
            description:
              options.description ??
              `${roundMoney(options.annualPercentage * 100)}% portfolio withdrawal with minimum floor`,
            metadata: {
              portfolioAccountIds: options.portfolioAccountIds,
              portfolioTotal,
              annualPercentage: options.annualPercentage,
              percentageAmount,
              minimumAmount,
            },
          },
        ],
      };
    },
  };
}

export interface TransferOptions extends ActiveWindow {
  id: string;
  description?: string;
  fromAccountId: AccountId;
  fromAssetClass: AssetClass;
  toAccountId: AccountId;
  toAssetClass: AssetClass;
  amount: number | ((state: SimulationState) => number);
  kind?: EventKind;
}

export function monthlyTransfer(options: TransferOptions): Effect {
  return {
    id: options.id,
    description: options.description,
    appliesTo: (state) => isBetweenMonths(state.month, options.start, options.end),
    apply: (state) => {
      const amount = typeof options.amount === "function" ? options.amount(state) : options.amount;
      const accounts = transferBalance(
        state.accounts,
        options.fromAccountId,
        options.fromAssetClass,
        options.toAccountId,
        options.toAssetClass,
        amount,
      );

      return {
        state: { ...state, accounts },
        events: [
          {
            month: state.month,
            effectId: options.id,
            kind: options.kind ?? "transfer",
            accountId: options.fromAccountId,
            assetClass: options.fromAssetClass,
            amount: roundMoney(-amount),
            description:
              options.description ??
              `Transferred ${roundMoney(amount)} from ${options.fromAccountId} to ${options.toAccountId}`,
            metadata: {
              toAccountId: options.toAccountId,
              toAssetClass: options.toAssetClass,
            },
          },
        ],
      };
    },
  };
}

export interface ReturnOptions extends ActiveWindow {
  id: string;
  description?: string;
  accountIds?: AccountId[];
  assetClasses: AssetClass[];
  monthlyRate: number | ((state: SimulationState, accountId: AccountId, assetClass: AssetClass) => number);
}

export function monthlyReturn(options: ReturnOptions): Effect {
  return {
    id: options.id,
    description: options.description,
    appliesTo: (state) => isBetweenMonths(state.month, options.start, options.end),
    apply: (state) => {
      let accounts = state.accounts;
      const events: SimulationEvent[] = [];
      const accountIds = options.accountIds ?? Object.keys(state.accounts);

      for (const accountId of accountIds) {
        for (const assetClass of options.assetClasses) {
          const balance = getBalance(accounts, accountId, assetClass);
          if (balance === 0) continue;

          const rate =
            typeof options.monthlyRate === "function"
              ? options.monthlyRate(state, accountId, assetClass)
              : options.monthlyRate;
          const change = roundMoney(balance * rate);
          if (change === 0) continue;

          accounts = addToBalance(accounts, accountId, assetClass, change);
          events.push({
            month: state.month,
            effectId: options.id,
            kind: "return",
            accountId,
            assetClass,
            amount: change,
            description: options.description ?? `${assetClass} return in ${accountId}`,
            metadata: { rate },
          });
        }
      }

      return { state: { ...state, accounts }, events };
    },
  };
}

export interface ReturnAboveReserveOptions extends ActiveWindow {
  id: string;
  description?: string;
  accountId: AccountId;
  assetClass: AssetClass;
  reserve: number;
  monthlyRate: number | ((state: SimulationState) => number);
}

export function monthlyReturnAboveReserve(options: ReturnAboveReserveOptions): Effect {
  return {
    id: options.id,
    description: options.description,
    appliesTo: (state) => isBetweenMonths(state.month, options.start, options.end),
    apply: (state) => {
      const balance = getBalance(state.accounts, options.accountId, options.assetClass);
      const investedBalance = Math.max(0, balance - options.reserve);
      if (investedBalance === 0) return { state, events: [] };

      const rate = typeof options.monthlyRate === "function" ? options.monthlyRate(state) : options.monthlyRate;
      const change = roundMoney(investedBalance * rate);
      if (change === 0) return { state, events: [] };

      const accounts = addToBalance(state.accounts, options.accountId, options.assetClass, change);
      return {
        state: { ...state, accounts },
        events: [
          {
            month: state.month,
            effectId: options.id,
            kind: "return",
            accountId: options.accountId,
            assetClass: options.assetClass,
            amount: change,
            description: options.description ?? `Return above reserve in ${options.accountId}`,
            metadata: { rate, reserve: options.reserve, investedBalance },
          },
        ],
      };
    },
  };
}

export interface InflationOptions extends ActiveWindow {
  id: string;
  monthlyRate: number | ((state: SimulationState) => number);
}

export interface RebalanceAccountOptions extends ActiveWindow {
  id: string;
  description?: string;
  accountId: AccountId;
  targets: Record<AssetClass, number>;
  tolerance?: number;
}

export function rebalanceAccount(options: RebalanceAccountOptions): Effect {
  const targetTotal = Object.values(options.targets).reduce((sum, value) => sum + value, 0);
  if (Math.abs(targetTotal - 1) > 0.000001) {
    throw new Error(`Rebalance targets for ${options.id} must sum to 1`);
  }

  return {
    id: options.id,
    description: options.description,
    appliesTo: (state) => isBetweenMonths(state.month, options.start, options.end),
    apply: (state) => {
      const account = state.accounts[options.accountId];
      if (!account) throw new Error(`Unknown account: ${options.accountId}`);

      const currentTotal = Object.values(account.balances).reduce((sum, value) => sum + value, 0);
      if (currentTotal <= 0) return { state, events: [] };

      let accounts = state.accounts;
      let totalAbsoluteChange = 0;
      const before = { ...account.balances };

      for (const [assetClass, targetWeight] of Object.entries(options.targets)) {
        const targetBalance = roundMoney(currentTotal * targetWeight);
        const currentBalance = getBalance(accounts, options.accountId, assetClass);
        totalAbsoluteChange += Math.abs(targetBalance - currentBalance);
        accounts = setBalance(accounts, options.accountId, assetClass, targetBalance);
      }

      const tolerance = options.tolerance ?? 0.01;
      if (totalAbsoluteChange < tolerance) return { state, events: [] };
      const amount = roundMoney(totalAbsoluteChange / 2);
      if (Math.abs(amount) < 0.5) return { state: { ...state, accounts }, events: [] };

      return {
        state: { ...state, accounts },
        events: [
          {
            month: state.month,
            effectId: options.id,
            kind: "transfer",
            accountId: options.accountId,
            amount,
            description: options.description ?? `Rebalanced ${options.accountId}`,
            metadata: {
              before,
              after: accounts[options.accountId]?.balances,
              targets: options.targets,
            },
          },
        ],
      };
    },
  };
}

export function monthlyInflation(options: InflationOptions): Effect {
  return {
    id: options.id,
    appliesTo: (state) => isBetweenMonths(state.month, options.start, options.end),
    apply: (state) => {
      const rate = typeof options.monthlyRate === "function" ? options.monthlyRate(state) : options.monthlyRate;
      const inflationIndex = state.inflationIndex * (1 + rate);

      return {
        state: { ...state, inflationIndex },
        events: [
          {
            month: state.month,
            effectId: options.id,
            kind: "inflation",
            amount: rate,
            description: `Inflation index updated to ${inflationIndex.toFixed(4)}`,
          },
        ],
      };
    },
  };
}

function accountTotal(state: SimulationState, accountId: AccountId): number {
  return Object.values(state.accounts[accountId]?.balances ?? {}).reduce((sum, value) => sum + value, 0);
}
