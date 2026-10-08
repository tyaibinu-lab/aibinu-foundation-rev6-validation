// Gate 8G-1 / P1 — release_results is scoped to the caller's result visibility.
// Live behaviour is proven by the Gate 8G-1 validation run; this locks the contract.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dir = "supabase/migrations";
const p1 = readdirSync(dir).map((f) => readFileSync(`${dir}/${f}`, "utf8")).find((s) => s.includes("Gate 8G-1 / P1"))!;
const body = p1?.replace(/\s+/g, " ") ?? "";

describe("P1 release_results scope", () => {
  it("migration exists and only redefines release_results", () => {
    expect(p1).toBeTruthy();
    expect(body).toMatch(/CREATE OR REPLACE FUNCTION public\.release_results\(p_exam_id uuid, p_force boolean/);
    expect(body).not.toMatch(/CREATE TABLE|ALTER TABLE|CREATE POLICY|role_permissions|CREATE TRIGGER/i);
  });
  it("still requires result.release and the active organisation", () => {
    expect(body).toContain("has_permission('result.release')");
    expect(body).toContain("organisation_id = current_org_id()");
  });
  it("callers without result.read_all must see every result via staff_can_view_results", () => {
    expect(body).toContain("NOT has_permission('result.read_all') AND EXISTS");
    expect(body).toContain("NOT staff_can_view_results(r.student_id)");
  });
  it("delegates to release_results_internal after the checks", () => {
    expect(body.indexOf("staff_can_view_results")).toBeLessThan(body.indexOf("release_results_internal"));
  });
  it("app never calls release_results_internal", () => {
    expect(readFileSync("src/lib/cbt/results.ts", "utf8")).not.toContain("release_results_internal");
  });
});
