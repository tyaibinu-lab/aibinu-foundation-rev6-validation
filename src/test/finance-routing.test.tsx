import { readFileSync } from "node:fs";
import { join } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, screen, cleanup } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  status: "signed_in",
  orgStatus: "ready",
  activeOrg: { id: "synthetic-org", name: "Synthetic demo organisation" },
  organisations: [{ id: "synthetic-org", name: "Synthetic demo organisation" }],
  user: { email: "demo@example.test" },
  selectOrganisation: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => auth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const rpc = vi.fn();
const from = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc,
    from,
    auth: { getSession: vi.fn(), onAuthStateChange: vi.fn() },
    rest: { headers: new Headers() },
  },
}));

const { routeTree } = await import("@/routeTree.gen");
const { DemoDataBanner, FinanceDashboardCards } =
  await import("@/components/finance/FinanceDashboardCards");
const { MOCK_DASHBOARD } = await import("@/lib/finance/api");

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  auth.status = "signed_in";
  auth.orgStatus = "ready";
});
afterEach(cleanup);

async function renderFinanceRoute() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: ["/finance"] }),
  });
  await router.load();
  render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
  return router;
}

describe("finance routing", () => {
  const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
  it("resolves /finance to the overview under the finance layout", () => {
    const ids = router.matchRoutes("/finance").map((m) => m.routeId);
    expect(ids).toContain("/finance");
    expect(ids.at(-1)).toBe("/finance/");
  });
  it("the finance layout is the existing TenantGate, client-only", () => {
    const src = readFileSync(join(process.cwd(), "src/routes/finance.tsx"), "utf8");
    expect(src).toMatch(/component:\s*TenantGate/);
    expect(src).toMatch(/ssr:\s*false/);
  });
  it("existing module routes still resolve", () => {
    for (const p of ["/", "/students", "/notebank", "/questionbank", "/cbt", "/curriculum"]) {
      expect(router.matchRoutes(p).at(-1)?.routeId).not.toBe("__root__");
    }
  });
  it("dashboard renders with the demo-data label and makes no data calls", () => {
    render(
      <>
        <DemoDataBanner />
        <FinanceDashboardCards data={MOCK_DASHBOARD} />
      </>,
    );
    expect(
      screen.getByText("DEMO DATA — NOT CONNECTED TO LIVE FINANCIAL RECORDS"),
    ).toBeInTheDocument();
    expect(screen.getByText("Total invoiced")).toBeInTheDocument();
    expect(screen.getByText("₦42,500,000.00")).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
  it("renders the full tenant-gated overview with synthetic context and zero live calls", async () => {
    const router = await renderFinanceRoute();
    expect(await screen.findByRole("heading", { name: "Finance overview" })).toBeInTheDocument();
    expect(await screen.findByText("₦42,500,000.00")).toBeInTheDocument();
    expect(screen.getByText("Synthetic demo organisation")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/finance");
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
  it("existing TenantGate blocks the overview without organisation access", async () => {
    auth.orgStatus = "none";
    await renderFinanceRoute();
    expect(await screen.findByText("No organisation access")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Finance overview" })).not.toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
});
