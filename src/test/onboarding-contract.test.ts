// Onboarding & invitations (migration 009) contract tests (mocked Supabase client).
// Prove organisations are created only via create_organisation, invitations only via
// invite_member / accept_invitation, token hashes are never selected, no table is written
// directly, auth/session code is not touched, and /welcome is reachable without an organisation.
import { readFileSync } from "node:fs";
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { kind: string; table?: string; fn?: string; args?: unknown; select?: string; filters: unknown[][] };
const calls: Call[] = [];
const results: Record<string, { data: unknown; error: unknown }> = {};
const empty = { data: null, error: null };
function builder(call: Call) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "insert", "update", "delete", "upsert", "eq", "in", "order", "limit"]) {
    b[m] = (...a: unknown[]) => {
      if (["insert", "update", "delete", "upsert"].includes(m)) call.kind = m;
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
    rest: { headers: new Headers() },
  },
}));

const ob = await import("@/lib/onboarding/api");
const { routeTree } = await import("@/routeTree.gen");
const ORG = "6f1e2d3c-4b5a-4987-8a6b-5c4d3e2f1a0b";
const TOKEN = "a".repeat(32) + "0123456789abcdef0123456789abcdef";
const SRC = ["src/lib/onboarding/api.ts", "src/routes/welcome.tsx", "src/routes/members.index.tsx"];
const src = (p: string) => readFileSync(p, "utf8");
beforeEach(() => { calls.length = 0; for (const k of Object.keys(results)) delete results[k]; });

describe("routes", () => {
  const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
  it("/welcome is NOT behind TenantGate (users with no organisation must reach it)", () => {
    const ids = router.matchRoutes("/welcome").map((m) => m.routeId);
    expect(ids.at(-1)).toBe("/welcome");
    expect(src("src/routes/welcome.tsx")).not.toMatch(/TenantGate/);
  });
  it("/members sits under the TenantGate /members layout", () => {
    const ids = router.matchRoutes("/members").map((m) => m.routeId);
    expect(ids).toContain("/members");
    expect(src("src/routes/members.tsx")).toMatch(/component:\s*TenantGate/);
  });
});

describe("pathways", () => {
  it("create_organisation with exact arguments", async () => {
    results["rpc:create_organisation"] = { data: ORG, error: null };
    expect(await ob.createOrganisation({ name: "  Progressive SSS ", slug: "progressive-sss", type: "school" })).toBe(ORG);
    expect(calls).toEqual([{ kind: "rpc", fn: "create_organisation", filters: [], args: { p_name: "Progressive SSS", p_slug: "progressive-sss", p_type: "school", p_country: "NG" } }]);
  });
  it("invite_member normalises the e-mail and returns the one-time token", async () => {
    results["rpc:invite_member"] = { data: TOKEN, error: null };
    expect(await ob.inviteMember("  Teacher@Example.COM ", "teacher")).toBe(TOKEN);
    expect(calls[0]).toMatchObject({ fn: "invite_member", args: { p_email: "teacher@example.com", p_role_code: "teacher" } });
  });
  it("accept_invitation with the token only", async () => {
    await ob.acceptInvitation(TOKEN);
    expect(calls[0]).toMatchObject({ fn: "accept_invitation", args: { p_token: TOKEN } });
  });
  it("invitation listing never selects token_hash", async () => {
    await ob.listInvitations();
    expect(calls[0]!.table).toBe("membership_invitations");
    expect(calls[0]!.select).not.toMatch(/token/);
  });
  it("entering an organisation sets the preference then reloads (no auth code changes)", () => {
    const go = vi.fn();
    ob.enterOrganisation(ORG, go);
    expect(localStorage.getItem("aibinu.activeOrganisationId")).toBe(ORG);
    expect(go).toHaveBeenCalledWith("/");
  });
});

describe("helpers", () => {
  it("extracts a token from a raw code or a join link only", () => {
    expect(ob.extractToken(TOKEN)).toBe(TOKEN);
    expect(ob.extractToken(ob.joinLink(TOKEN, "https://app.example/"))).toBe(TOKEN);
    expect(ob.extractToken("https://app.example/welcome?token=short")).toBeNull();
    expect(ob.extractToken("not a link")).toBeNull();
  });
  it("slugify produces a value the database format check accepts", () => {
    const s = ob.slugify("Progressive Senior Secondary School, Adéta!");
    expect(s).toBe("progressive-senior-secondary-school-adeta");
    expect(s).toMatch(/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/);
    expect(ob.validateOrganisation({ name: "X Y", slug: "-bad", type: "school" })).toHaveLength(1);
  });
  it("invitation state", () => {
    const base = { id: "i", email: "a@b.c", role_id: "r", created_at: "2026-11-01", accepted_at: null, revoked_at: null };
    expect(ob.invitationState({ ...base, expires_at: "2026-11-30" }, new Date("2026-11-17"))).toBe("open");
    expect(ob.invitationState({ ...base, expires_at: "2026-11-10" }, new Date("2026-11-17"))).toBe("expired");
    expect(ob.invitationState({ ...base, expires_at: "2026-11-30", accepted_at: "2026-11-02" })).toBe("accepted");
  });
});

describe("source guarantees", () => {
  it("no direct table writes, no auth/session changes, no token_hash reads", () => {
    for (const p of SRC) {
      const s = src(p);
      expect({ p, hit: /\.(insert|update|upsert|delete)\(/.test(s) }).toMatchObject({ hit: false });
      expect({ p, hit: /supabase\.auth\.|signUp|signIn|applyOrgHeader/.test(s) }).toMatchObject({ hit: false });
      expect({ p, hit: /token_hash"|select\([^)]*token_hash/.test(s) }).toMatchObject({ hit: false });
    }
  });
});
