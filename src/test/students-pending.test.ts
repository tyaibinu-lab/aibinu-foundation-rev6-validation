import { describe, expect, it, vi } from "vitest";
import { createSingleFlight } from "@/lib/students/single-flight";

describe("student action single-flight guard", () => {
  it("ignores a second submission while the first is pending", () => {
    const gate = createSingleFlight();
    const start = vi.fn();
    expect(gate.run(start)).toBe(true);
    expect(gate.run(start)).toBe(false);
    expect(start).toHaveBeenCalledTimes(1);
    expect(gate.busy).toBe(true);
  });
  it("blocks a different action on the same card while one is pending", () => {
    const gate = createSingleFlight();
    const primary = vi.fn(); const unlink = vi.fn();
    gate.run(primary);
    expect(gate.run(unlink)).toBe(false);
    expect(unlink).not.toHaveBeenCalled();
  });
  it("allows a new submission after the first settles (success or error)", () => {
    const gate = createSingleFlight();
    let settle = () => {};
    gate.run((s) => { settle = s; });
    settle();
    expect(gate.busy).toBe(false);
    const next = vi.fn();
    expect(gate.run(next)).toBe(true);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
