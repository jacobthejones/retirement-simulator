export type YearMonth = `${number}-${string}`;
export type AccountId = string;
export type AssetClass = string;

export type AccountKind =
  | "cash"
  | "taxable"
  | "traditional-retirement"
  | "roth"
  | "hsa"
  | "real-estate"
  | "debt"
  | "other";

export type BalancesByAssetClass = Record<AssetClass, number>;

export interface Account {
  id: AccountId;
  name: string;
  kind: AccountKind;
  balances: BalancesByAssetClass;
  metadata?: Record<string, unknown>;
}

export type Accounts = Record<AccountId, Account>;

export interface SimulationState {
  month: YearMonth;
  monthIndex: number;
  accounts: Accounts;
  inflationIndex: number;
  metadata: Record<string, unknown>;
}

export type EventKind =
  | "income"
  | "expense"
  | "transfer"
  | "return"
  | "inflation"
  | "purchase"
  | "sale"
  | "debt-payment"
  | "check"
  | "failure"
  | "note";

export interface SimulationEvent {
  month: YearMonth;
  effectId: string;
  kind: EventKind;
  description: string;
  accountId?: AccountId;
  assetClass?: AssetClass;
  amount?: number;
  metadata?: Record<string, unknown>;
}

export interface EffectResult {
  state: SimulationState;
  events: SimulationEvent[];
}

export interface Effect {
  id: string;
  description?: string;
  appliesTo(state: SimulationState): boolean;
  apply(state: SimulationState): EffectResult;
}

export interface CheckResult {
  state: SimulationState;
  events: SimulationEvent[];
  failed: boolean;
  message?: string;
}

export interface Check {
  id: string;
  description?: string;
  appliesTo(state: SimulationState): boolean;
  evaluate(state: SimulationState): CheckResult;
}

export interface SimulationConfig {
  id: string;
  name: string;
  startMonth: YearMonth;
  months: number;
  initialAccounts: Accounts;
  inflationIndex?: number;
  metadata?: Record<string, unknown>;
  effects: Effect[];
  checks?: Check[];
}

export interface MonthSnapshot {
  month: YearMonth;
  monthIndex: number;
  accounts: Accounts;
  totals: Record<string, number>;
  inflationIndex: number;
}

export interface SimulationResult {
  configId: string;
  name: string;
  completed: boolean;
  failed: boolean;
  failure?: {
    month: YearMonth;
    checkId: string;
    message: string;
  };
  finalState: SimulationState;
  snapshots: MonthSnapshot[];
  events: SimulationEvent[];
}
