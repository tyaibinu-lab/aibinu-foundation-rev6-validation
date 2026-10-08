// Gate 8G-2 / P3 — exams / exam_eligibility created_by is stamped by the database.
// Live behaviour is proven by the Gate 8G-2 validation run; this locks the contract.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dir = "supabase/migrations";
const all = readdirSync(dir).map((f) => readFileSync(`${dir}/${f}`, "utf8"));
const body = (all.find((s) => s.includes("Gate 8G-2 / P3")) ?? "").replace(/\s+/g, " ");

describe("P3 server-controlled provenance", () => {
  it("migration exists and only adds the stamp function + two triggers", () => {
    expect(body).toContain("CREATE OR REPLACE FUNCTION public.stamp_created_by()");
    expect(body).not.toMatch(/CREATE TABLE|ALTER TABLE|CREATE POLICY|DROP POLICY|role_permissions|release_results|audit_row_change/i);
  });
  it("stamps created_by from current_user_id() on client inserts", () => {
    expect(body).toContain("IF current_user IN ('anon', 'authenticated')");
    expect(body).toContain("NEW.created_by := current_user_id()");
  });
  it("client updates cannot rewrite created_by", () => {
    expect(body).toContain("NEW.created_by := OLD.created_by");
  });
  it("is attached to exams and exam_eligibility", () => {
    expect(body).toMatch(/trg_exams_stamp_created_by BEFORE INSERT OR UPDATE OF created_by ON public\.exams/);
    expect(body).toMatch(/trg_elig_stamp_created_by BEFORE INSERT OR UPDATE OF created_by ON public\.exam_eligibility/);
  });
  it("does not backfill historical rows", () => {
    expect(body).not.toMatch(/UPDATE public\.exams|UPDATE public\.exam_eligibility/);
  });
  it("P1 release_results hardening still present", () => {
    expect(all.some((s) => s.includes("Gate 8G-1 / P1") && s.includes("NOT staff_can_view_results(r.student_id)"))).toBe(true);
  });
});
