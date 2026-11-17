import { describe, expect, it } from "vitest";
import {
  formatKobo,
  formatNaira,
  koboToNairaString,
  nairaStringToKobo,
  toKobo,
} from "@/lib/finance/currency";

describe("finance currency", () => {
  it("converts valid Naira strings to integer kobo", () => {
    expect(nairaStringToKobo("1500")).toBe(150000n);
    expect(nairaStringToKobo("1,250.50")).toBe(125050n);
    expect(nairaStringToKobo("₦20.05")).toBe(2005n);
    expect(nairaStringToKobo("0.5")).toBe(50n);
  });
  it("handles zero", () => {
    expect(nairaStringToKobo("0")).toBe(0n);
    expect(nairaStringToKobo("-0.00")).toBe(0n);
    expect(formatKobo(0n)).toBe("₦0.00");
  });
  it("rejects malformed input and never rounds extra decimals", () => {
    for (const bad of ["", "abc", "1.234", "1,23", "12,34,567", "1e5", "--1", "1.", ".5", "NaN"]) {
      expect(() => nairaStringToKobo(bad)).toThrow();
    }
    expect(() => toKobo(1.5)).toThrow();
    expect(() => toKobo(Number.MAX_SAFE_INTEGER + 2)).toThrow();
  });
  it("formats kobo as Naira", () => {
    expect(koboToNairaString(123456n)).toBe("1,234.56");
    expect(formatKobo(5n)).toBe("₦0.05");
    expect(formatNaira("1500")).toBe("₦1,500.00");
  });
  it("formats negative values for display", () => {
    expect(formatKobo(-50000n)).toBe("-₦500.00");
    expect(nairaStringToKobo("-20")).toBe(-2000n);
  });
  it("keeps precision for large amounts beyond Number.MAX_SAFE_INTEGER", () => {
    const k = nairaStringToKobo("123,456,789,012,345,678.99");
    expect(k).toBe(12345678901234567899n);
    expect(koboToNairaString(k)).toBe("123,456,789,012,345,678.99");
  });
  it("avoids floating-point drift (0.1 + 0.2 case)", () => {
    expect(nairaStringToKobo("0.10") + nairaStringToKobo("0.20")).toBe(30n);
  });
  it("rejects fractional kobo, exponential values and non-finite numbers", () => {
    for (const bad of ["1.1", "1e3", "", "NaN"]) expect(() => toKobo(bad)).toThrow();
    for (const bad of [Infinity, -Infinity, NaN]) expect(() => toKobo(bad)).toThrow();
  });
  it("preserves safe-integer boundaries and negative large amounts", () => {
    expect(toKobo(Number.MAX_SAFE_INTEGER)).toBe(9007199254740991n);
    expect(formatKobo("-12345678901234567899")).toBe("-₦123,456,789,012,345,678.99");
  });
});
