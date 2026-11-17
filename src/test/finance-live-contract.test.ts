// Finance Phase 2 — live contract tests (mocked Supabase client).
// Prove the live layer writes money only through the migration 006 functions with exact
// arguments, never sends organisation_id to an RPC, never overrides prices, never writes the
// ledger, never calls online-payment entry points, and keeps the Phase 1 overview untouched.
import { readFileSync } from "node:fs";
import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { kind: string; table?: string; fn?: string; args?: unknown; payload?: unknown; select?: string; filters: unknown[][] };
const calls: Call[] = [];
const results: Record<string, { data: unknown; error: unknown }> = {};
const empty = { data: null, error: null };
function builder(call: Call) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "insert", "update", "delete", "upsert", "eq", "neq", "is", "in", "or", "order", "limit", "single", "maybeSingle"]) {
    b[m] = (...a: unknown[]) => {
      if (["insert", "update", "delete", "upsert"].includes(m)) { call.kind = m; call.payload = a[0]; }
      else if (m === "select") call.select = a[0] as string;
      else call.filters.push([m, ...a]);
      return b;
    };
  }
  b["then"] = (r: (v: unknown) => unknown, j: (e: unknown) => unknown) => Promise.resolve(results[`${call.kind}:${call.table}`] ?? results[call.table ?? ""] ?? empty).then(r, j);
  return b;
}
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => { const c: Call = { kind: "select", table, filters: [] }; calls.push(c); return builder(c); },
    rpc: (fn: string, args?: unknown) => { calls.push({ kind: "rpc", fn, args, filters: [] }); return Promise.resolve(results[`rpc:${fn}`] ?? empty); },
  },
}));

const f = await import("@/lib/finance/live");
const { routeTree } = await import("@/routeTree.gen");
const INV = "8c1f5b7e-0c55-4a8e-9a0b-6f1f2f6c1a11";
const STU = "2b7f8a8e-91f3-4c4f-8d0e-3a6c9e2b4d22";
const TXN = "5d2e6f7a-1b3c-4d5e-8f9a-0b1c2d3e4f33";
const LIVE_SRC = [
  "src/lib/finance/live.ts",
  "src/components/finance/live.tsx",
  "src/routes/finance.catalogue.tsx",
  "src/routes/finance.invoices.index.tsx",
  "src/routes/finance.invoices.new.tsx",
  "src/routes/finance.invoices.$invoiceId.tsx",
  "src/routes/finance.payments.tsx",
  "src/routes/finance.refunds.tsx",
  "src/routes/finance.accounts.tsx",
  "src/routes/finance.my.tsx",
];
const src = (p: string) => readFileSync(p, "utf8");
const rpcs = () => calls.filter((c) => c.kind === "rpc");
beforeEach(() => { calls.length = 0; for (const k of Object.keys(results)) delete results[k]; });

describe("routes", () => {
  it.each(["/finance/catalogue", "/finance/invoices", "/finance/invoices/new", "/finance/invoices/abc", "/finance/payments", "/finance/refunds", "/finance/accounts", "/finance/my"])(
    "%s sits under the TenantGate /finance layout",
    (p) => {
      const m = createRouter({ routeTree, context: { queryClient: new QueryClient() } }).matchRoutes(p);
      expect(m.at(-1)?.routeId).not.toBe(rootRouteId);
      expect(m.some((x) => x.routeId === "/finance")).toBe(true);
    },
  );
  it("/finance/invoices/new is not captured by the $invoiceId route", () => {
    const m = createRouter({ routeTree, context: { queryClient: new QueryClient() } }).matchRoutes("/finance/invoices/new");
    expect(m.at(-1)?.routeId).toBe("/finance/invoices/new");
  });
});

describe("money input", () => {
  it("converts Naira text to integer kobo without floating point", () => {
    expect(f.nairaToKoboArg("1,250.50")).toBe(125050);
    expect(f.nairaToKoboArg("45000")).toBe(4500000);
    expect(f.nairaToKoboArg("₦0.01")).toBe(1);
  });
  it.each(["0", "-5", "abc", "1.234", ""])("rejects %s", (v) => {
    expect(() => f.nairaToKoboArg(v)).toThrow();
  });
});

describe("write pathways use migration 006 functions with exact arguments", () => {
  it("create_invoice: items carry product/quantity/discount only — never unit_price", async () => {
    results["rpc:create_invoice"] = { data: INV, error: null };
    const id = await f.createDraftInvoice({
      studentId: STU, academicSessionId: null, dueOn: "2026-12-01", notes: " Term 1 ",
      items: [{ productId: "p1", quantity: 2, discountCode: " EARLY10 " }, { productId: "p2", quantity: 1 }],
    });
    expect(id).toBe(INV);
    expect(rpcs()).toEqual([{
      kind: "rpc", fn: "create_invoice", filters: [],
      args: {
        p_student_id: STU, p_academic_session_id: null, p_due_on: "2026-12-01", p_notes: "Term 1",
        p_items: [{ product_id: "p1", quantity: 2, discount_code: "EARLY10" }, { product_id: "p2", quantity: 1 }],
      },
    }]);
    expect(JSON.stringify(calls)).not.toMatch(/unit_price/);
  });
  it("issue / void / write-off / wallet use the named RPCs", async () => {
    await f.issueInvoice(INV);
    await f.voidInvoice(INV, " wrong student ");
    await f.writeOffBalance(INV, "1,000", "hardship");
    await f.applyWallet(INV);
    await f.applyWallet(INV, "500");
    expect(rpcs().map((c) => [c.fn, c.args])).toEqual([
      ["issue_invoice", { p_invoice_id: INV }],
      ["void_invoice", { p_invoice_id: INV, p_reason: "wrong student" }],
      ["write_off_balance", { p_invoice_id: INV, p_amount: 100000, p_reason: "hardship" }],
      ["apply_wallet_to_invoice", { p_invoice_id: INV, p_amount: null }],
      ["apply_wallet_to_invoice", { p_invoice_id: INV, p_amount: 50000 }],
    ]);
  });
  it("record_manual_payment sends kobo and the manual provider", async () => {
    results["rpc:record_manual_payment"] = { data: TXN, error: null };
    await f.recordManualPayment({ studentId: STU, invoiceId: INV, amountNaira: "20,000", provider: "bank_transfer", reference: " FT123 " });
    expect(rpcs()[0]).toMatchObject({ fn: "record_manual_payment", args: { p_student_id: STU, p_invoice_id: INV, p_amount: 2000000, p_provider: "bank_transfer", p_reference: "FT123" } });
  });
  it("refuses online providers for manual payments before calling the database", async () => {
    await expect(f.recordManualPayment({ studentId: STU, amountNaira: "1", provider: "paystack" as never })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
  it("refund lifecycle uses request/approve/reject/complete RPCs", async () => {
    await f.requestRefund(TXN, "2,000", "overpaid", "wallet");
    await f.approveRefund("r1", "ok");
    await f.rejectRefund("r2");
    await f.completeRefund("r1", "BANKREF");
    expect(rpcs().map((c) => [c.fn, c.args])).toEqual([
      ["request_refund", { p_transaction_id: TXN, p_amount: 200000, p_reason: "overpaid", p_source: "wallet" }],
      ["approve_refund", { p_refund_id: "r1", p_note: "ok" }],
      ["reject_refund", { p_refund_id: "r2", p_note: null }],
      ["complete_refund", { p_refund_id: "r1", p_provider_refund_id: "BANKREF" }],
    ]);
  });
  it("no RPC ever carries an organisation id", async () => {
    await f.issueInvoice(INV);
    await f.recordManualPayment({ studentId: STU, amountNaira: "1", provider: "cash" });
    for (const c of rpcs()) expect(JSON.stringify(c.args ?? {})).not.toMatch(/organisation/);
  });
});

describe("direct table writes are limited to what migration 006 grants", () => {
  it("deleting an invoice is filtered to drafts", async () => {
    await f.deleteDraftInvoice(INV);
    expect(calls[0]).toMatchObject({ kind: "delete", table: "customer_invoices" });
    expect(calls[0]!.filters).toEqual([["eq", "id", INV], ["eq", "status", "draft"]]);
  });
  it("price-list inserts take organisation_id from current_org_id()", async () => {
    results["rpc:current_org_id"] = { data: "org-1", error: null };
    await f.createProduct({ code: "tuition-ss2", name: "SS2 Tuition", type: "tuition" });
    expect(calls[0]).toMatchObject({ kind: "rpc", fn: "current_org_id" });
    expect(calls[1]).toMatchObject({ kind: "insert", table: "tenant_products", payload: { organisation_id: "org-1", code: "TUITION-SS2" } });
  });
  it("source never writes invoices/ledger/payments directly or calls online-payment functions", () => {
    const forbidden = [
      /from\("(tenant_ledger|customer_payment_transactions|customer_receipts|customer_refunds|customer_accounts|customer_invoice_items)"\)\s*\.(insert|update|upsert|delete)/,
      /from\("customer_invoices"\)\s*\.(insert|update|upsert)/,
      /initiate_payment|attach_checkout|ingest_payment_event|set_payment_provider_secret|run_finance_maintenance/,
      /api\.paystack|api\.flutterwave|\bfetch\(/i,
    ];
    for (const p of LIVE_SRC) for (const re of forbidden) expect({ p, re: String(re), hit: re.test(src(p)) }).toMatchObject({ hit: false });
  });
});

describe("access", () => {
  it("reads the four finance permissions via has_permission", async () => {
    results["rpc:has_permission"] = { data: true, error: null };
    expect(await f.fetchLiveFinanceAccess()).toEqual({ read: true, viewAll: true, manage: true, approve: true });
    expect(rpcs().map((c) => (c.args as { perm: string }).perm)).toEqual(["finance.read", "finance.view_all", "finance.manage", "finance.approve"]);
  });
  it("staff pages only query when finance.view_all is present", () => {
    for (const p of ["src/routes/finance.invoices.index.tsx", "src/routes/finance.payments.tsx", "src/routes/finance.refunds.tsx", "src/routes/finance.accounts.tsx"]) {
      expect(src(p)).toMatch(/enabled: access\.staff/);
      expect(src(p)).toMatch(/if \(!access\.staff\)/);
    }
  });
  it("family page never renders an organisation-wide list for staff", () => {
    expect(src("src/routes/finance.my.tsx")).toMatch(/enabled: family/);
    expect(src("src/routes/finance.my.tsx")).toMatch(/if \(access\.staff\)/);
  });
  it("maps separation-of-duties refusal to a clear message", () => {
    expect(f.describeFinanceError({ message: "A refund must be approved by someone other than the person who requested it" })).toMatch(/different person/);
  });
});

describe("Phase 1 overview stays demo-only", () => {
  it("overview route and demo service are unchanged and network-free", () => {
    expect(src("src/routes/finance.index.tsx")).not.toMatch(/finance\/live/);
    expect(src("src/lib/finance/api.ts")).not.toMatch(/integrations\/supabase/);
    expect(src("src/components/finance/FinanceShell.tsx")).not.toMatch(/\.rpc\(|\.from\(|useQuery/);
  });
});
