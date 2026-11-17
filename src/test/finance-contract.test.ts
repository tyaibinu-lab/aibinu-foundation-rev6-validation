// Phase 1 contract: Finance serves mock data and makes zero network calls.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { kind: string; name: string; args?: unknown }[] = [];
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => {
      calls.push({ kind: "from", name: t });
      throw new Error("no table access in Phase 1");
    },
    rpc: (fn: string, args?: { perm: string }) => {
      calls.push({ kind: "rpc", name: fn, args });
      throw new Error("no RPC access in Phase 1");
    },
  },
}));

const { useFinanceAccess, financeCapabilities, EMPTY_FINANCE_PERMISSIONS } =
  await import("@/lib/finance/permissions");
const { getDashboardSummary, MOCK_DASHBOARD } = await import("@/lib/finance/api");

beforeEach(() => {
  calls.length = 0;
});

describe("finance capabilities", () => {
  it("no permissions -> nothing visible or operable", () => {
    expect(financeCapabilities(EMPTY_FINANCE_PERMISSIONS)).toEqual({
      canSeeFinanceNav: false,
      canViewOrgOverview: false,
      canViewOwnRecords: false,
      canManage: false,
      canApprove: false,
    });
  });
  it("finance.read -> own records only, no org overview", () => {
    const c = financeCapabilities({ ...EMPTY_FINANCE_PERMISSIONS, "finance.read": true });
    expect(c).toMatchObject({
      canSeeFinanceNav: true,
      canViewOwnRecords: true,
      canViewOrgOverview: false,
      canManage: false,
      canApprove: false,
    });
  });
  it("finance.view_all -> org overview but no operations", () => {
    const c = financeCapabilities({ ...EMPTY_FINANCE_PERMISSIONS, "finance.view_all": true });
    expect(c).toMatchObject({ canViewOrgOverview: true, canManage: false, canApprove: false });
  });
  it("finance.manage alone does not grant the overview or approval", () => {
    const c = financeCapabilities({ ...EMPTY_FINANCE_PERMISSIONS, "finance.manage": true });
    expect(c).toMatchObject({
      canSeeFinanceNav: true,
      canManage: true,
      canViewOrgOverview: false,
      canApprove: false,
    });
  });
  it("finance.approve alone grants approval only", () => {
    const c = financeCapabilities({ ...EMPTY_FINANCE_PERMISSIONS, "finance.approve": true });
    expect(c).toMatchObject({ canApprove: true, canManage: false, canViewOrgOverview: false });
  });
});

describe("Phase 1 data contract", () => {
  it("offline access denies live capabilities without invoking any RPC", () => {
    const access = useFinanceAccess();
    expect(access.source).toBe("offline");
    expect(access.caps).toEqual(financeCapabilities(EMPTY_FINANCE_PERMISSIONS));
    expect(access.caps.canSeeFinanceNav).toBe(false);
    expect(access.caps.canManage).toBe(false);
    expect(access.caps.canApprove).toBe(false);
    expect(calls).toHaveLength(0);
  });
  it("supplied presentation permissions do not trigger a live lookup", () => {
    const access = useFinanceAccess({ ...EMPTY_FINANCE_PERMISSIONS, "finance.read": true });
    expect(access.caps.canViewOwnRecords).toBe(true);
    expect(access.caps.canViewOrgOverview).toBe(false);
    expect(calls).toHaveLength(0);
  });
  it("mock service does not invoke fetch or payment providers", async () => {
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline only"));
    try {
      await getDashboardSummary();
      expect(network).not.toHaveBeenCalled();
    } finally {
      network.mockRestore();
    }
  });
  it("dashboard returns labelled mock fixtures without touching Supabase", async () => {
    const d = await getDashboardSummary();
    expect(d).toBe(MOCK_DASHBOARD);
    expect(d.source).toBe("mock");
    expect(calls).toHaveLength(0);
  });
  it("finance source contains no table access, finance RPCs, ledger writes or provider endpoints", () => {
    const files = [
      "src/lib/finance/api.ts",
      "src/lib/finance/mock-data.ts",
      "src/lib/finance/currency.ts",
      "src/lib/finance/permissions.ts",
      "src/lib/finance/types.ts",
      "src/components/finance/FinanceShell.tsx",
      "src/components/finance/FinanceDashboardCards.tsx",
      "src/routes/finance.tsx",
      "src/routes/finance.index.tsx",
    ];
    const forbidden = [
      /\.from\(/,
      /\bfetch\(/,
      /api\.paystack|api\.flutterwave/i,
      /\.(insert|update|upsert|delete)\(/,
      /\.rpc\(/,
      /integrations\/supabase/,
      /create_invoice|issue_invoice|void_invoice|initiate_payment|record_manual_payment|ingest_payment_event|_refund|apply_wallet|write_off/,
    ];
    for (const f of files) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      for (const re of forbidden) expect({ f, hit: re.test(src) }).toEqual({ f, hit: false });
    }
  });
});
