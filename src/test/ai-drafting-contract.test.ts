// AI drafting contract tests (mocked Supabase client).
// Prove the browser only ENQUEUES jobs through the governed request functions with exact
// arguments and a fresh idempotency key per request, never calls a provider or a worker
// function, never reads prompt templates, never writes AI tables, and never publishes.
import { readFileSync } from "node:fs";
import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { kind: string; table?: string; fn?: string; args?: unknown; payload?: unknown; filters: unknown[][] };
const calls: Call[] = [];
const results: Record<string, { data: unknown; error: unknown }> = {};
const empty = { data: null, error: null };
function builder(call: Call) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "insert", "update", "delete", "upsert", "eq", "is", "in", "order", "limit", "single", "maybeSingle"]) {
    b[m] = (...a: unknown[]) => {
      if (["insert", "update", "delete", "upsert"].includes(m)) { call.kind = m; call.payload = a[0]; }
      else if (m !== "select") call.filters.push([m, ...a]);
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

const ai = await import("@/lib/ai/api");
const { routeTree } = await import("@/routeTree.gen");
const TOPIC = "0f9e8d7c-6b5a-4c3d-8e2f-1a0b9c8d7e6f";
const SRC = ["src/lib/ai/api.ts", "src/components/ai/shared.tsx", "src/routes/ai.index.tsx", "src/routes/ai.admin.tsx"];
const src = (p: string) => readFileSync(p, "utf8");
const rpcs = () => calls.filter((c) => c.kind === "rpc");
beforeEach(() => { calls.length = 0; for (const k of Object.keys(results)) delete results[k]; });

describe("routes", () => {
  it.each(["/ai", "/ai/admin"])("%s sits under the TenantGate /ai layout", (p) => {
    const m = createRouter({ routeTree, context: { queryClient: new QueryClient() } }).matchRoutes(p);
    expect(m.at(-1)?.routeId).not.toBe(rootRouteId);
    expect(m.some((x) => x.routeId === "/ai")).toBe(true);
  });
});

describe("requests enqueue through the governed functions", () => {
  it("request_ai_note with exact arguments", async () => {
    await ai.requestAiNote({ topicId: TOPIC, style: "exam_focused", instructions: "  WAEC style " }, "ui:k1");
    expect(rpcs()).toEqual([{ kind: "rpc", fn: "request_ai_note", filters: [], args: { p_topic_id: TOPIC, p_style: "exam_focused", p_instructions: "WAEC style", p_idempotency_key: "ui:k1" } }]);
  });
  it("request_ai_questions with exact arguments", async () => {
    await ai.requestAiQuestions({ topicId: TOPIC, count: 5, type: "mcq", difficulty: "hard", cognitive: "analyse", instructions: "" }, "ui:k2");
    expect(rpcs()[0]!.args).toEqual({ p_topic_id: TOPIC, p_count: 5, p_type: "mcq", p_difficulty: "hard", p_cognitive: "analyse", p_instructions: null, p_idempotency_key: "ui:k2" });
  });
  it("each request gets a fresh idempotency key by default", async () => {
    await ai.requestAiNote({ topicId: TOPIC, style: "exam_focused" });
    await ai.requestAiNote({ topicId: TOPIC, style: "exam_focused" });
    const [a, b] = rpcs().map((c) => (c.args as { p_idempotency_key: string }).p_idempotency_key);
    expect(a).toMatch(/^ui:/);
    expect(a).not.toBe(b);
  });
  it("CAS-linked requests and decisions", async () => {
    await ai.requestStudentReview("s1", "ui:k3");
    await ai.requestDiagnosisExplanation("d1");
    await ai.requestReportComment("r1");
    await ai.cancelJob("j1", " not needed ");
    await ai.decideJob("j2", true);
    await ai.reviewDiagnosisNarrative("c1", true, " edited ");
    await ai.reviewStudentReview("x1", false);
    expect(rpcs().map((c) => [c.fn, c.args])).toEqual([
      ["request_ai_student_review", { p_student_id: "s1", p_idempotency_key: "ui:k3" }],
      ["request_ai_diagnosis_explanation", { p_diagnosis_id: "d1" }],
      ["request_ai_report_comment", { p_report_id: "r1" }],
      ["cancel_ai_job", { p_job_id: "j1", p_reason: "not needed" }],
      ["approve_ai_job", { p_job_id: "j2", p_approve: true, p_reason: null }],
      ["review_ai_diagnosis_narrative", { p_content_id: "c1", p_accept: true, p_edited_text: "edited" }],
      ["review_ai_diagnostic", { p_id: "x1", p_accept: false }],
    ]);
  });
  it("validates batch size and instruction length before calling the database", () => {
    expect(ai.validateQuestionRequest({ topicId: TOPIC, count: 21, type: "mcq", difficulty: "easy", cognitive: "recall" })).toHaveLength(1);
    expect(ai.validateInstructions("x".repeat(1001))).toHaveLength(1);
  });
});

describe("errors", () => {
  it("maps governance refusals to plain messages", () => {
    expect(ai.describeAiError({ message: "ai_disabled", details: "AI is switched off platform-wide" })).toMatch(/switched off/);
    expect(ai.describeAiError({ message: "limit_exceeded" })).toMatch(/limit/);
    expect(ai.describeAiError({ message: "permission_denied" })).toMatch(/own request/);
  });
});

describe("source guarantees", () => {
  it("no provider calls, worker functions, prompt reads, AI table writes or publishing", () => {
    const forbidden = [
      /\bfetch\(|api\.openai|api\.anthropic|generativelanguage|OPENAI|ANTHROPIC/i,
      /claim_ai_job|complete_ai_job|fail_ai_job|enqueue_ai_job|ai_credit_(reserve|settle|release|adjust|refund|monthly)|ai_set_kill_switch/,
      /ai_prompt_templates|ai_platform_settings/,
      /\.(insert|update|upsert|delete)\(/,
      /publish_note_version|publish_question_version/,
    ];
    for (const p of SRC) for (const re of forbidden) expect({ p, re: String(re), hit: re.test(src(p)) }).toMatchObject({ hit: false });
  });
  it("organisation credit balance is only queried for ai.manage", () => {
    expect(src("src/routes/ai.admin.tsx")).toMatch(/queryFn: getCreditBalance, retry: false, enabled: access\.manage/);
  });
});
