import { readFileSync } from "node:fs";
import { join } from "node:path";
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const rpc = vi.fn(); const from = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc, from, auth: { getSession: vi.fn(), onAuthStateChange: vi.fn() }, rest: { headers: new Headers() } } }));

const { routeTree } = await import("@/routeTree.gen");
const { DemoDataBanner, FinanceDashboardCards } = await import("@/components/finance/FinanceDashboardCards");
const { MOCK_DASHBOARD } = await import("@/lib/finance/api");

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
    render(<><DemoDataBanner /><FinanceDashboardCards data={MOCK_DASHBOARD} /></>);
    expect(screen.getByText("DEMO DATA — NOT CONNECTED TO LIVE FINANCIAL RECORDS")).toBeInTheDocument();
    expect(screen.getByText("Total invoiced")).toBeInTheDocument();
    expect(screen.getByText("₦42,500,000.00")).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
});
