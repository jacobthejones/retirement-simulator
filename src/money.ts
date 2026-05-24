import type { AccountId, Accounts, AssetClass, SimulationState } from "./types.js";

export function cloneAccounts(accounts: Accounts): Accounts {
  return Object.fromEntries(
    Object.entries(accounts).map(([id, account]) => [
      id,
      {
        ...account,
        balances: { ...account.balances },
        metadata: account.metadata ? { ...account.metadata } : undefined,
      },
    ]),
  );
}

export function cloneState(state: SimulationState): SimulationState {
  return {
    ...state,
    accounts: cloneAccounts(state.accounts),
    metadata: { ...state.metadata },
  };
}

export function getBalance(accounts: Accounts, accountId: AccountId, assetClass?: AssetClass): number {
  const account = accounts[accountId];
  if (!account) throw new Error(`Unknown account: ${accountId}`);

  if (assetClass) return account.balances[assetClass] ?? 0;
  return Object.values(account.balances).reduce((sum, value) => sum + value, 0);
}

export function setBalance(
  accounts: Accounts,
  accountId: AccountId,
  assetClass: AssetClass,
  balance: number,
): Accounts {
  const next = cloneAccounts(accounts);
  const account = next[accountId];
  if (!account) throw new Error(`Unknown account: ${accountId}`);

  account.balances[assetClass] = roundMoney(balance);
  return next;
}

export function addToBalance(
  accounts: Accounts,
  accountId: AccountId,
  assetClass: AssetClass,
  amount: number,
): Accounts {
  return setBalance(accounts, accountId, assetClass, getBalance(accounts, accountId, assetClass) + amount);
}

export function transferBalance(
  accounts: Accounts,
  fromAccountId: AccountId,
  fromAssetClass: AssetClass,
  toAccountId: AccountId,
  toAssetClass: AssetClass,
  amount: number,
): Accounts {
  let next = addToBalance(accounts, fromAccountId, fromAssetClass, -amount);
  next = addToBalance(next, toAccountId, toAssetClass, amount);
  return next;
}

export function totalByAccount(accounts: Accounts): Record<AccountId, number> {
  return Object.fromEntries(Object.keys(accounts).map((id) => [id, getBalance(accounts, id)]));
}

export function totalByAssetClass(accounts: Accounts): Record<AssetClass, number> {
  const totals: Record<AssetClass, number> = {};
  for (const account of Object.values(accounts)) {
    for (const [assetClass, balance] of Object.entries(account.balances)) {
      totals[assetClass] = roundMoney((totals[assetClass] ?? 0) + balance);
    }
  }
  return totals;
}

export function netWorth(accounts: Accounts): number {
  return roundMoney(Object.values(totalByAccount(accounts)).reduce((sum, value) => sum + value, 0));
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}
