// UNIT-LEVEL CONTRACT TESTS with a mocked Supabase client. They prove the Question
// Bank layer calls the Rev6 contract exactly (tables, RPCs, explicit FK names) and
// never writes protected fields. Database enforcement (RLS, triggers, functions)
// is proven by the live validation run recorded in the Gate 6 report.
import { readFileSync, readdirSync } from "node:fs";
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
    if (name === "insert" || name === "update") { call.kind = name; call.payload = a[0]; }
    else if (name === "select") { if (typeof a[0] === "string") call.select = a[0]; }
    else if (name !== "single") call.filters.push([name, ...a]);
    return b;
  };
  for (const m of ["select", "insert", "update", "eq", "is", "in", "ilike", "order", "limit", "single"]) b[m] = chain(m);
  b["then"] = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(results[call.table ?? ""] ?? empty).then(res, rej);
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => { const c: Call = { kind: "select", table, filters: [] }; calls.push(c); return builder(c); },
    rpc: (fn: string, args?: unknown) => { calls.push({ kind: "rpc", fn, args, filters: [] }); return Promise.resolve(results[`rpc:${fn}`] ?? empty); },
  },
}));

const api = await import("@/lib/questionbank/api");
const perms = await import("@/lib/questionbank/permissions");
const { routeTree } = await import("@/routeTree.gen");

const ORG = "org-a", TEACHER = "u-teacher", REVIEWER = "u-reviewer";
const mcq = perms.toVersionPayload({
  type: "mcq", stem: "Solve x^2 - 5x + 6 = 0", explanation: "Factorise", marks: 2, difficulty: "medium", cognitiveLevel: "apply",
  acceptedAnswers: [], options: [{ key: "", text: "2 and 3", is_correct: true }, { key: "", text: "1 and 6", is_correct: false }],
});
const PROTECTED = ["status", "current_version_id", "version_no", "published_by"];

beforeEach(() => { calls.length = 0; for (const k of Object.keys(results)) delete results[k]; });

describe("Question Bank routes", () => {
  it.each(["/questionbank", "/questionbank/new", "/questionbank/review", "/questionbank/abc"])("matches %s", (path) => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes(path).at(-1)?.routeId).not.toBe(rootRouteId);
  });
});

describe("Question Bank contract", () => {
  it("creates a manual draft: questions then question_versions, no protected fields, source fixed to manual", async () => {
    results["questions"] = { data: { id: "q1" }, error: null };
    results["question_versions"] = { data: { id: "v1" }, error: null };
    await api.createQuestion({ orgId: ORG, userId: TEACHER, topicId: "t1", type: "mcq", version: mcq });
    const [q, v] = calls;
    expect(q).toMatchObject({ table: "questions", kind: "insert", payload: { organisation_id: ORG, topic_id: "t1", type: "mcq", source: "manual", created_by: TEACHER } });
    expect(v).toMatchObject({ table: "question_versions", kind: "insert", payload: { question_id: "q1", created_by: TEACHER, stem: mcq.stem } });
    for (const f of PROTECTED) { expect(q?.payload).not.toHaveProperty(f); expect(v?.payload).not.toHaveProperty(f); }
  });

  it("edits a draft without touching protected fields", async () => {
    await api.updateQuestionDraft("v1", mcq);
    expect(calls[0]).toMatchObject({ table: "question_versions", kind: "update", filters: [["eq", "id", "v1"]] });
    for (const f of PROTECTED) expect(calls[0]?.payload).not.toHaveProperty(f);
  });

  it("submits, publishes and unpublishes only through Rev6 functions", async () => {
    await api.submitQuestionVersion("v1");
    await api.publishQuestionVersion("v1", "organisation");
    await api.unpublishQuestion("q1");
    expect(calls.map((c) => [c.fn, c.args])).toEqual([
      ["submit_question_version", { p_version_id: "v1" }],
      ["publish_question_version", { p_version_id: "v1", p_visibility: "organisation" }],
      ["unpublish_question", { p_question_id: "q1" }],
    ]);
  });

  it.each(["approved", "changes_requested", "rejected"] as const)("records a %s review as a question_reviews insert only", async (decision) => {
    await api.reviewQuestionVersion({ orgId: ORG, reviewerId: REVIEWER, versionId: "v1", decision, comments: " ok " });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ table: "question_reviews", kind: "insert", payload: { question_version_id: "v1", reviewer_id: REVIEWER, decision, comments: "ok" } });
  });

  it("PGRST201 regression: queue query names the explicit question_versions -> questions FK", async () => {
    await api.listQuestionVersionsByStatus("in_review");
    expect(calls[0]?.select).toContain("questions!question_versions_question_id_organisation_id_fkey(");
    expect(calls[0]?.select).not.toMatch(/(^|[ ,])questions\(/);
  });

  it("no source file uses an ambiguous questions/question_versions embed", () => {
    const files = ["src/lib/questionbank/api.ts", ...readdirSync("src/routes").filter((f) => f.startsWith("questionbank")).map((f) => join("src/routes", f))];
    for (const f of files) expect(readFileSync(f, "utf8")).not.toMatch(/["'`][^"'`]*\b(questions|question_versions)\(/);
  });

  it("the list uses question_current, which carries no answer keys", async () => {
    await api.listQuestions({ search: "x" });
    expect(calls[0]?.table).toBe("question_current");
  });

  it("surfaces database refusals without bypassing them", async () => {
    results["question_reviews"] = { data: null, error: { message: "Authors cannot review their own work" } };
    await expect(api.reviewQuestionVersion({ orgId: ORG, reviewerId: TEACHER, versionId: "v1", decision: "approved", comments: "" })).rejects.toBeTruthy();
    expect(perms.describeQuestionError({ message: "Authors cannot review their own work" })).toMatch(/cannot review your own/);
    expect(perms.describeQuestionError({ message: "Only approved versions can be published (status: draft)" })).toMatch(/Only approved/);
    expect(perms.describeQuestionError({ message: "Question version x is approved and cannot be edited; create a new version" })).toMatch(/new version/);
  });

  it("client code never writes status, publications or exam scoring", () => {
    const src = readFileSync("src/lib/questionbank/api.ts", "utf8");
    expect(src).not.toMatch(/from\("question_publications"\)\.(insert|update)/);
    expect(src).not.toMatch(/status:\s*["']/);
    expect(src).not.toMatch(/exam_questions|responses|results|finalize_attempt|service_role|client\.server/);
    expect(src).not.toMatch(/source:\s*["']ai["']/);
  });
});

describe("Question Bank UX validation mirrors validate_question_version", () => {
  const base = { stem: "A valid stem", explanation: "", marks: 1, difficulty: "easy" as const, cognitiveLevel: "recall" as const, acceptedAnswers: [] };
  const o = (t: string, c: boolean) => ({ key: "", text: t, is_correct: c });
  it("mcq needs exactly one correct", () => {
    expect(perms.validateDraft({ ...base, type: "mcq", options: [o("a", true), o("b", true)] })).not.toHaveLength(0);
    expect(perms.validateDraft({ ...base, type: "mcq", options: [o("a", true), o("b", false)] })).toHaveLength(0);
  });
  it("true_false needs 2 options, multi_select at least one correct, fill_blank an answer, theory nothing extra", () => {
    expect(perms.validateDraft({ ...base, type: "true_false", options: [o("T", true)] })).not.toHaveLength(0);
    expect(perms.validateDraft({ ...base, type: "multi_select", options: [o("a", false), o("b", false)] })).not.toHaveLength(0);
    expect(perms.validateDraft({ ...base, type: "fill_blank", options: [] })).not.toHaveLength(0);
    expect(perms.validateDraft({ ...base, type: "theory", options: [] })).toHaveLength(0);
  });
  it("only the six database question types exist", () => {
    expect([...perms.QUESTION_TYPES]).toEqual(["mcq", "multi_select", "true_false", "fill_blank", "short_answer", "theory"]);
  });
  it("options get database keys and answer keys use the answer_matches shape", () => {
    expect(mcq.options?.map((x) => x.key)).toEqual(["a", "b"]);
    const fb = perms.toVersionPayload({ ...base, type: "fill_blank", options: [], acceptedAnswers: [" six ", ""] });
    expect(fb.answer_key).toEqual({ accepted: ["six"], case_sensitive: false });
    expect(fb.options).toBeNull();
  });
});
