// Gate 8C Phase 1 — CBT Exam Administration contract tests (mocked Supabase client).
// They prove the CBT layer calls only the Rev6 contract, never writes protected
// lifecycle fields, never trusts caller-supplied organisation/actor ids, and never
// scores. Database enforcement is proven by the live validation run in the report.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { kind: string; table?: string; fn?: string; args?: unknown; payload?: unknown; select?: string; filters: [string, ...unknown[]][] };
const calls: Call[] = [];
const results: Record<string, { data: unknown; error: unknown }> = {};
const empty = { data: null, error: null };

function builder(call: Call) {
  const b: Record<string, unknown> = {};
  const chain = (name: string) => (...a: unknown[]) => {
    if (name === "insert" || name === "update" || name === "delete") { call.kind = name; call.payload = a[0]; }
    else if (name === "select") { if (typeof a[0] === "string") call.select = a[0]; }
    else if (name !== "single" && name !== "maybeSingle") call.filters.push([name, ...a]);
    return b;
  };
  for (const m of ["select", "insert", "update", "delete", "eq", "is", "in", "order", "limit", "single", "maybeSingle"]) b[m] = chain(m);
  b["then"] = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(results[`${call.kind}:${call.table}`] ?? results[call.table ?? ""] ?? empty).then(res, rej);
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => { const c: Call = { kind: "select", table, filters: [] }; calls.push(c); return builder(c); },
    rpc: (fn: string, args?: unknown) => { calls.push({ kind: "rpc", fn, args, filters: [] }); return Promise.resolve(results[`rpc:${fn}`] ?? empty); },
  },
}));

const api = await import("@/lib/cbt/api");
const { routeTree } = await import("@/routeTree.gen");

const DB_ORG = "514be2cb-54ba-435b-a4cb-505baf0d0a47";
const UAT_VERSIONS = [
  "e366eeae-9946-45ed-8e0b-4789c3356946",
  "c8878c5a-124a-4460-a9f5-e86711cbaa04",
  "9f524cb0-4893-4b9b-9bbe-2767e192e89c",
];
const UAT_SS2 = "a6b5c5bd-0821-45d1-af44-ac5c9649d304";
const input = (o: Partial<import("@/lib/cbt/api").ExamDraftInput> = {}) => ({
  title: "[Gate8B UAT] Quadratics Check", kind: "test" as const, subjectId: "subj", academicSessionId: "sess", instructions: "",
  opensAt: "2026-10-08T10:00:00.000Z", closesAt: "2026-10-15T10:00:00.000Z", durationMin: 20, hardClose: true,
  attemptsAllowed: 1, attemptPolicy: "best" as const, shuffleQuestions: false, shuffleOptions: false, passMarkPct: 50,
  releasePolicy: "manual" as const, allowReview: true, requiresFeesCleared: false, ...o,
});

beforeEach(() => { calls.length = 0; for (const k of Object.keys(results)) delete results[k]; });

describe("CBT routes", () => {
  it.each(["/cbt", "/cbt/new", "/cbt/abc"])("matches %s", (path) => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes(path).at(-1)?.routeId).not.toBe(rootRouteId);
  });
  it("protects /cbt with the shared TenantGate on a client-only layout", () => {
    const src = readFileSync("src/routes/cbt.tsx", "utf8");
    expect(src).toContain("ssr: false");
    expect(src).toContain("component: TenantGate");
  });
});

describe("Publisher exam creation", () => {
  it("creates a draft with organisation from current_org_id() and no protected/actor fields", async () => {
    results["rpc:current_org_id"] = { data: DB_ORG, error: null };
    results["insert:exams"] = { data: { id: "ex1" }, error: null };
    await expect(api.createExamDraft(input())).resolves.toEqual({ id: "ex1" });
    const ins = calls.find((c) => c.kind === "insert" && c.table === "exams")!;
    const p = ins.payload as Record<string, unknown>;
    expect(p["organisation_id"]).toBe(DB_ORG);
    for (const f of api.EXAM_PROTECTED_FIELDS) expect(p).not.toHaveProperty(f);
    expect(calls.findIndex((c) => c.fn === "current_org_id")).toBeLessThan(calls.indexOf(ins));
  });
  it("refuses to create without a DB-validated organisation (forged/missing context)", async () => {
    results["rpc:current_org_id"] = { data: null, error: null };
    await expect(api.createExamDraft(input())).rejects.toThrow(/organisation/i);
    expect(calls.some((c) => c.kind === "insert")).toBe(false);
  });
  it("toExamInsert has no parameter for created_by and ignores caller extras", () => {
    const p = api.toExamInsert({ ...input(), created_by: "attacker", status: "published", total_marks: 99 } as never, DB_ORG);
    expect(p).not.toHaveProperty("created_by");
    expect(p).not.toHaveProperty("status");
    expect(p).not.toHaveProperty("total_marks");
  });
  it("validates required fields and schedule", () => {
    expect(api.validateExamDraft(input())).toEqual([]);
    expect(api.validateExamDraft(input({ title: " " }))).toContain("Title is required.");
    expect(api.validateExamDraft(input({ closesAt: "2026-10-01T00:00:00.000Z" }))).toContain("Closing time must be after opening time.");
    expect(api.validateExamDraft(input({ durationMin: 0 }))).toContain("Duration must be at least 1 minute.");
  });
  it("draft updates never send status, total_marks, created_by or organisation_id", async () => {
    await api.updateExamDraft("ex1", input());
    const up = calls.find((c) => c.kind === "update")!;
    for (const f of [...api.EXAM_PROTECTED_FIELDS, "organisation_id"]) expect(up.payload).not.toHaveProperty(f);
    expect(up.filters).toContainEqual(["eq", "status", "draft"]);
  });
});

describe("Unauthorized denial", () => {
  it("surfaces the database RLS rejection unchanged in meaning", async () => {
    results["rpc:current_org_id"] = { data: DB_ORG, error: null };
    results["insert:exams"] = { data: null, error: { message: "new row violates row-level security policy for table \"exams\"" } };
    await expect(api.createExamDraft(input())).rejects.toMatchObject({ message: expect.stringMatching(/row-level security/) });
    expect(api.describeCbtError({ message: "permission denied for table exams" })).toMatch(/do not have permission/);
  });
  it("New exam visibility is derived from has_permission('exam.create')", async () => {
    results["rpc:has_permission"] = { data: false, error: null };
    expect(await api.canCreateExams()).toBe(false);
    expect(calls[0]).toMatchObject({ fn: "has_permission", args: { perm: "exam.create" } });
  });
});

describe("Question assembly", () => {
  it("lists only published versions via the explicit QB FK and never selects answer data", async () => {
    results["question_versions"] = { data: [
      { id: UAT_VERSIONS[0], question_id: "q1", stem: "s", marks: "1.00", difficulty: "easy", cognitive_level: "apply", status: "published", questions: { type: "mcq", topic_id: "t" } },
      { id: "draft-v", question_id: "q9", stem: "d", marks: 1, difficulty: "easy", cognitive_level: "apply", status: "draft", questions: null },
    ], error: null };
    const out = await api.listPublishedVersions();
    expect(out.map((o) => o.versionId)).toEqual([UAT_VERSIONS[0]]);
    const c = calls[0]!;
    expect(c.select).toContain("questions!question_versions_question_id_organisation_id_fkey(");
    expect(c.select).not.toMatch(/answer_key|options|is_correct|explanation/);
    expect(c.filters).toContainEqual(["eq", "status", "published"]);
  });
  it.each(UAT_VERSIONS)("pins existing published UAT version %s exactly, without marks/topic from the client", async (vid) => {
    results["rpc:current_org_id"] = { data: DB_ORG, error: null };
    await api.addExamQuestion("ex1", vid, 1);
    const ins = calls.find((c) => c.kind === "insert" && c.table === "exam_questions")!;
    expect(ins.payload).toEqual({ organisation_id: DB_ORG, exam_id: "ex1", question_version_id: vid, position: 1 });
  });
  it("never creates or edits question versions from the CBT layer", () => {
    const src = readFileSync("src/lib/cbt/api.ts", "utf8");
    expect(src).not.toMatch(/from\("question_versions"\)\s*\.(insert|update|delete)/);
    expect(src).not.toMatch(/from\("questions"\)/);
    expect(src).not.toMatch(/submit_question_version|publish_question_version/);
  });
});

describe("Class eligibility", () => {
  it("inserts a class-level row (class_id set, student_id null) for UAT SS2 A", async () => {
    results["rpc:current_org_id"] = { data: DB_ORG, error: null };
    await api.addClassEligibility("ex1", UAT_SS2, []);
    const ins = calls.find((c) => c.kind === "insert" && c.table === "exam_eligibility")!;
    expect(ins.payload).toEqual({ organisation_id: DB_ORG, exam_id: "ex1", class_id: UAT_SS2, student_id: null });
    expect(ins.payload).not.toHaveProperty("user_id");
  });
  it("prevents duplicate class eligibility", async () => {
    await expect(api.addClassEligibility("ex1", UAT_SS2, [{ id: "e", classId: UAT_SS2, studentId: null, isBlocked: false, className: "UAT SS2 A" }])).rejects.toThrow(/already eligible/);
    expect(calls.some((c) => c.kind === "insert")).toBe(false);
  });
});

describe("Lifecycle", () => {
  it("publishes only through publish_exam", async () => {
    await api.publishExam("ex1");
    expect(calls).toEqual([{ kind: "rpc", fn: "publish_exam", args: { p_exam_id: "ex1" }, filters: [] }]);
  });
  it("closes only through close_exam", async () => {
    await api.closeExam("ex1");
    expect(calls).toEqual([{ kind: "rpc", fn: "close_exam", args: { p_exam_id: "ex1" }, filters: [] }]);
  });
  it("propagates publish_exam rejection from the database", async () => {
    results["rpc:publish_exam"] = { data: null, error: { message: "Exam has no eligible students or classes" } };
    await expect(api.publishExam("ex1")).rejects.toMatchObject({ message: expect.stringContaining("eligible") });
  });
});

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : [p]; });
}
const cbtSources = [...files("src/lib/cbt"), ...files("src/components/cbt"), ...files("src/routes").filter((f) => /routes\/cbt/.test(f))];

describe("CBT security boundary (static)", () => {
  it.each(cbtSources)("%s: no scoring, attempt, result or student-taking calls", (f) => {
    const s = readFileSync(f, "utf8");
    expect(s).not.toMatch(/mark_response|finalize_attempt|submit_attempt|start_attempt|save_response|get_attempt_paper|release_results|grade_for|answer_matches/);
    expect(s).not.toMatch(/from\("(attempts|responses|results)"\)/);
    expect(s).not.toMatch(/is_correct|answer_key/);
  });
  it.each(cbtSources)("%s: no secret, admin client or AI runtime", (f) => {
    const s = readFileSync(f, "utf8");
    expect(s).not.toMatch(/SERVICE_ROLE|sb_secret_|client\.server|supabaseAdmin|process\.env/);
    expect(s).not.toMatch(/enqueue_ai_job|ai_jobs|ai_content|LOVABLE_API_KEY|ai\.gateway/i);
  });
  it.each(cbtSources)("%s: no unnamed question_versions -> questions embed", (f) => {
    const s = readFileSync(f, "utf8");
    expect(s).not.toMatch(/[,(]\s*questions\s*\(/);
  });
  it("does not build student-taking routes in Phase 1", () => {
    expect(readdirSync("src/routes").filter((f) => /^cbt\..*(take|attempt|result)/.test(f))).toEqual([]);
  });
});
