// CAS (migration 007) contract tests (mocked Supabase client).
// Prove the learning layer reads mastery only through learning_dashboard and RLS views,
// writes only through the CAS functions with exact arguments, never computes mastery,
// never writes CAS tables directly, edits only the teacher comment of a report, and that
// every route sits under the TenantGate /learning layout.
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

const cas = await import("@/lib/cas/api");
const { routeTree } = await import("@/routeTree.gen");
const STU = "4a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const SRC = [
  "src/lib/cas/api.ts", "src/components/cas/shared.tsx", "src/routes/learning.index.tsx",
  "src/routes/learning.student.$studentId.tsx", "src/routes/learning.reports.tsx",
];
const src = (p: string) => readFileSync(p, "utf8");
const rpcs = () => calls.filter((c) => c.kind === "rpc").map((c) => [c.fn, c.args]);
beforeEach(() => { calls.length = 0; for (const k of Object.keys(results)) delete results[k]; });

describe("routes", () => {
  it.each(["/learning", "/learning/student/abc", "/learning/reports"])("%s sits under the TenantGate /learning layout", (p) => {
    const m = createRouter({ routeTree, context: { queryClient: new QueryClient() } }).matchRoutes(p);
    expect(m.at(-1)?.routeId).not.toBe(rootRouteId);
    expect(m.some((x) => x.routeId === "/learning")).toBe(true);
  });
  it("the layout is the existing TenantGate, client-only", () => {
    expect(src("src/routes/learning.tsx")).toMatch(/component:\s*TenantGate/);
    expect(src("src/routes/learning.tsx")).toMatch(/ssr:\s*false/);
  });
});

describe("reads", () => {
  it("dashboard goes through learning_dashboard only (null = own record)", async () => {
    await cas.getLearningDashboard();
    await cas.getLearningDashboard(STU);
    expect(rpcs()).toEqual([["learning_dashboard", { p_student_id: null }], ["learning_dashboard", { p_student_id: STU }]]);
    expect(calls.filter((c) => c.kind !== "rpc")).toHaveLength(0);
  });
  it("class view reads the security_invoker view filtered by class", async () => {
    await cas.getClassMastery("class-1");
    expect(calls[0]).toMatchObject({ kind: "select", table: "class_mastery_summary" });
    expect(calls[0]!.filters[0]).toEqual(["eq", "class_id", "class-1"]);
  });
  it("access reads cas.manage, result.read_all, result.read_class", async () => {
    results["rpc:has_permission"] = { data: true, error: null };
    expect(await cas.fetchCasAccess()).toEqual({ manage: true, readAll: true, readClass: true, staff: true });
  });
});

describe("writes use the migration 007 functions with exact arguments", () => {
  it("intervention lifecycle", async () => {
    await cas.assignIntervention("i1", "2026-12-01");
    await cas.setInterventionStatus("i1", "completed");
    await cas.addIntervention({ studentId: STU, topicKey: "t1", type: "practice", title: "  Practise vectors ", dueOn: "" });
    await cas.markTaskDone("i2");
    await cas.dismissDiagnosis("d1", " already covered ");
    expect(rpcs()).toEqual([
      ["assign_intervention", { p_intervention_id: "i1", p_due_on: "2026-12-01", p_assignee: null }],
      ["set_intervention_status", { p_intervention_id: "i1", p_status: "completed" }],
      ["add_intervention", { p_student_id: STU, p_topic_key: "t1", p_type: "practice", p_title: "Practise vectors", p_description: null, p_note_id: null, p_due_on: null }],
      ["mark_intervention_done", { p_intervention_id: "i2" }],
      ["dismiss_diagnosis", { p_diagnosis_id: "d1", p_reason: "already covered" }],
    ]);
  });
  it("report lifecycle", async () => {
    results["rpc:draft_parent_reports_for_class"] = { data: 7, error: null };
    expect(await cas.draftReportsForClass("c1", "2026-09-01", "2026-12-15")).toBe(7);
    await cas.markReportSent("r1", "whatsapp");
    expect(rpcs()).toEqual([
      ["draft_parent_reports_for_class", { p_class_id: "c1", p_from: "2026-09-01", p_to: "2026-12-15" }],
      ["mark_report_sent", { p_report_id: "r1", p_channel: "whatsapp" }],
    ]);
  });
  it("approval changes only the teacher comment; released figures pass through untouched", async () => {
    const content = {
      period: { from: "2026-09-01", to: "2026-12-15" },
      assessments: [{ exam: "Mid-term", kind: "test", percentage: 64, grade: "B", date: "2026-10-20" }],
      average_percentage: 64, strengths: [], focus_areas: [{ topic: "Vectors", mastery: 0.42 }], support_tasks: [], teacher_comment: null,
    };
    await cas.approveReport("r1", content, "  Keep practising vectors. ");
    const sent = (calls[0]!.args as { p_content: typeof content }).p_content;
    expect(calls[0]).toMatchObject({ fn: "approve_parent_report", args: { p_report_id: "r1" } });
    expect({ ...sent, teacher_comment: null }).toEqual(content);
    expect(sent.teacher_comment).toBe("Keep practising vectors.");
  });
  it("no RPC carries an organisation id", async () => {
    await cas.assignIntervention("i1");
    await cas.draftReport(STU, "2026-09-01", "2026-12-15");
    for (const c of calls) expect(JSON.stringify(c.args ?? {})).not.toMatch(/organisation/);
  });
});

describe("validation", () => {
  it("rejects a reversed period", () => {
    expect(cas.validatePeriod("2026-12-15", "2026-09-01")).toHaveLength(1);
    expect(cas.validatePeriod("2026-09-01", "2026-12-15")).toHaveLength(0);
  });
  it("requires topic and title for a new task", () => {
    expect(cas.validateIntervention({ studentId: STU, topicKey: "", type: "note", title: "x" }).length).toBe(2);
  });
});

describe("source guarantees", () => {
  it("never writes CAS tables directly or computes mastery", () => {
    const forbidden = [
      /from\("(topic_mastery|mastery_snapshots|diagnoses|interventions|parent_reports|assessment_events|response_events|reassessments)"\)\s*\.(insert|update|upsert|delete)/,
      /\.(insert|update|upsert|delete)\(/,
      /recompute_topic_mastery|refresh_mastery_for_attempt|run_diagnosis|rebuild_mastery|build_report_content/,
    ];
    for (const p of SRC) for (const re of forbidden) expect({ p, re: String(re), hit: re.test(src(p)) }).toMatchObject({ hit: false });
  });
  it("family controls are limited to ticking off reading/practice tasks", () => {
    const page = src("src/routes/learning.student.$studentId.tsx");
    expect(page).toMatch(/!staffView && \(t\.type === "note" \|\| t\.type === "practice"\)/);
    expect(page).toMatch(/\{staffView && <Diagnoses/);
    expect(page).toMatch(/\{staffView && <AiReviews/);
  });
});
