import { supabase } from "@/integrations/supabase/client";
import { nairaStringToKobo } from "./currency";

// Finance Phase 2 — live layer over the Rev6 migration 006 contract.
// - Reads go through RLS only: finance.view_all sees the organisation; finance.read sees
//   the caller's own / ward's non-draft records (is_self_or_parent). Teachers see nothing.
// - Every money write goes through a SECURITY DEFINER function that re-checks permission,
//   organisation and state: create_invoice, issue_invoice, void_invoice, write_off_balance,
//   apply_wallet_to_invoice, record_manual_payment, request_refund, approve_refund,
//   reject_refund, complete_refund. The ledger is never written from here.
// - Direct table writes are limited to what migration 006 grants: the price list
//   (tenant_products / tenant_prices, finance.manage) and deleting a DRAFT invoice.
// - organisation_id is never sent on RPCs; it is read from current_org_id() in the database.
//   Price-list inserts read it from current_org_id() first, and RLS WITH CHECK re-validates it.
// - Online provider checkout (initiate_payment / attach_checkout / webhooks) is NOT used here:
//   it needs a server-side provider secret and webhook and belongs to a separate approved gate.
// - Amounts are integer kobo. Inputs are parsed with nairaStringToKobo (no floating point).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap<T = any>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

/** Naira text -> kobo number for an RPC argument. Rejects zero/negative and unsafe sizes. */
export function nairaToKoboArg(naira: string): number {
  const k = nairaStringToKobo(naira);
  if (k <= 0n) throw new RangeError("Amount must be greater than zero");
  const n = Number(k);
  if (!Number.isSafeInteger(n)) throw new RangeError("Amount is too large");
  return n;
}

// ---------- access (UX only) ----------

export interface LiveFinanceAccess { read: boolean; viewAll: boolean; manage: boolean; approve: boolean }

/** has_permission lookups for showing/hiding controls. The database re-checks every read and write. */
export async function fetchLiveFinanceAccess(): Promise<LiveFinanceAccess> {
  const perms = ["finance.read", "finance.view_all", "finance.manage", "finance.approve"] as const;
  const res = await Promise.all(perms.map((perm) => db.rpc("has_permission", { perm })));
  const [read, viewAll, manage, approve] = res.map((r) => unwrap(r) === true);
  return { read: !!read, viewAll: !!viewAll, manage: !!manage, approve: !!approve };
}

// ---------- price list ----------

export type ProductType = "tuition" | "registration" | "exam_fee" | "coaching" | "materials" | "subscription" | "other";
export const PRODUCT_TYPES: ProductType[] = ["tuition", "registration", "exam_fee", "coaching", "materials", "subscription", "other"];

export interface ProductRow { id: string; code: string; name: string; type: ProductType; description: string | null; is_active: boolean }
export interface PriceRow {
  id: string; product_id: string; academic_session_id: string | null; amount: number; currency: string;
  valid_from: string | null; valid_to: string | null; is_active: boolean;
}

export async function listProducts(): Promise<ProductRow[]> {
  return unwrap(await db.from("tenant_products").select("id,code,name,type,description,is_active").order("name")) ?? [];
}
export async function listPrices(): Promise<PriceRow[]> {
  return unwrap(await db.from("tenant_prices").select("id,product_id,academic_session_id,amount,currency,valid_from,valid_to,is_active").order("created_at", { ascending: false })) ?? [];
}

async function currentOrgId(): Promise<string> {
  const id = unwrap<string | null>(await db.rpc("current_org_id"));
  if (!id) throw new Error("No active organisation");
  return id;
}

export interface ProductInput { code: string; name: string; type: ProductType; description?: string }
export function validateProduct(i: ProductInput): string[] {
  const e: string[] = [];
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/.test(i.code.trim())) e.push("Code: 2–40 letters, numbers, - or _.");
  if (i.name.trim().length < 2) e.push("Name is required.");
  if (!PRODUCT_TYPES.includes(i.type)) e.push("Choose a fee type.");
  return e;
}
export async function createProduct(i: ProductInput): Promise<void> {
  const organisation_id = await currentOrgId();
  unwrap(await db.from("tenant_products").insert({
    organisation_id, code: i.code.trim().toUpperCase(), name: i.name.trim(), type: i.type, description: i.description?.trim() || null,
  }));
}
export async function setProductActive(id: string, isActive: boolean): Promise<void> {
  unwrap(await db.from("tenant_products").update({ is_active: isActive }).eq("id", id));
}

export interface PriceInput { productId: string; amountNaira: string; academicSessionId?: string | null; validFrom?: string; validTo?: string }
export async function createPrice(i: PriceInput): Promise<void> {
  const organisation_id = await currentOrgId();
  unwrap(await db.from("tenant_prices").insert({
    organisation_id, product_id: i.productId, amount: nairaToKoboArg(i.amountNaira),
    academic_session_id: i.academicSessionId || null, valid_from: i.validFrom || null, valid_to: i.validTo || null,
  }));
}
export async function setPriceActive(id: string, isActive: boolean): Promise<void> {
  unwrap(await db.from("tenant_prices").update({ is_active: isActive }).eq("id", id));
}

// ---------- invoices ----------

export type InvoiceStatus = "draft" | "issued" | "partially_paid" | "paid" | "void";

export interface InvoiceSummaryRow {
  invoice_id: string; number: string | null; student_id: string; student_name: string; admission_no: string | null;
  academic_session_id: string | null; status: InvoiceStatus; issued_at: string | null; due_on: string | null;
  total: number; balance: number; paid: number; is_overdue: boolean; days_overdue: number;
}
const SUMMARY_COLS = "invoice_id,number,student_id,student_name,admission_no,academic_session_id,status,issued_at,due_on,total,balance,paid,is_overdue,days_overdue";

export async function listInvoices(status?: InvoiceStatus | "overdue"): Promise<InvoiceSummaryRow[]> {
  let q = db.from("invoice_summary").select(SUMMARY_COLS);
  if (status === "overdue") q = q.eq("is_overdue", true);
  else if (status) q = q.eq("status", status);
  return unwrap(await q.order("issued_at", { ascending: false, nullsFirst: true }).limit(500)) ?? [];
}

export interface CollectionSummaryRow {
  academic_session_id: string | null; invoices: number; billed: number; collected: number;
  outstanding: number; overdue: number; discounts_given: number; scholarships_given: number;
}
export async function listCollectionSummary(): Promise<CollectionSummaryRow[]> {
  return unwrap(await db.from("fee_collection_summary").select("academic_session_id,invoices,billed,collected,outstanding,overdue,discounts_given,scholarships_given")) ?? [];
}

export interface InvoiceRow {
  id: string; number: string | null; student_id: string; account_id: string; academic_session_id: string | null;
  status: InvoiceStatus; currency: string; subtotal: number; discount_total: number; scholarship_total: number;
  total: number; balance: number; issued_at: string | null; due_on: string | null; paid_at: string | null;
  voided_at: string | null; void_reason: string | null; notes: string | null; created_at: string;
}
export interface InvoiceItemRow {
  id: string; product_id: string; description: string; quantity: number; unit_price: number; gross: number;
  discount_amount: number; scholarship_amount: number; line_total: number;
}
export interface TransactionRow {
  id: string; student_id: string; invoice_id: string | null; provider: string; provider_txn_id: string | null;
  amount: number; applied_amount: number; wallet_amount: number; payer_name: string | null; note: string | null; paid_at: string;
}
export interface ReceiptRow { id: string; transaction_id: string; invoice_id: string | null; student_id: string; number: string; amount: number; issued_at: string }

const INVOICE_COLS = "id,number,student_id,account_id,academic_session_id,status,currency,subtotal,discount_total,scholarship_total,total,balance,issued_at,due_on,paid_at,voided_at,void_reason,notes,created_at";
const TXN_COLS = "id,student_id,invoice_id,provider,provider_txn_id,amount,applied_amount,wallet_amount,payer_name,note,paid_at";

export interface InvoiceDetail {
  invoice: InvoiceRow; studentName: string | null; admissionNo: string | null;
  items: InvoiceItemRow[]; payments: TransactionRow[]; receipts: ReceiptRow[]; walletBalance: number;
}

export async function getInvoice(id: string): Promise<InvoiceDetail> {
  const invoice = unwrap(await db.from("customer_invoices").select(INVOICE_COLS).eq("id", id).single()) as InvoiceRow;
  const [items, pays, recs, st, wal] = await Promise.all([
    db.from("customer_invoice_items").select("id,product_id,description,quantity,unit_price,gross,discount_amount,scholarship_amount,line_total").eq("invoice_id", id),
    db.from("customer_payment_transactions").select(TXN_COLS).eq("invoice_id", id).order("paid_at", { ascending: false }),
    db.from("customer_receipts").select("id,transaction_id,invoice_id,student_id,number,amount,issued_at").eq("invoice_id", id).order("issued_at", { ascending: false }),
    db.from("students").select("full_name,admission_no").eq("id", invoice.student_id).maybeSingle(),
    db.from("wallet_balances").select("wallet_balance").eq("account_id", invoice.account_id).maybeSingle(),
  ]);
  const s = unwrap(st) as { full_name: string; admission_no: string | null } | null;
  const w = unwrap(wal) as { wallet_balance: number } | null;
  return {
    invoice, studentName: s?.full_name ?? null, admissionNo: s?.admission_no ?? null,
    items: unwrap(items) ?? [], payments: unwrap(pays) ?? [], receipts: unwrap(recs) ?? [], walletBalance: Number(w?.wallet_balance ?? 0),
  };
}

export interface DraftItemInput { productId: string; quantity: number; discountCode?: string; description?: string }
export interface DraftInvoiceInput { studentId: string; items: DraftItemInput[]; academicSessionId?: string | null; dueOn?: string; notes?: string }

export function validateDraftInvoice(i: DraftInvoiceInput): string[] {
  const e: string[] = [];
  if (!i.studentId) e.push("Choose a student.");
  if (!i.items.length) e.push("Add at least one fee item.");
  i.items.forEach((it, n) => {
    if (!it.productId) e.push(`Item ${n + 1}: choose a fee.`);
    if (!Number.isInteger(it.quantity) || it.quantity < 1) e.push(`Item ${n + 1}: quantity must be a whole number of at least 1.`);
  });
  if (i.dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(i.dueOn)) e.push("Due date is not a valid date.");
  return e;
}

/** Builds the p_items JSON for create_invoice. Never sends unit_price (manual price overrides are out of scope). */
export function buildInvoiceItems(items: DraftItemInput[]) {
  return items.map((it) => {
    const o: Record<string, unknown> = { product_id: it.productId, quantity: it.quantity };
    if (it.discountCode?.trim()) o.discount_code = it.discountCode.trim();
    if (it.description?.trim()) o.description = it.description.trim();
    return o;
  });
}

/** create_invoice prices every line, applies discounts and scholarships, and returns the draft id. */
export async function createDraftInvoice(i: DraftInvoiceInput): Promise<string> {
  return unwrap(await db.rpc("create_invoice", {
    p_student_id: i.studentId, p_items: buildInvoiceItems(i.items),
    p_academic_session_id: i.academicSessionId || null, p_due_on: i.dueOn || null, p_notes: i.notes?.trim() || null,
  })) as string;
}
export async function issueInvoice(id: string): Promise<void> { unwrap(await db.rpc("issue_invoice", { p_invoice_id: id })); }
export async function voidInvoice(id: string, reason: string): Promise<void> {
  unwrap(await db.rpc("void_invoice", { p_invoice_id: id, p_reason: reason.trim() }));
}
/** RLS allows deleting drafts only (invoices_delete_draft); the status filter is defensive. */
export async function deleteDraftInvoice(id: string): Promise<void> {
  unwrap(await db.from("customer_invoices").delete().eq("id", id).eq("status", "draft"));
}
export async function writeOffBalance(id: string, amountNaira: string, reason: string): Promise<void> {
  unwrap(await db.rpc("write_off_balance", { p_invoice_id: id, p_amount: nairaToKoboArg(amountNaira), p_reason: reason.trim() }));
}
/** amountNaira empty = let the database use as much wallet credit as is available. */
export async function applyWallet(id: string, amountNaira?: string): Promise<number> {
  const p_amount = amountNaira?.trim() ? nairaToKoboArg(amountNaira) : null;
  return Number(unwrap(await db.rpc("apply_wallet_to_invoice", { p_invoice_id: id, p_amount })) ?? 0);
}

// ---------- payments, receipts ----------

export type ManualProvider = "cash" | "bank_transfer" | "pos" | "other";
export const MANUAL_PROVIDERS: ManualProvider[] = ["cash", "bank_transfer", "pos", "other"];

export interface ManualPaymentInput {
  studentId: string; amountNaira: string; provider: ManualProvider; invoiceId?: string | null;
  reference?: string; paidAt?: string; payerName?: string; note?: string;
}
export async function recordManualPayment(i: ManualPaymentInput): Promise<string> {
  if (!MANUAL_PROVIDERS.includes(i.provider)) throw new Error("Choose cash, bank transfer, POS or other");
  return unwrap(await db.rpc("record_manual_payment", {
    p_student_id: i.studentId, p_amount: nairaToKoboArg(i.amountNaira), p_provider: i.provider,
    p_invoice_id: i.invoiceId || null, p_reference: i.reference?.trim() || null,
    p_paid_at: i.paidAt ? new Date(i.paidAt).toISOString() : null,
    p_payer_name: i.payerName?.trim() || null, p_note: i.note?.trim() || null,
  })) as string;
}

export interface PaymentListRow extends TransactionRow { studentName: string | null; receiptNumber: string | null }
export async function listPayments(): Promise<PaymentListRow[]> {
  const rows = (unwrap(await db.from("customer_payment_transactions").select(TXN_COLS).order("paid_at", { ascending: false }).limit(300)) ?? []) as TransactionRow[];
  if (!rows.length) return [];
  const [st, rc] = await Promise.all([
    db.from("students").select("id,full_name").in("id", [...new Set(rows.map((r) => r.student_id))]),
    db.from("customer_receipts").select("transaction_id,number").in("transaction_id", rows.map((r) => r.id)),
  ]);
  const students = (unwrap(st) ?? []) as { id: string; full_name: string }[];
  const receipts = (unwrap(rc) ?? []) as { transaction_id: string; number: string }[];
  return rows.map((r) => ({
    ...r,
    studentName: students.find((s) => s.id === r.student_id)?.full_name ?? null,
    receiptNumber: receipts.find((x) => x.transaction_id === r.id)?.number ?? null,
  }));
}

// ---------- refunds ----------

export type RefundStatus = "requested" | "approved" | "rejected" | "completed";
export interface RefundRow {
  id: string; transaction_id: string; invoice_id: string | null; student_id: string; amount: number; source: "invoice" | "wallet";
  reason: string; status: RefundStatus; requested_by: string | null; approved_by: string | null; decision_note: string | null;
  created_at: string; decided_at: string | null; completed_at: string | null; studentName?: string | null;
}
export async function listRefunds(): Promise<RefundRow[]> {
  const rows = (unwrap(await db.from("customer_refunds").select("id,transaction_id,invoice_id,student_id,amount,source,reason,status,requested_by,approved_by,decision_note,created_at,decided_at,completed_at").order("created_at", { ascending: false }).limit(300)) ?? []) as RefundRow[];
  if (!rows.length) return [];
  const st = (unwrap(await db.from("students").select("id,full_name").in("id", [...new Set(rows.map((r) => r.student_id))])) ?? []) as { id: string; full_name: string }[];
  return rows.map((r) => ({ ...r, studentName: st.find((s) => s.id === r.student_id)?.full_name ?? null }));
}
export async function requestRefund(transactionId: string, amountNaira: string, reason: string, source: "invoice" | "wallet"): Promise<string> {
  return unwrap(await db.rpc("request_refund", { p_transaction_id: transactionId, p_amount: nairaToKoboArg(amountNaira), p_reason: reason.trim(), p_source: source })) as string;
}
/** The database refuses approval by the person who requested the refund (separation of duties). */
export async function approveRefund(id: string, note?: string): Promise<void> {
  unwrap(await db.rpc("approve_refund", { p_refund_id: id, p_note: note?.trim() || null }));
}
export async function rejectRefund(id: string, note?: string): Promise<void> {
  unwrap(await db.rpc("reject_refund", { p_refund_id: id, p_note: note?.trim() || null }));
}
/** Call only after the money has actually been sent back to the payer. */
export async function completeRefund(id: string, providerRefundId?: string): Promise<void> {
  unwrap(await db.rpc("complete_refund", { p_refund_id: id, p_provider_refund_id: providerRefundId?.trim() || null }));
}

// ---------- accounts & statements ----------

export interface OutstandingRow { student_id: string; account_id: string; account_balance: number; outstanding: number; overdue: number; studentName: string | null; admissionNo: string | null; wallet: number }
export async function listOutstanding(): Promise<OutstandingRow[]> {
  const rows = (unwrap(await db.from("outstanding_balances").select("student_id,account_id,account_balance,outstanding,overdue").order("outstanding", { ascending: false }).limit(500)) ?? []) as Omit<OutstandingRow, "studentName" | "admissionNo" | "wallet">[];
  if (!rows.length) return [];
  const [st, wal] = await Promise.all([
    db.from("students").select("id,full_name,admission_no").in("id", rows.map((r) => r.student_id)),
    db.from("wallet_balances").select("account_id,wallet_balance").in("account_id", rows.map((r) => r.account_id)),
  ]);
  const students = (unwrap(st) ?? []) as { id: string; full_name: string; admission_no: string | null }[];
  const wallets = (unwrap(wal) ?? []) as { account_id: string; wallet_balance: number }[];
  return rows.map((r) => {
    const s = students.find((x) => x.id === r.student_id);
    return { ...r, studentName: s?.full_name ?? null, admissionNo: s?.admission_no ?? null, wallet: Number(wallets.find((w) => w.account_id === r.account_id)?.wallet_balance ?? 0) };
  });
}

export interface StatementRow { entry_id: number; posted_at: string; kind: string; entry_type: "debit" | "credit"; amount: number; balance_after: number; memo: string | null; invoice_number: string | null }
export async function getStatement(studentId: string): Promise<StatementRow[]> {
  return unwrap(await db.from("account_statement").select("entry_id,posted_at,kind,entry_type,amount,balance_after,memo,invoice_number").eq("student_id", studentId).order("posted_at", { ascending: true }).order("entry_id", { ascending: true })) ?? [];
}

// ---------- lookups ----------

export interface StudentPick { id: string; full_name: string; admission_no: string | null }
/** Student search through RLS (student.read). Wildcards in the query are escaped. */
export async function searchStudents(q: string): Promise<StudentPick[]> {
  const term = q.trim().replace(/[%_\\,()]/g, " ").trim();
  if (term.length < 2) return [];
  return unwrap(await db.from("students").select("id,full_name,admission_no").is("deleted_at", null)
    .or(`full_name.ilike.%${term}%,admission_no.ilike.%${term}%`).order("full_name").limit(20)) ?? [];
}
export interface SessionPick { id: string; name: string; term: string; is_current: boolean }
export async function listSessions(): Promise<SessionPick[]> {
  return unwrap(await db.from("academic_sessions").select("id,name,term,is_current").order("starts_on", { ascending: false })) ?? [];
}

// ---------- family view ----------

/** Students/parents: RLS returns only their own / ward's non-draft invoices. */
export async function listMyInvoices(): Promise<InvoiceSummaryRow[]> {
  return unwrap(await db.from("invoice_summary").select(SUMMARY_COLS).neq("status", "draft").order("issued_at", { ascending: false })) ?? [];
}
export async function listMyReceipts(): Promise<ReceiptRow[]> {
  return unwrap(await db.from("customer_receipts").select("id,transaction_id,invoice_id,student_id,number,amount,issued_at").order("issued_at", { ascending: false })) ?? [];
}

// ---------- errors ----------

export function describeFinanceError(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  if (/row-level security|permission denied for (table|view|function)/i.test(m)) return "You do not have permission to do this in the active organisation.";
  if (/duplicate key.*(tenant_products|code)/i.test(m)) return "A fee with that code already exists.";
  if (/duplicate key.*(uq_txn_provider_id|provider_txn)/i.test(m)) return "That bank/POS reference has already been recorded.";
  if (/someone other than the person who requested/i.test(m)) return "A refund must be approved by a different person from the one who requested it.";
  return m.replace(/^Permission denied: /, "Permission needed: ");
}
