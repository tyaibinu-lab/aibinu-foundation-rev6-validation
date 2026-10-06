// Gate 3 UNIT-LEVEL CONTRACT TESTS (mocked Supabase client). They verify the
// app uses only the Rev6 contract and surfaces DB refusals. DB/RLS enforcement
// itself is proven by the Rev6 SQL suites against the hosted database.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { kind: string; table?: string; fn?: string; args?: unknown; payload?: unknown; filters: unknown[][] };
const calls: Call[] = [];
const results: Record<string, { data: unknown; error: unknown }> = {};
const ok = { data: null, error: null };

function builder(call: Call) {
  const b: Record<string, unknown> = {};
  const chain = (name: string) => (...a: unknown[]) => {
    if (name === "insert" || name === "update") { call.kind = name; call.payload = a[0]; }
    else if (name !== "select" && name !== "single") call.filters.push([name, ...a]);
    return b;
  };
  for (const m of ["select", "insert", "update", "eq", "is", "in", "order", "limit", "single"]) b[m] = chain(m);
  b["then"] = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(results[call.table ?? ""] ?? ok).then(res, rej);
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => { const c: Call = { kind: "select", table, filters: [] }; calls.push(c); return builder(c); },
    rpc: (fn: string, args?: unknown) => { calls.push({ kind: "rpc", fn, args, filters: [] }); return Promise.resolve(results[`rpc:${fn}`] ?? ok); },
  },
}));

const api = await import("@/lib/notebank/api");
const { describeDbError, noteCapabilities, EMPTY_PERMISSIONS } = await import("@/lib/notebank/permissions");

beforeEach(() => { calls.length = 0; for (const k of Object.keys(results)) delete results[k]; });

describe("Gate 3 NoteBank workflow", () => {
  it("4: reviewer queue reads in_review versions via RLS-scoped select", async () => {
    results["note_versions"] = { data: [{ id: "v1", status: "in_review" }], error: null };
    const rows = await api.listVersionsByStatus("in_review");
    expect(rows).toHaveLength(1);
    expect(calls[0]).toMatchObject({ table: "note_versions", kind: "select" });
    expect(calls[0]?.filters).toContainEqual(["eq", "status", "in_review"]);
  });

  it("6: approver approval is a distinct note_reviews insert with decision=approved", async () => {
    await api.reviewVersion({ orgId: "o", reviewerId: "approver", versionId: "v1", decision: "approved", comments: "" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ table: "note_reviews", kind: "insert", payload: { decision: "approved", reviewer_id: "approver" } });
  });

  it("10: user with no NoteBank permissions gets no reviewer/approver/publisher capabilities, and DB refusals surface", async () => {
    expect(noteCapabilities(EMPTY_PERMISSIONS)).toEqual({ canAuthor: false, canReview: false, canApprove: false, canPublish: false });
    results["note_reviews"] = { data: null, error: { code: "42501", message: "new row violates row-level security policy" } };
    results["rpc:publish_note_version"] = { data: null, error: { message: "Permission denied: academic.notes.publish required" } };
    results["rpc:unpublish_note"] = { data: null, error: { message: "Permission denied: academic.notes.publish required" } };
    for (const d of ["approved", "changes_requested", "rejected"] as const) {
      await expect(api.reviewVersion({ orgId: "o", reviewerId: "u", versionId: "v1", decision: d, comments: "x" })).rejects.toSatisfy((e) => /refused/.test(describeDbError(e)));
    }
    await expect(api.publishVersion("v1", "organisation")).rejects.toBeTruthy();
    await expect(api.unpublishNote("n1")).rejects.toBeTruthy();
  });

  it("11: Org B rows are invisible to Org A (RLS returns empty / not found)", async () => {
    results["notes"] = { data: [], error: null };
    expect(await api.listNotes()).toEqual([]);
    results["notes"] = { data: null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" } };
    await expect(api.getNote("org-b-note")).rejects.toBeTruthy();
  });

  it("8/12: an AI-sourced draft cannot be published before approval", async () => {
    results["rpc:publish_note_version"] = { data: null, error: { message: "Only approved versions can be published (status: draft)" } };
    await expect(api.publishVersion("ai-ver", "organisation")).rejects.toSatisfy((e) => /approved/.test(describeDbError(e)));
  });

  it("12: client never writes status or source; AI provenance is DB-owned", async () => {
    results["notes"] = { data: { id: "n1" }, error: null };
    results["note_versions"] = { data: { id: "v1" }, error: null };
    await api.createNote({ orgId: "o", userId: "t", topicId: "tp", title: "T", body: "B" });
    await api.createVersion({ orgId: "o", userId: "t", noteId: "n1", body: "B2" });
    await api.updateDraft("v1", { body: "B3" });
    for (const c of calls) {
      expect(c.payload).not.toHaveProperty("status");
      expect(c.payload).not.toHaveProperty("source");
      expect(c.payload).not.toHaveProperty("current_version_id");
    }
  });

  it("12: app source has no AI auto-publish path and no direct status writes", () => {
    const src = ["lib/notebank/api.ts", "routes/notebank.$noteId.tsx", "routes/notebank.index.tsx", "routes/notebank.review.tsx"]
      .map((f) => readFileSync(join(process.cwd(), "src", f), "utf8")).join("\n");
    expect(src).not.toMatch(/complete_ai_job|claim_ai_job|note_publications/);
    expect(src).not.toMatch(/status\s*:\s*["'](approved|published|in_review)["']\s*[,}]/);
  });
});
