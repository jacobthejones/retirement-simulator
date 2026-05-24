import type { YearMonth } from "./types.js";

export function parseYearMonth(month: YearMonth): { year: number; month: number } {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const parsedMonth = Number(monthText);

  if (!Number.isInteger(year) || !Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
    throw new Error(`Invalid YearMonth: ${month}`);
  }

  return { year, month: parsedMonth };
}

export function formatYearMonth(year: number, month: number): YearMonth {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid year/month: ${year}/${month}`);
  }

  return `${year}-${String(month).padStart(2, "0")}`;
}

export function addMonths(month: YearMonth, count: number): YearMonth {
  const parsed = parseYearMonth(month);
  const zeroBased = parsed.year * 12 + (parsed.month - 1) + count;
  const year = Math.floor(zeroBased / 12);
  const nextMonth = (zeroBased % 12) + 1;

  return formatYearMonth(year, nextMonth);
}

export function compareYearMonth(left: YearMonth, right: YearMonth): number {
  const a = parseYearMonth(left);
  const b = parseYearMonth(right);
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

export function isBetweenMonths(month: YearMonth, start?: YearMonth, end?: YearMonth): boolean {
  if (start && compareYearMonth(month, start) < 0) return false;
  if (end && compareYearMonth(month, end) > 0) return false;
  return true;
}
