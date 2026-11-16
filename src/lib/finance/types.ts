// Finance view models. Money fields are integer kobo as bigint.
import type { Kobo } from "./currency";

export type DataSource = "mock" | "live";

export interface FeeCollectionSummary {
  invoiced: Kobo;
  collected: Kobo;
  outstanding: Kobo;
  overdueInvoices: number;
}
export interface OutstandingBalance {
  studentLabel: string;
  className: string;
  balance: Kobo;
}
export type PaymentMethod = "paystack" | "flutterwave" | "bank_transfer" | "cash" | "pos" | "other";
export interface PaymentMethodSummary {
  method: PaymentMethod;
  count: number;
  amount: Kobo;
}
export interface PaymentSummary {
  receivedToday: Kobo;
  byMethod: PaymentMethodSummary[];
}
export interface ExpenditureSummary {
  approved: Kobo;
  paid: Kobo;
  pendingApprovals: number;
}
export interface PendingApprovals {
  expenses: number;
  refunds: number;
}
export interface FinancialActivity {
  id: string;
  at: string;
  kind: "payment" | "invoice" | "refund" | "expense";
  description: string;
  amount: Kobo;
}

export interface FinanceDashboardSummary {
  source: DataSource;
  periodLabel: string;
  fees: FeeCollectionSummary;
  payments: PaymentSummary;
  expenditure: ExpenditureSummary;
  approvals: PendingApprovals;
  topOutstanding: OutstandingBalance[];
  recentActivity: FinancialActivity[];
}
