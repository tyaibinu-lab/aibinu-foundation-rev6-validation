import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "@/routeTree.gen";
import {
  ORG_HEADER,
  applyOrgHeader,
  isUuid,
  readOrgHeader,
  resolveActiveOrg,
  safeRedirect,
  toOrgOptions,
  type MembershipRow,
} from "@/lib/auth/org-context";

const A = "514be2cb-54ba-435b-a4cb-505baf0d0a47";
const B = "22222222-2222-4222-8222-222222222222";
const org = (id: string, name: string, status = "active") => ({ id, name, slug: name.toLowerCase(), status });
const row = (o: ReturnType<typeof org>, status = "active"): MembershipRow => ({ organisation_id: o.id, status, organisations: o });

describe("Gate 7 — organisation resolution", () => {
  it("single active organisation is selected automatically", () => {
    const orgs = toOrgOptions([row(org(A, "Org A"))]);
    expect(resolveActiveOrg(orgs, null)).toEqual({ kind: "selected", orgId: A });
  });
  it("multiple roles in one organisation collapse to one choice", () => {
    expect(toOrgOptions([row(org(A, "Org A")), row(org(A, "Org A"))])).toHaveLength(1);
  });
  it("multiple organisations require a choice unless a valid preference exists", () => {
    const orgs = toOrgOptions([row(org(A, "Org A")), row(org(B, "Org B"))]);
    expect(resolveActiveOrg(orgs, null)).toEqual({ kind: "choose" });
    expect(resolveActiveOrg(orgs, B)).toEqual({ kind: "selected", orgId: B });
  });
  it("a stored preference for a foreign organisation is ignored", () => {
    const orgs = toOrgOptions([row(org(A, "Org A")), row(org(B, "Org B"))]);
    expect(resolveActiveOrg(orgs, "33333333-3333-4333-8333-333333333333")).toEqual({ kind: "choose" });
  });
  it("no active membership gives the no-organisation state", () => {
    expect(resolveActiveOrg([], A)).toEqual({ kind: "none" });
    expect(toOrgOptions([row(org(A, "Org A"), "suspended"), row(org(B, "Org B", "suspended"))])).toEqual([]);
  });
});

describe("Gate 7 — x-organisation-id context", () => {
  const client = { rest: { headers: new Headers() } };
  beforeEach(() => client.rest.headers.delete(ORG_HEADER));
  it("sets, switches and clears the header in one place", () => {
    applyOrgHeader(A, client);
    expect(readOrgHeader(client)).toBe(A);
    applyOrgHeader(B, client);
    expect(readOrgHeader(client)).toBe(B);
    applyOrgHeader(null, client);
    expect(readOrgHeader(client)).toBeNull();
  });
  it("refuses non-UUID values", () => {
    applyOrgHeader("'; drop table x; --", client);
    expect(readOrgHeader(client)).toBeNull();
    expect(isUuid(A)).toBe(true);
  });
  it("the shared Supabase client propagates the header to table and RPC requests", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const fetchSpy = vi.fn(async () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rest = (supabase as any).rest;
    const original = rest.fetch;
    rest.fetch = fetchSpy;
    try {
      applyOrgHeader(A);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("question_current").select("*");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).rpc("current_org_id");
      for (const call of fetchSpy.mock.calls as unknown as [string, RequestInit][]) {
        expect(new Headers(call[1].headers).get(ORG_HEADER)).toBe(A);
      }
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    } finally {
      applyOrgHeader(null);
      rest.fetch = original;
    }
  });
});

describe("Gate 7 — routing and redirects", () => {
  it("only same-origin paths are accepted after sign-in", () => {
    expect(safeRedirect("/questionbank")).toBe("/questionbank");
    expect(safeRedirect("//evil.example")).toBe("/");
    expect(safeRedirect("https://evil.example")).toBe("/");
    expect(safeRedirect("/login?redirect=/x")).toBe("/");
    expect(safeRedirect(undefined)).toBe("/");
  });
  it("Question Bank and NoteBank pages sit under the protected tenant layouts", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    for (const p of ["/questionbank", "/questionbank/new", "/questionbank/review", "/questionbank/abc"]) {
      expect(router.matchRoutes(p).map((m) => m.routeId)).toContain("/questionbank");
    }
    for (const p of ["/notebank", "/notebank/review", "/notebank/abc"]) {
      expect(router.matchRoutes(p).map((m) => m.routeId)).toContain("/notebank");
    }
    expect(router.matchRoutes("/login").at(-1)?.routeId).toBe("/login");
  });
});

// ---- Gate component behaviour with a mocked auth state ----
const authState: Record<string, unknown> = {};
const navigateMock = vi.fn();
vi.mock("@/lib/auth/AuthProvider", () => ({ useAuth: () => authState }));
vi.mock("@tanstack/react-router", async (orig) => {
  const mod = await orig<typeof import("@tanstack/react-router")>();
  return {
    ...mod,
    useNavigate: () => navigateMock,
    useLocation: () => ({ href: "/questionbank" }),
    Outlet: () => <div>PROTECTED CONTENT</div>,
    Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  };
});

describe("Gate 7 — tenant gate", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    for (const k of Object.keys(authState)) delete authState[k];
    Object.assign(authState, { organisations: [], activeOrg: null, user: { email: "t@x" }, selectOrganisation: vi.fn(), signOut: vi.fn() });
  });
  const load = async () => (await import("@/components/auth/TenantGate")).TenantGate;

  it("shows nothing protected while auth is loading", async () => {
    Object.assign(authState, { status: "loading", orgStatus: "idle" });
    const G = await load();
    render(<G />);
    expect(screen.queryByText("PROTECTED CONTENT")).toBeNull();
  });
  it("redirects signed-out visitors to /login with the target path", async () => {
    Object.assign(authState, { status: "signed_out", orgStatus: "idle" });
    const G = await load();
    render(<G />);
    expect(navigateMock).toHaveBeenCalledWith(expect.objectContaining({ to: "/login", search: { redirect: "/questionbank" } }));
    expect(screen.queryByText("PROTECTED CONTENT")).toBeNull();
  });
  it("shows the no-organisation state without tenant content", async () => {
    Object.assign(authState, { status: "signed_in", orgStatus: "none" });
    const G = await load();
    render(<G />);
    expect(screen.getByText("No organisation access")).toBeTruthy();
    expect(screen.queryByText("PROTECTED CONTENT")).toBeNull();
  });
  it("asks to choose when several organisations exist", async () => {
    Object.assign(authState, { status: "signed_in", orgStatus: "choose", organisations: [{ id: A, name: "Org A" }, { id: B, name: "Org B" }] });
    const G = await load();
    render(<G />);
    expect(screen.getByText("Choose an organisation")).toBeTruthy();
    expect(screen.queryByText("PROTECTED CONTENT")).toBeNull();
  });
  it("renders protected content only with an active organisation", async () => {
    Object.assign(authState, { status: "signed_in", orgStatus: "ready", activeOrg: { id: A, name: "Org A" } });
    const G = await load();
    render(<G />);
    expect(screen.getByText("PROTECTED CONTENT")).toBeTruthy();
  });
});

describe("Gate 7 — client secret protection", () => {
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  }
  it("no client source references the service-role key or sb_secret keys", () => {
    const files = walk(path.resolve(__dirname, "..")).filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes(`${path.sep}test${path.sep}`) && !f.endsWith("client.server.ts") && !f.endsWith("auth-middleware.ts") && !f.endsWith("cron-auth.ts"));
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/SERVICE_ROLE|sb_secret_/);
    }
  });
  it("sign-in never writes the password to storage or logs", () => {
    const src = readFileSync(path.resolve(__dirname, "../routes/login.tsx"), "utf8");
    expect(src).not.toMatch(/localStorage|sessionStorage|console\./);
  });
});
