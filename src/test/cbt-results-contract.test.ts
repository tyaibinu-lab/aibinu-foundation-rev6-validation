// Gate 8D — Results & Release contract tests (mocked Supabase client).
// Prove the results layer only reads results through RLS, releases only via
// release_results, reviews only via my_attempt_review, never writes protected
// tables, never scores, and never sends organisation/actor ids.
import { readFileSync } from "node:fs";
import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { kind: string; table?: string; fn?: string; args?: unknown; payload?: unknown; select?: string; filters: unknown[][] };
const calls: Call[] = [];
const results: Record<string, { data: unknown; error: unknown }> = {};
const empty = { data: null, error: null };
function builder(call: Call) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "insert", "update", "delete", "upsert", "eq", "is", "in", "order", "single", "maybeSingle"]) {
    b[m] = (...a: unknown[]) => {
      if (["insert", "update", "delete", "upsert"].includes(m)) { call.kind = m; call.payload = a[0]; }
      else if (m === "select") call.select = a[0] as string;
      else call.filters.push([m, ...a]);
      return b;
    };
  }
  b["then"] = (r: (v: unknown) => unknown, j: (e: unknown) => unknown) => Promise.resolve(results[call.table ?? ""] ?? empty).then(r, j);
  return b;
}
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => { const c: Call = { kind: "select", table, filters: [] }; calls.push(c); return builder(c); },
    rpc: (fn: string, args?: unknown) => { calls.push({ kind: "rpc", fn, args, filters: [] }); return Promise.resolve(results[`rpc:${fn}`] ?? empty); },
  },
}));

const r = await import("@/lib/cbt/results");
const { routeTree } = await import("@/routeTree.gen");
const EXAM = "7b083255-42c8-47a5-a8cf-fdef2c0c4551";
const SRC = ["src/lib/cbt/results.ts", "src/routes/cbt.results.index.tsx", "src/routes/cbt.results.$examId.tsx", "src/routes/cbt.review.$examId.tsx"];
const src = (f: string) => readFileSync(f, "utf8");
beforeEach(() => { calls.length = 0; for (const k of Object.keys(results)) delete results[k]; });

describe("routes", () => {
  it.each(["/cbt/results", "/cbt/results/abc", "/cbt/review/abc"])("%s sits under the TenantGate /cbt layout", (p) => {
    const m = createRouter({ routeTree, context: { queryClient: new QueryClient() } }).matchRoutes(p);
    expect(m.at(-1)?.routeId).not.toBe(rootRouteId);
    expect(m.some((x) => x.routeId === "/cbt")).toBe(true);
    expect(m.at(-1)?.routeId).not.toBe("/cbt/$examId");
  });
  it("student review page uses the candidate shell, no staff controls", () => {
    expect(src("src/routes/cbt.review.$examId.tsx")).not.toMatch(/CbtShell|releaseResults|release_results|listExamResults/);
  });
});

describe("permissions", () => {
  it("reads result.read_all, result.read_class, result.release from has_permission", async () => {
    results["rpc:has_permission"] = { data: true, error: null };
    expect(await r.fetchResultAccess()).toEqual({ readAll: true, readClass: true, release: true });
    expect(calls.map((c) => (c.args as { perm: string }).perm)).toEqual(["result.read_all", "result.read_class", "result.release"]);
  });
  it("staff pages hide data and release without permission", () => {
    expect(src("src/routes/cbt.results.$examId.tsx")).toMatch(/if \(!canRead\) return .*NoResultAccess/);
    expect(src("src/routes/cbt.results.$examId.tsx")).toMatch(/access\.data\?\.release && \(/);
    expect(src("src/routes/cbt.results.index.tsx")).toMatch(/enabled: canRead/);
  });
  it("surfaces RLS denial as a permission message", () => {
    expect(r.describeResultError({ message: "permission denied for function release_results" })).toMatch(/do not have permission/);
  });
});

describe("release pathway", () => {
  it("releases only via release_results with exact Rev6 args", async () => {
    results["rpc:release_results"] = { data: 1, error: null };
    expect(await r.releaseResults(EXAM)).toBe(1);
    expect(calls).toEqual([{ kind: "rpc", fn: "release_results", args: { p_exam_id: EXAM, p_force: false }, filters: [] }]);
  });
  it("passes force only when explicitly requested", async () => {
    await r.releaseResults(EXAM, true);
    expect(calls[0]!.args).toEqual({ p_exam_id: EXAM, p_force: true });
  });
  it("propagates DB rejection (unmarked / no permission)", async () => {
    results["rpc:release_results"] = { data: null, error: { message: "Permission denied: result.release required" } };
    await expect(r.releaseResults(EXAM)).rejects.toMatchObject({ message: /result\.release/ });
  });
});

describe("staff reads", () => {
  it("reads results by exam through RLS and displays DB score values unchanged", async () => {
    results["results"] = { data: [{ id: "r1", attempt_id: "a1", exam_id: EXAM, student_id: "s1", score: "3.00", total_marks: "3.00", percentage: "100.00", grade: "A1", passed: true, marking_complete: true, released_at: null }], error: null };
    const out = await r.listExamResults(EXAM);
    expect(out[0]).toMatchObject({ score: "3.00", percentage: "100.00", grade: "A1", released_at: null });
    expect(calls[0]).toMatchObject({ table: "results", kind: "select" });
    expect(calls[0]!.filters).toContainEqual(["eq", "exam_id", EXAM]);
  });
});

describe("student review", () => {
  it("uses only my_attempt_review with the attempt id", async () => {
    results["rpc:my_attempt_review"] = { data: [], error: null };
    await r.getMyAttemptReview("a1");
    expect(calls).toEqual([{ kind: "rpc", fn: "my_attempt_review", args: { p_attempt_id: "a1" }, filters: [] }]);
  });
  it("propagates the unreleased / review-disabled refusal", async () => {
    results["rpc:my_attempt_review"] = { data: null, error: { message: "Results have not been released yet" } };
    await expect(r.getMyAttemptReview("a1")).rejects.toMatchObject({ message: /not been released/ });
  });
  it("lists only the DB-derived student's own attempts", async () => {
    await r.listMyAttemptsForExam(EXAM, "stu");
    expect(calls[0]!.filters).toContainEqual(["eq", "student_id", "stu"]);
  });
});

describe("security boundary (static)", () => {
  it.each(SRC)("%s: no protected writes or client scoring", (f) => {
    const s = src(f);
    expect(s).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    expect(s).not.toMatch(/mark_response|finalize_attempt|submit_attempt|start_attempt|save_response|grade_for|answer_matches|release_results_internal|publish_exam|close_exam/);
    expect(s).not.toMatch(/answer_key/);
    expect(s).not.toMatch(/organisation_id|x-organisation-id|created_by/);
    expect(s).not.toMatch(/reduce\(|\* 100|score\s*\/|\/\s*total_marks/);
  });
  it.each(SRC)("%s: no secrets, admin client or AI", (f) => {
    const s = src(f);
    expect(s).not.toMatch(/SERVICE_ROLE|sb_secret_|client\.server|supabaseAdmin|process\.env/);
    expect(s).not.toMatch(/enqueue_ai_job|ai_jobs|ai_content|LOVABLE_API_KEY|ai\.gateway/i);
  });
  it("is_correct/explanation only come from my_attempt_review, never from table selects", () => {
    const s = src("src/lib/cbt/results.ts");
    for (const m of s.matchAll(/\.select\("([^"]*)"\)/g)) expect(m[1]).not.toMatch(/is_correct|explanation|options|answer/);
  });
});
