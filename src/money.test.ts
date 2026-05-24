import { describe, expect, it } from "vitest";
import {
  addToBalance,
  cloneAccounts,
  getBalance,
  netWorth,
  setBalance,
  totalByAccount,
  totalByAssetClass,
  transferBalance,
} from "./money.js";
import type { Accounts } from "./types.js";

function accounts(): Accounts {
  return {
    cash: { id: "cash", name: "Cash", kind: "cash", balances: { cash: 100 } },
    brokerage: { id: "brokerage", name: "Brokerage", kind: "taxable", balances: { stocks: 50, bonds: 25 } },
    mortgage: { id: "mortgage", name: "Mortgage", kind: "debt", balances: { debt: -40 } },
  };
}

describe("money utilities", () => {
  it("gets account and asset-class balances", () => {
    const input = accounts();
    expect(getBalance(input, "cash")).toBe(100);
    expect(getBalance(input, "brokerage")).toBe(75);
    expect(getBalance(input, "brokerage", "stocks")).toBe(50);
    expect(getBalance(input, "brokerage", "missing")).toBe(0);
  });

  it("returns cloned accounts without mutating input", () => {
    const input = accounts();
    const cloned = cloneAccounts(input);
    cloned.cash!.balances.cash = 999;

    expect(input.cash!.balances.cash).toBe(100);
    expect(cloned.cash!.balances.cash).toBe(999);
  });

  it("sets and adds balances immutably", () => {
    const input = accounts();
    const set = setBalance(input, "cash", "cash", 123.456);
    const added = addToBalance(input, "cash", "cash", 25);

    expect(set.cash!.balances.cash).toBe(123.46);
    expect(added.cash!.balances.cash).toBe(125);
    expect(input.cash!.balances.cash).toBe(100);
  });

  it("transfers balances across accounts and asset classes", () => {
    const input = accounts();
    const output = transferBalance(input, "cash", "cash", "brokerage", "stocks", 30);

    expect(output.cash!.balances.cash).toBe(70);
    expect(output.brokerage!.balances.stocks).toBe(80);
    expect(input.cash!.balances.cash).toBe(100);
  });

  it("summarizes account, asset-class, and net-worth totals", () => {
    const input = accounts();

    expect(totalByAccount(input)).toEqual({ cash: 100, brokerage: 75, mortgage: -40 });
    expect(totalByAssetClass(input)).toEqual({ cash: 100, stocks: 50, bonds: 25, debt: -40 });
    expect(netWorth(input)).toBe(135);
  });
});
