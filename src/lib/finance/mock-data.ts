// Synthetic Phase 1 fixtures only; no production service or student records.
import type { FinanceDashboardSummary } from "./types";

export const MOCK_DASHBOARD: FinanceDashboardSummary = {
  source: "mock",
  periodLabel: "Demo period: First Term (illustrative)",
  fees: {
    invoiced: 4_250_000_000n,
    collected: 2_980_000_000n,
    outstanding: 1_270_000_000n,
    overdueInvoices: 37,
  },
  payments: {
    receivedToday: 18_500_000n,
    byMethod: [
      { method: "paystack", count: 112, amount: 1_320_000_000n },
      { method: "bank_transfer", count: 64, amount: 980_000_000n },
      { method: "pos", count: 41, amount: 410_000_000n },
      { method: "cash", count: 29, amount: 190_000_000n },
      { method: "flutterwave", count: 9, amount: 80_000_000n },
    ],
  },
  expenditure: { approved: 1_150_000_000n, paid: 860_000_000n, pendingApprovals: 6 },
  approvals: { expenses: 6, refunds: 2 },
  topOutstanding: [
    { studentLabel: "Demo Student A", className: "JSS 2", balance: 12_500_000n },
    { studentLabel: "Demo Student B", className: "SS 1", balance: 9_800_000n },
    { studentLabel: "Demo Student C", className: "SS 3", balance: 7_250_000n },
  ],
  recentActivity: [
    {
      id: "demo-1",
      at: "Demo · 09:12",
      kind: "payment",
      description: "Demo payment (Paystack)",
      amount: 7_500_000n,
    },
    {
      id: "demo-2",
      at: "Demo · 10:40",
      kind: "invoice",
      description: "Demo invoice issued",
      amount: 15_000_000n,
    },
    {
      id: "demo-3",
      at: "Demo · 11:05",
      kind: "expense",
      description: "Demo expense: teaching materials",
      amount: -4_200_000n,
    },
    {
      id: "demo-4",
      at: "Demo · 13:30",
      kind: "refund",
      description: "Demo refund requested",
      amount: -1_000_000n,
    },
  ],
};

