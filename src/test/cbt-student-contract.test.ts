// Gate 8C Phase 2 — CBT Student Taking contract tests (mocked Supabase client).
// Prove the student layer calls only Rev6 RPCs, never writes attempts/responses/results,
// never reads or exposes answer keys, never scores, and never sends identity/org ids.
// Database enforcement is proven by the live validation run in the Phase 2 report.
import { readFileSync } from "node:fs";
import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { kind: string; table?: string; fn?: string; args?: unknown };
const calls: Call[] = [];
const results: Record<string, { data: unknown; error: unknown }> = {};
const empty = { data: null, error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => { calls.push({ kind: "from", table }); throw new Error("student layer must not use table access"); },
    rpc: (fn: string, args?: unknown) => { calls.push({ kind: "rpc", fn, args }); return Promise.resolve(results[fn] ?? empty); },
  },
}));

const s = await import("@/lib/cbt/student");
const { routeTree } = await import("@/routeTree.gen");

const EXAM = "7b083255-42c8-47a5-a8cf-fdef2c0c4551";
const ATT = "att-1";
const STUDENT_SRC = ["src/lib/cbt/student.ts", "src/components/cbt/student.tsx", "src/routes/cbt.my.tsx", "src/routes/cbt.take.$attemptId.tsx"];
const src = (f: string) => readFileSync(f, "utf8");

beforeEach(() => { calls.length = 0; for (const k of Object.keys(results)) delete results[k]; localStorage.clear(); });

describe("routes", () => {
  it.each(["/cbt/my", "/cbt/take/abc"])("matches %s under the TenantGate /cbt layout", (path) => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const m = router.matchRoutes(path);
    expect(m.at(-1)?.routeId).not.toBe(rootRouteId);
    expect(m.some((r) => r.routeId === "/cbt")).toBe(true);
  });
  it("candidate pages show no staff/admin controls", () => {
    for (const f of STUDENT_SRC.slice(1)) {
      expect(src(f)).not.toMatch(/CbtShell|publishExam|closeExam|\/cbt\/new|Publish exam|Close exam|questionbank/);
    }
  });
  it("staff admin pages hide data and New exam for accounts without exam.create", () => {
    expect(src("src/routes/cbt.index.tsx")).toMatch(/enabled: access\.canCreate/);
    expect(src("src/routes/cbt.$examId.tsx")).toMatch(/!access\.canCreate\) return .*StaffOnly/);
    expect(src("src/components/cbt/shared.tsx")).toMatch(/\{staff && <Link to="\/cbt\/new"/);
  });
});

describe("discovery and eligibility", () => {
  it("lists exams only via available_exams() with no caller arguments", async () => {
    results["available_exams"] = { data: [{ exam_id: EXAM, title: "[Gate8B UAT] Quadratics Check", open_attempt_id: null }], error: null };
    const out = await s.listAvailableExams();
    expect(out[0]?.exam_id).toBe(EXAM);
    expect(calls).toEqual([{ kind: "rpc", fn: "available_exams", args: undefined }]);
  });
  it("access comes from has_permission('exam.take') and current_student_id()", async () => {
    results["has_permission"] = { data: true, error: null };
    results["current_student_id"] = { data: "stu", error: null };
    expect(await s.fetchStudentAccess()).toEqual({ canTake: true, studentId: "stu" });
    results["current_student_id"] = { data: null, error: null };
    expect((await s.fetchStudentAccess()).studentId).toBeNull();
  });
});

describe("start / resume", () => {
  it("starts or resumes with only the exam id (no student/org/deadline from client)", async () => {
    results["start_attempt"] = { data: ATT, error: null };
    expect(await s.startOrResumeAttempt(EXAM)).toBe(ATT);
    expect(calls).toEqual([{ kind: "rpc", fn: "start_attempt", args: { p_exam_id: EXAM } }]);
  });
  it.each(["You are not eligible for this exam", "This exam has closed", "No attempts left for this exam", "This exam has not opened yet"])(
    "surfaces DB refusal: %s", async (msg) => {
      results["start_attempt"] = { data: null, error: { message: msg } };
      await expect(s.startOrResumeAttempt(EXAM)).rejects.toMatchObject({ message: msg });
    });
  it("unsent local answers survive a reload and are kept per attempt", () => {
    s.writePending(ATT, { q1: { selected: ["B"] } });
    expect(s.readPending(ATT)).toEqual({ q1: { selected: ["B"] } });
    expect(s.readPending("other")).toEqual({});
    s.writePending(ATT, {});
    expect(localStorage.getItem(`aibinu.cbt.pending.${ATT}`)).toBeNull();
  });
});

describe("paper secrecy", () => {
  it("paper comes only from get_attempt_paper and the client never asks for answer data", async () => {
    results["get_attempt_paper"] = { data: { status: "in_progress", questions: [] }, error: null };
    await s.getPaper(ATT);
    expect(calls).toEqual([{ kind: "rpc", fn: "get_attempt_paper", args: { p_attempt_id: ATT } }]);
  });
  it.each(STUDENT_SRC)("%s never references answer keys, correctness or explanations", (f) => {
    expect(src(f)).not.toMatch(/answer_key|is_correct|explanation|my_attempt_review/);
  });
});

describe("response saving", () => {
  it("saves via save_response with the DB answer shape", async () => {
    results["save_response"] = { data: "saved", error: null };
    expect(await s.saveAnswer(ATT, "eq1", { selected: ["B"] })).toBe("saved");
    expect(calls).toEqual([{ kind: "rpc", fn: "save_response", args: { p_attempt_id: ATT, p_exam_question_id: "eq1", p_answer: { selected: ["B"] }, p_flagged: false } }]);
  });
  it("builds answers: objective -> {selected}, text -> {text}, blank -> null", () => {
    expect(s.toAnswer("mcq", ["B"])).toEqual({ selected: ["B"] });
    expect(s.toAnswer("multi_select", ["A", "C", "A"])).toEqual({ selected: ["A", "C"] });
    expect(s.toAnswer("mcq", [])).toBeNull();
    expect(s.toAnswer("short_answer", " x=3 ")).toEqual({ text: " x=3 " });
    expect(s.toAnswer("theory", "   ")).toBeNull();
  });
  it("reports server expiry rather than hiding it", async () => {
    results["save_response"] = { data: "expired", error: null };
    expect(await s.saveAnswer(ATT, "eq1", null)).toBe("expired");
  });
  it("retries with capped backoff", () => {
    expect([0, 1, 2, 3, 10].map(s.retryDelay)).toEqual([1000, 2000, 4000, 8000, 15000]);
  });
});

describe("submission and timing", () => {
  it("submits only via submit_attempt and shows the server's result (null until released)", async () => {
    results["submit_attempt"] = { data: { status: "submitted", result: null }, error: null };
    expect(await s.submitAttempt(ATT)).toEqual({ status: "submitted", result: null });
    expect(calls).toEqual([{ kind: "rpc", fn: "submit_attempt", args: { p_attempt_id: ATT } }]);
  });
  it("countdown is anchored to server time, so a fast device clock cannot add time", () => {
    const deadline = "2026-10-08T10:20:00.000Z", serverNow = "2026-10-08T10:00:00.000Z";
    const fetchedAt = Date.parse("2026-10-08T09:00:00.000Z"); // device clock 1h behind
    expect(s.remainingMs(deadline, serverNow, fetchedAt, fetchedAt)).toBe(20 * 60_000);
    expect(s.remainingMs(deadline, serverNow, fetchedAt, fetchedAt + 21 * 60_000)).toBe(0);
    expect(s.fmtCountdown(61_000)).toBe("01:01");
  });
  it("the take page delegates expiry to the server (auto-submit calls submit_attempt)", () => {
    const f = src("src/routes/cbt.take.$attemptId.tsx");
    expect(f).toMatch(/remaining === 0 && !done\) void finish\(\)/);
    expect(f).toMatch(/submitAttempt\(attemptId\)/);
  });
  it("results come from results_for_student with the DB student id and only released rows", async () => {
    results["results_for_student"] = { data: [{ exam_id: EXAM, released_at: "x" }, { exam_id: "y", released_at: null }], error: null };
    expect((await s.listMyResults("stu")).map((r) => r.exam_id)).toEqual([EXAM]);
    expect(src("src/routes/cbt.my.tsx")).toMatch(/listMyResults\(access\.studentId!\)/);
  });
});

describe("security boundary (static)", () => {
  it.each(STUDENT_SRC)("%s: no direct table writes, scoring or staff RPCs", (f) => {
    const c = src(f);
    expect(c).not.toMatch(/\.from\(/);
    expect(c).not.toMatch(/finalize_attempt|score_attempt|mark_response|release_results|grade_for|answer_matches|publish_exam|close_exam/);
    expect(c).not.toMatch(/organisation_id|x-organisation-id|p_student_id:(?!\s*studentId\b)/);
  });
  it.each(STUDENT_SRC)("%s: no secrets, admin client or AI runtime", (f) => {
    const c = src(f);
    expect(c).not.toMatch(/SERVICE_ROLE|sb_secret_|client\.server|supabaseAdmin|process\.env/);
    expect(c).not.toMatch(/enqueue_ai_job|ai_jobs|ai_content|LOVABLE_API_KEY|ai\.gateway/i);
  });
});
