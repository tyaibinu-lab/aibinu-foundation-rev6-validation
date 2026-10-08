// Gate 8G-4 / P4 — CBT governance actions write to the existing append-only audit_events.
// Live behaviour is proven by the Gate 8G-4 validation run; this locks the contract.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dir = "supabase/migrations";
const all = readdirSync(dir).map((f) => readFileSync(`${dir}/${f}`, "utf8"));
const body = (all.find((s) => s.includes("Gate 8G-4 / P4")) ?? "").replace(/\s+/g, " ");

describe("P4 CBT audit trail", () => {
  it("writes into the existing audit_events table via audit_redact, attributed to current_user_id()", () => {
    expect(body).toContain("INSERT INTO public.audit_events");
    expect(body).toContain("public.current_user_id()");
    expect(body).toContain("public.audit_redact(v_before), public.audit_redact(v_after)");
    expect(body).toContain("NEW.organisation_id");
    expect(body).not.toMatch(/CREATE TABLE/i);
  });
  it("trigger function is not callable by clients", () => {
    expect(body).toMatch(/REVOKE ALL ON FUNCTION public\.audit_cbt_event\(\) FROM PUBLIC, anon, authenticated/);
  });
  it("exam publish/close only on real status transitions", () => {
    expect(body).toContain("AFTER UPDATE OF status ON public.exams");
    expect(body).toContain("WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('published', 'closed'))");
    expect(body).toContain("'exam.' || NEW.status::text");
  });
  it("result release only on first release, without score/grade", () => {
    expect(body).toContain("WHEN (OLD.released_at IS NULL AND NEW.released_at IS NOT NULL)");
    expect(body).toContain("'result.released'");
    const seg = (body.split("'result.released'")[1] ?? "").split("ELSIF")[0] ?? "";
    expect(seg).not.toMatch(/score|grade|percentage/);
  });
  it("manual marking audited with before/after marks, never answer or feedback text", () => {
    expect(body).toContain("'response.marked'");
    expect(body).toContain("NEW.marking_status = 'marked'");
    expect(body).toContain("'has_feedback', NEW.feedback IS NOT NULL");
    expect(body).not.toMatch(/'feedback', |NEW\.answer|OLD\.answer/);
  });
  it("does not modify P1/P2/P3 or audit_redact", () => {
    expect(body).not.toMatch(/release_results|can_manage_exam|stamp_created_by|publish_exam|close_exam|mark_response|FUNCTION public\.audit_redact|POLICY/);
  });
});
