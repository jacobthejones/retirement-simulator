import { describe, expect, it } from "vitest";
import { addMonths, compareYearMonth, formatYearMonth, isBetweenMonths, parseYearMonth } from "./dates.js";

describe("date utilities", () => {
  it("parses and formats YearMonth values", () => {
    expect(parseYearMonth("2034-07")).toEqual({ year: 2034, month: 7 });
    expect(formatYearMonth(2034, 7)).toBe("2034-07");
  });

  it("rejects invalid YearMonth values", () => {
    expect(() => parseYearMonth("2034-00")).toThrow("Invalid YearMonth");
    expect(() => parseYearMonth("2034-13")).toThrow("Invalid YearMonth");
    expect(() => formatYearMonth(2034, 0)).toThrow("Invalid year/month");
  });

  it("adds months across year boundaries", () => {
    expect(addMonths("2026-05", 0)).toBe("2026-05");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-05", 98)).toBe("2034-07");
  });

  it("compares and bounds months", () => {
    expect(compareYearMonth("2026-05", "2026-05")).toBe(0);
    expect(compareYearMonth("2026-06", "2026-05")).toBeGreaterThan(0);
    expect(compareYearMonth("2026-04", "2026-05")).toBeLessThan(0);

    expect(isBetweenMonths("2026-05", "2026-05", "2026-06")).toBe(true);
    expect(isBetweenMonths("2026-06", "2026-05", "2026-06")).toBe(true);
    expect(isBetweenMonths("2026-07", "2026-05", "2026-06")).toBe(false);
    expect(isBetweenMonths("2026-04", "2026-05")).toBe(false);
  });
});
