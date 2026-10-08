// Gate 8G-3 / P2 — exam administration is owner-scoped unless the caller has result.read_all.
// Live behaviour is proven by the Gate 8G-3 validation run; this locks the contract.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dir = "supabase/migrations";
const all = readdirSync(dir).map((f) => readFileSync(`${dir}/${f}`, "utf8"));
const body = (all.find((s) => s.includes("Gate 8G-3 / P2")) ?? "").replace(/\s+/g, " ");
const OWNER = "(SELECT has_permission('result.read_all')) OR (created_by IS NOT NULL AND created_by = (SELECT current_user_id()))";

describe("P2 exam ownership", () => {
  it("can_manage_exam requires exam.create, current org and (read_all or non-null owner)", () => {
    expect(body).toContain("CREATE OR REPLACE FUNCTION public.can_manage_exam(p_exam_id uuid)");
    expect(body).toContain("has_permission('exam.create') AND EXISTS");
    expect(body).toContain("e.organisation_id = current_org_id()");
    expect(body).toContain("has_permission('result.read_all') OR (e.created_by IS NOT NULL AND e.created_by = current_user_id())");
    expect(body).toMatch(/REVOKE ALL ON FUNCTION public\.can_manage_exam\(uuid\) FROM PUBLIC, anon/);
  });
  it.each(["exams_update", "exams_delete"])("%s is owner-scoped", (p) => {
    const seg = body.split(`CREATE POLICY ${p}`)[1]?.split("CREATE POLICY")[0] ?? "";
    expect(seg).toContain(OWNER);
  });
  it.each(["exam_questions_write", "exam_eligibility_write"])("%s uses can_manage_exam in USING and WITH CHECK", (p) => {
    const seg = body.split(`CREATE POLICY ${p}`)[1]?.split("CREATE POLICY")[0] ?? "";
    expect(seg.match(/public\.can_manage_exam\(exam_id\)/g)?.length).toBe(2);
  });
  it.each(["publish_exam", "close_exam"])("%s checks can_manage_exam", (f) => {
    const seg = body.split(`FUNCTION public.${f}(`)[1]?.split("$function$;")[0] ?? "";
    expect(seg).toContain("IF NOT can_manage_exam(p_exam_id) THEN");
    expect(seg).toContain("has_permission('exam.create')");
  });
  it("does not touch exams_insert, read policies, P1, P3 or audit", () => {
    expect(body).not.toMatch(/exams_insert|exams_read|_read ON|release_results|stamp_created_by|audit_|backfill|UPDATE public\.exams SET/i);
  });
  it("P1 and P3 remain in place", () => {
    expect(all.some((s) => s.includes("Gate 8G-1 / P1"))).toBe(true);
    expect(all.some((s) => s.includes("Gate 8G-2 / P3"))).toBe(true);
  });
});
