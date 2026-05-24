import { addToBalance, getBalance, roundMoney, transferBalance } from "./money.js";
import type { AccountId, AssetClass, Check, CheckResult, SimulationState } from "./types.js";

export type CheckAction =
  | { type: "fail"; message?: string }
  | {
      type: "transfer";
      fromAccountId: AccountId;
      fromAssetClass: AssetClass;
      toAccountId: AccountId;
      toAssetClass: AssetClass;
      amount: number | ((state: SimulationState, deficit: number) => number);
      failIfInsufficient?: boolean;
      message?: string;
    }
  | {
      type: "sell";
      fromAccountId: AccountId;
      fromAssetClass: AssetClass;
      toAccountId: AccountId;
      toAssetClass: AssetClass;
      amount: number | ((state: SimulationState, deficit: number) => number);
      failIfInsufficient?: boolean;
      message?: string;
    };

export interface MinimumBalanceCheckOptions {
  id: string;
  accountId: AccountId;
  assetClass?: AssetClass;
  minimum: number;
  action: CheckAction;
}

export function minimumBalanceCheck(options: MinimumBalanceCheckOptions): Check {
  return {
    id: options.id,
    appliesTo: () => true,
    evaluate: (state) => {
      const balance = getBalance(state.accounts, options.accountId, options.assetClass);
      if (balance >= options.minimum) {
        return { state, events: [], failed: false };
      }

      const deficit = roundMoney(options.minimum - balance);
      return runAction(state, options.id, deficit, options.action);
    },
  };
}

function runAction(state: SimulationState, checkId: string, deficit: number, action: CheckAction): CheckResult {
  if (action.type === "fail") {
    const message = action.message ?? `Check ${checkId} failed with deficit ${deficit}`;
    return {
      state,
      failed: true,
      message,
      events: [
        {
          month: state.month,
          effectId: checkId,
          kind: "failure",
          amount: deficit,
          description: message,
        },
      ],
    };
  }

  const amount = typeof action.amount === "function" ? action.amount(state, deficit) : action.amount;
  const available = getBalance(state.accounts, action.fromAccountId, action.fromAssetClass);

  if (action.failIfInsufficient && available < amount) {
    const message = action.message ?? `Check ${checkId} could not cover deficit ${deficit}`;
    return {
      state,
      failed: true,
      message,
      events: [
        {
          month: state.month,
          effectId: checkId,
          kind: "failure",
          amount: deficit,
          description: message,
          metadata: { available, requested: amount },
        },
      ],
    };
  }

  const accounts =
    action.type === "transfer"
      ? transferBalance(
          state.accounts,
          action.fromAccountId,
          action.fromAssetClass,
          action.toAccountId,
          action.toAssetClass,
          amount,
        )
      : addToBalance(
          addToBalance(state.accounts, action.fromAccountId, action.fromAssetClass, -amount),
          action.toAccountId,
          action.toAssetClass,
          amount,
        );

  return {
    state: { ...state, accounts },
    failed: false,
    events: [
      {
        month: state.month,
        effectId: checkId,
        kind: action.type === "transfer" ? "transfer" : "sale",
        accountId: action.fromAccountId,
        assetClass: action.fromAssetClass,
        amount: roundMoney(amount),
        description:
          action.message ??
          `${action.type === "transfer" ? "Transferred" : "Sold"} ${roundMoney(amount)} to satisfy ${checkId}`,
        metadata: {
          toAccountId: action.toAccountId,
          toAssetClass: action.toAssetClass,
          deficit,
        },
      },
    ],
  };
}
