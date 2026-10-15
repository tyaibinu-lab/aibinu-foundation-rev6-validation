// UNIT-LEVEL CONTRACT TESTS with a mocked Supabase client. They prove the Curriculum
// Bank layer is read-only, uses only existing Rev6 curriculum tables under RLS and
// never supplies an organisation filter of its own. RLS is the authority.
import { readFileSync } from "node:fs";
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { kind: string; table?: string; fn?: string; cols?: unknown; filters: unknown[][] };
const calls: Call[] = [];
const results: Record<string, { data: unknown; error: unknown }> = {};
const empty = { data: [], error: null };

function builder(call: Call) {
  const b: Record<string, unknown> = {};
  const chain = (name: string) => (...a: unknown[]) => {
    if (["insert", "update", "delete", "upsert"].includes(name)) call.kind = name;
    else if (name === "select") call.cols = a[0];
    else call.filters.push([name, ...a]);
    return b;
  };
  for (const m of ["select", "insert", "update", "delete", "upsert", "eq", "is", "order"]) b[m] = chain(m);
  b["then"] = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(results[call.table ?? ""] ?? empty).then(res, rej);
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => { const c: Call = { kind: "select", table, filters: [] }; calls.push(c); return builder(c); },
    rpc: (fn: string) => { calls.push({ kind: "rpc", fn, filters: [] }); return Promise.resolve(empty); },
  },
}));

const api = await import("@/lib/curriculum/api");
const { routeTree } = await import("@/routeTree.gen");

beforeEach(() => { calls.length = 0; for (const k of Object.keys(results)) delete results[k]; });

describe("Curriculum Bank route", () => {
  it("matches /curriculum under the client-only TenantGate layout", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const ids = router.matchRoutes("/curriculum", {}).map((m) => m.routeId);
    expect(ids).toContain("/curriculum");
    expect(ids).toContain("/curriculum/");
    const layout = readFileSync("src/routes/curriculum.tsx", "utf8");
    expect(layout).toMatch(/ssr:\s*false/);
    expect(layout).toMatch(/component:\s*TenantGate/);
  });
});

describe("Curriculum API contract", () => {
  it("lists non-deleted curricula with explicit columns", async () => {
    await api.listCurricula();
    expect(calls).toEqual([{ kind: "select", table: "curricula", cols: api.CURRICULUM_COLS, filters: [["is", "deleted_at", null], ["order", "name"]] }]);
  });

  it("lists versions for one curriculum only", async () => {
    await api.listVersions("c1");
    expect(calls[0]).toMatchObject({ table: "curriculum_versions", filters: [["eq", "curriculum_id", "c1"], ["order", "created_at", { ascending: false }]] });
  });

  it("loads units and topics of a single version and groups topics by unit", async () => {
    results["curriculum_units"] = { data: [{ id: "u1", version_id: "v1", title: "Mechanics", position: 0 }], error: null };
    results["curriculum_topics"] = { data: [
      { id: "t1", version_id: "v1", unit_id: "u1", code: "A", title: "Motion", position: 0, class_level: "SS1", term: "first", topic_key: "k1" },
      { id: "t2", version_id: "v1", unit_id: "uX", code: "B", title: "Orphan", position: 1, class_level: null, term: "any", topic_key: "k2" },
    ], error: null };
    const tree = await api.getVersionTree("v1");
    expect(calls.map((c) => [c.table, c.filters[0]])).toEqual([["curriculum_units", ["eq", "version_id", "v1"]], ["curriculum_topics", ["eq", "version_id", "v1"]]]);
    expect(tree.units[0]!.topics.map((t) => t.id)).toEqual(["t1"]);
    expect(tree.unassigned.map((t) => t.id)).toEqual(["t2"]);
  });

  it("never writes, never calls RPCs and never filters by organisation_id", async () => {
    await api.listCurricula(); await api.listVersions("c"); await api.getVersionTree("v");
    expect(calls.every((c) => c.kind === "select")).toBe(true);
    expect(JSON.stringify(calls)).not.toContain("organisation_id");
    const src = readFileSync("src/lib/curriculum/api.ts", "utf8");
    expect(src).not.toMatch(/\.(insert|update|upsert|delete)\(|\.rpc\(|client\.server|SERVICE_ROLE/);
  });

  it("propagates database errors", async () => {
    results["curricula"] = { data: null, error: { message: "permission denied" } };
    await expect(api.listCurricula()).rejects.toMatchObject({ message: "permission denied" });
  });

  it("defaults to the published version and never picks a draft", () => {
    const v = (id: string, status: "draft" | "published" | "archived") => ({ id, curriculum_id: "c", version_label: id, status, effective_from: null, published_at: null });
    expect(api.defaultVersion([v("d", "draft"), v("p", "published")])?.id).toBe("p");
    expect(api.defaultVersion([v("d", "draft"), v("a", "archived")])).toBeNull();
  });

  const ver = (id: string, curriculum_id: string, status: "draft" | "published" | "archived") => ({ id, curriculum_id, version_label: id, status, effective_from: null, published_at: null });

  it("drops a selected draft when drafts are hidden, falling back to the published version", () => {
    const list = [ver("d", "c1", "draft"), ver("p", "c1", "published")];
    expect(api.selectVersion(list, true, "d")?.id).toBe("d");
    expect(api.selectVersion(list, false, "d")?.id).toBe("p");
    expect(api.selectVersion([ver("d", "c1", "draft")], false, "d")).toBeNull();
  });

  it("never selects a version from a previous curriculum after switching", () => {
    const c2 = [ver("p2", "c2", "published"), ver("d2", "c2", "draft")];
    expect(api.selectVersion(c2, true, "p1-from-c1")?.id).toBe("p2");
    expect(api.selectVersion([], true, "p1-from-c1")).toBeNull();
  });
});
