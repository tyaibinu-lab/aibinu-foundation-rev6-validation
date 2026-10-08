// Gate 8E — Manual Marking contract tests (mocked Supabase client).
// Marks go only through mark_response; responses/results are never written;
// answer keys are never selected; no client scoring; no org/actor ids sent.
import { readFileSync } from "node:fs";
import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { kind: string; table?: string; fn?: string; args?: unknown; select?: string };
const calls: Call[] = [];
const results: Record<string, { data: unknown; error: unknown }> = {};
const empty = { data: null, error: null };
function builder(call: Call) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "insert", "update", "delete", "upsert", "eq", "in", "order"]) {
    b[m] = (...a: unknown[]) => { if (m === "select") call.select = a[0] as string; else if (m !== "eq" && m !== "in" && m !== "order") call.kind = m; return b; };
  }
  b["then"] = (r: (v: unknown) => unknown, j: (e: unknown) => unknown) => Promise.resolve(results[call.table ?? ""] ?? empty).then(r, j);
  return b;
}
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => { const c: Call = { kind: "select", table }; calls.push(c); return builder(c); },
    rpc: (fn: string, args?: unknown) => { calls.push({ kind: "rpc", fn, args }); return Promise.resolve(results[`rpc:${fn}`] ?? empty); },
  },
}));
const m = await import("@/lib/cbt/marking");
const { routeTree } = await import("@/routeTree.gen");
const SRC = ["src/lib/cbt/marking.ts", "src/routes/cbt.mark.$attemptId.tsx"];
const src = (f: string) => readFileSync(f, "utf8");
beforeEach(() => { calls.length = 0; for (const k of Object.keys(results)) delete results[k]; });

describe("marking", () => {
  it("/cbt/mark/:id sits under the TenantGate /cbt layout", () => {
    const r = createRouter({ routeTree, context: { queryClient: new QueryClient() } }).matchRoutes("/cbt/mark/abc");
    expect(r.at(-1)?.routeId).toBe("/cbt/mark/$attemptId");
    expect(r.some((x) => x.routeId === "/cbt")).toBe(true);
    expect(r.at(-1)?.routeId).not.toBe(rootRouteId);
  });
  it("checks result.mark via has_permission (UX only)", async () => {
    results["rpc:has_permission"] = { data: false, error: null };
    expect(await m.canMark()).toBe(false);
    expect(calls[0]).toMatchObject({ fn: "has_permission", args: { perm: "result.mark" } });
  });
  it("marks only via mark_response with exact Rev6 args", async () => {
    await m.markResponse("resp1", 3, "  Good  ");
    expect(calls).toEqual([{ kind: "rpc", fn: "mark_response", args: { p_response_id: "resp1", p_marks: 3, p_feedback: "Good" } }]);
  });
  it("sends null feedback when empty", async () => {
    await m.markResponse("resp1", 0, " ");
    expect((calls[0]!.args as Record<string, unknown>)["p_feedback"]).toBeNull();
  });
  it("propagates DB refusals (permission / student scope / range)", async () => {
    for (const msg of ["Permission denied: result.mark required", "Permission denied for this student", "Marks must be between 0 and 5"]) {
      results["rpc:mark_response"] = { data: null, error: { message: msg } };
      await expect(m.markResponse("r", 9, "")).rejects.toMatchObject({ message: msg });
    }
    expect(m.describeMarkingError({ message: "permission denied for table responses" })).toMatch(/do not have permission/);
  });
  it("validates marks range for UX", () => {
    expect(m.validateMarks(2, 5)).toBeNull();
    expect(m.validateMarks(-1, 5)).toMatch(/between 0 and 5/);
    expect(m.validateMarks(6, 5)).toMatch(/between 0 and 5/);
  });
  it("never selects answer keys or correctness", async () => {
    results["responses"] = { data: [{ id: "r", exam_question_id: "eq", answer: { text: "x" }, marking_status: "pending", marks_awarded: null, feedback: null, marked_at: null }], error: null };
    results["exam_questions"] = { data: [{ id: "eq", position: 1, marks: 5, question_version_id: "v" }], error: null };
    results["question_versions"] = { data: [{ id: "v", stem: "s", question_id: "q" }], error: null };
    results["questions"] = { data: [{ id: "q", type: "theory" }], error: null };
    const out = await m.listAttemptResponses("a");
    expect(out[0]).toMatchObject({ maxMarks: 5, markingStatus: "pending", type: "theory" });
    for (const c of calls) expect(c.select ?? "").not.toMatch(/answer_key|is_correct|explanation|options/);
    expect(calls.every((c) => c.kind === "select")).toBe(true);
  });
});

describe("marking security boundary (static)", () => {
  it.each(SRC)("%s: no protected writes, scoring or org/actor ids", (f) => {
    const s = src(f);
    expect(s).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    expect(s).not.toMatch(/score_attempt|finalize_attempt|release_results|submit_attempt|grade_for|answer_matches|publish_exam|close_exam/);
    expect(s).not.toMatch(/answer_key|organisation_id|x-organisation-id|marked_by|created_by/);
    expect(s).not.toMatch(/reduce\(|\* 100/);
  });
  it.each(SRC)("%s: no secrets, admin client or AI marking", (f) => {
    const s = src(f);
    expect(s).not.toMatch(/SERVICE_ROLE|sb_secret_|client\.server|supabaseAdmin|process\.env/);
    expect(s).not.toMatch(/enqueue_ai_job|ai_jobs|ai_content|LOVABLE_API_KEY|ai\.gateway/i);
  });
  it("marking UI is gated by result.mark before loading responses", () => {
    expect(src("src/routes/cbt.mark.$attemptId.tsx")).toMatch(/enabled: perm\.data === true/);
  });
});
