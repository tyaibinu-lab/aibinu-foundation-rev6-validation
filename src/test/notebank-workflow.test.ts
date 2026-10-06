// UNIT-LEVEL CONTRACT TESTS with a mocked Supabase client. They verify the
// app calls the Rev6 contract exactly and surfaces refusals. They do NOT prove
// database/RLS enforcement — that is the job of the Rev6 SQL suites.
import { beforeEach, describe, expect, it, vi } from "vitest";

// Records every call the NoteBank layer makes so we can assert it uses the
// db-v2 contract exactly (tables, RPC names, parameter names, payloads).
type Call = { kind: string; table?: string; fn?: string; args?: unknown; payload?: unknown; filters: [string, ...unknown[]][] };
const calls: Call[] = [];
let nextResult: { data: unknown; error: unknown } = { data: null, error: null };
const results: Record<string, { data: unknown; error: unknown }> = {};

function builder(call: Call) {
  const b: Record<string, unknown> = {};
  const chain = (name: string) => (...a: unknown[]) => {
    if (name === "insert" || name === "update") { call.kind = name; call.payload = a[0]; }
    else if (name !== "select" && name !== "single") call.filters.push([name, ...a]);
    return b;
  };
  for (const m of ["select", "insert", "update", "eq", "is", "in", "order", "limit", "single"]) b[m] = chain(m);
  b["then"] = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(results[call.table ?? ""] ?? nextResult).then(res, rej);
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => { const c: Call = { kind: "select", table, filters: [] }; calls.push(c); return builder(c); },
    rpc: (fn: string, args?: unknown) => { calls.push({ kind: "rpc", fn, args, filters: [] }); return Promise.resolve(results[`rpc:${fn}`] ?? nextResult); },
  },
}));

const api = await import("@/lib/notebank/api");
const { describeDbError } = await import("@/lib/notebank/permissions");

const ORG = "org-1", TEACHER = "user-t", REVIEWER = "user-r";

beforeEach(() => {
  calls.length = 0;
  nextResult = { data: null, error: null };
  for (const k of Object.keys(results)) delete results[k];
});

describe("NoteBank workflow contract", () => {
  it("creates a draft: notes row then note_versions row, tenant + author set", async () => {
    results["notes"] = { data: { id: "note-1" }, error: null };
    results["note_versions"] = { data: { id: "ver-1" }, error: null };
    const note = await api.createNote({ orgId: ORG, userId: TEACHER, topicId: "topic-1", title: "Photosynthesis", body: "Body", summary: "" });
    expect(note.id).toBe("note-1");
    const [n, v] = calls;
    expect(n).toMatchObject({ table: "notes", kind: "insert", payload: { organisation_id: ORG, topic_id: "topic-1", title: "Photosynthesis", created_by: TEACHER } });
    expect(v).toMatchObject({ table: "note_versions", kind: "insert", payload: { organisation_id: ORG, note_id: "note-1", body: "Body", summary: null, created_by: TEACHER } });
    // Status is never set by the client; the database default ('draft') applies.
    expect(n?.payload).not.toHaveProperty("status");
    expect(v?.payload).not.toHaveProperty("status");
  });

  it("submits via submit_note_version(p_version_id)", async () => {
    await api.submitVersion("ver-1");
    expect(calls).toEqual([{ kind: "rpc", fn: "submit_note_version", args: { p_version_id: "ver-1" }, filters: [] }]);
  });

  it.each(["approved", "changes_requested", "rejected"] as const)("records a %s review by inserting into note_reviews", async (decision) => {
    await api.reviewVersion({ orgId: ORG, reviewerId: REVIEWER, versionId: "ver-1", decision, comments: "ok" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      table: "note_reviews", kind: "insert",
      payload: { organisation_id: ORG, note_version_id: "ver-1", reviewer_id: REVIEWER, decision, comments: "ok" },
    });
    // Status transition is left to the database trigger, never done client-side.
    expect(calls.some((c) => c.table === "note_versions")).toBe(false);
  });

  it("publishes via publish_note_version(p_version_id, p_visibility)", async () => {
    await api.publishVersion("ver-1", "organisation");
    expect(calls).toEqual([{ kind: "rpc", fn: "publish_note_version", args: { p_version_id: "ver-1", p_visibility: "organisation" }, filters: [] }]);
  });

  it("checks only the five Rev6 permission codes via has_permission", async () => {
    nextResult = { data: true, error: null };
    const perms = await api.fetchPermissions();
    expect(calls.map((c) => c.args)).toEqual([{ perm: "academic.notes.read" }, { perm: "academic.notes.write" }, { perm: "academic.notes.review" }, { perm: "academic.notes.approve" }, { perm: "academic.notes.publish" }]);
    expect(Object.values(perms).every(Boolean)).toBe(true);
  });

  it("surfaces database rejections instead of bypassing them", async () => {
    results["rpc:publish_note_version"] = { data: null, error: { message: "Only approved versions can be published (status: draft)" } };
    await expect(api.publishVersion("ver-1", "private")).rejects.toSatisfy((e) => /approved/.test(describeDbError(e)));

    results["rpc:submit_note_version"] = { data: null, error: { message: "Permission denied: academic.notes.write required" } };
    await expect(api.submitVersion("ver-1")).rejects.toSatisfy((e) => describeDbError(e).includes("academic.notes.write"));

    results["note_reviews"] = { data: null, error: { message: "Authors cannot review their own work" } };
    await expect(
      api.reviewVersion({ orgId: ORG, reviewerId: TEACHER, versionId: "ver-1", decision: "approved", comments: "" }),
    ).rejects.toSatisfy((e) => /own note/.test(describeDbError(e)));
    // No retry or fallback write was attempted after any rejection.
    expect(calls.filter((c) => c.kind !== "rpc").length).toBe(1);
  });

  it("A: teacher edits a draft via note_versions update (status untouched)", async () => {
    results["note_versions"] = { data: { id: "ver-1" }, error: null };
    await api.updateDraft("ver-1", { body: "New", summary: "" });
    expect(calls[0]).toMatchObject({ table: "note_versions", kind: "update", payload: { body: "New", summary: null } });
    expect(calls[0]?.payload).not.toHaveProperty("status");
  });

  it("C: approval without academic.notes.approve is refused by the database and surfaced", async () => {
    results["note_reviews"] = { data: null, error: { code: "42501", message: "new row violates row-level security policy for table \"note_reviews\"" } };
    await expect(api.reviewVersion({ orgId: ORG, reviewerId: REVIEWER, versionId: "ver-1", decision: "approved", comments: "" }))
      .rejects.toSatisfy((e) => /refused/.test(describeDbError(e)));
    expect(calls).toHaveLength(1);
  });

  it("E: publish and unpublish without academic.notes.publish are refused", async () => {
    results["rpc:publish_note_version"] = { data: null, error: { message: "Permission denied: academic.notes.publish required" } };
    results["rpc:unpublish_note"] = { data: null, error: { message: "Permission denied: academic.notes.publish required" } };
    await expect(api.publishVersion("ver-1", "organisation")).rejects.toSatisfy((e) => describeDbError(e).includes("academic.notes.publish"));
    await expect(api.unpublishNote("note-1")).rejects.toSatisfy((e) => describeDbError(e).includes("academic.notes.publish"));
  });

  it("F: unpublishes via unpublish_note(p_note_id)", async () => {
    await api.unpublishNote("note-1");
    expect(calls).toEqual([{ kind: "rpc", fn: "unpublish_note", args: { p_note_id: "note-1" }, filters: [] }]);
  });

  it("G: author self-approval is refused by the database trigger", async () => {
    results["note_reviews"] = { data: null, error: { message: "Authors cannot review their own work" } };
    for (const decision of ["approved", "changes_requested", "rejected"] as const) {
      await expect(api.reviewVersion({ orgId: ORG, reviewerId: TEACHER, versionId: "ver-1", decision, comments: "x" }))
        .rejects.toSatisfy((e) => /own note/.test(describeDbError(e)));
    }
  });

  it("I: cross-tenant access is denied by the database and nothing is retried", async () => {
    results["rpc:submit_note_version"] = { data: null, error: { message: "Version not found or not a draft" } };
    results["rpc:publish_note_version"] = { data: null, error: { message: "Version not found" } };
    results["notes"] = { data: null, error: { code: "42501", message: "new row violates row-level security policy" } };
    await expect(api.submitVersion("other-org-ver")).rejects.toBeTruthy();
    await expect(api.publishVersion("other-org-ver", "organisation")).rejects.toSatisfy((e) => /could not be found/.test(describeDbError(e)));
    await expect(api.createNote({ orgId: "org-2", userId: TEACHER, topicId: "t", title: "x", body: "y" })).rejects.toSatisfy((e) => /refused/.test(describeDbError(e)));
    expect(calls.filter((c) => c.table === "note_versions")).toHaveLength(0);
  });
});
