import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FinanceShell } from "@/components/finance/FinanceShell";
import { FinanceError, Money, NoFinanceAccess, StudentPicker, fmtWhen, label, useLiveFinanceAccess } from "@/components/finance/live";
import {
  MANUAL_PROVIDERS,
  listPayments,
  recordManualPayment,
  requestRefund,
  type ManualProvider,
  type PaymentListRow,
  type StudentPick,
} from "@/lib/finance/live";

export const Route = createFileRoute("/finance/payments")({
  head: () => ({
    meta: [
      { title: "Payments — Finance — Aibinu Flexiprep" },
      { name: "description", content: "Record cash, transfer and POS payments and see receipts." },
      { property: "og:title", content: "Payments — Finance — Aibinu Flexiprep" },
      { property: "og:description", content: "Record cash, transfer and POS payments and see receipts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Payments,
});

function Payments() {
  const access = useLiveFinanceAccess();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["finance", "payments"], queryFn: listPayments, retry: false, enabled: access.staff });

  const [student, setStudent] = useState<StudentPick | null>(null);
  const [amount, setAmount] = useState("");
  const [provider, setProvider] = useState<ManualProvider>("cash");
  const [reference, setReference] = useState("");
  const [payer, setPayer] = useState("");
  const [note, setNote] = useState("");
  const record = useMutation({
    mutationFn: () => recordManualPayment({ studentId: student!.id, amountNaira: amount, provider, reference, payerName: payer, note }),
    onSuccess: () => { setAmount(""); setReference(""); setPayer(""); setNote(""); void qc.invalidateQueries({ queryKey: ["finance"] }); },
  });

  const [refundFor, setRefundFor] = useState<PaymentListRow | null>(null);
  const [rAmount, setRAmount] = useState("");
  const [rReason, setRReason] = useState("");
  const [rSource, setRSource] = useState<"invoice" | "wallet">("invoice");
  const refund = useMutation({
    mutationFn: () => requestRefund(refundFor!.id, rAmount, rReason, rSource),
    onSuccess: () => { setRefundFor(null); setRAmount(""); setRReason(""); void qc.invalidateQueries({ queryKey: ["finance"] }); },
  });

  if (access.loading) return <FinanceShell title="Payments" subtitle="Checking access…"><span /></FinanceShell>;
  if (!access.staff) return <FinanceShell title="Payments" subtitle=""><NoFinanceAccess need="finance.view_all (bursar or administrator)" /></FinanceShell>;

  return (
    <FinanceShell title="Payments" subtitle="Cash, bank transfer and POS. Online card payments arrive automatically once the payment gateway is connected (separate approval).">
      {access.manage && (
        <Card>
          <CardHeader><CardTitle>Record a payment without an invoice</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">Money is held as wallet credit and used automatically on the student's next invoice. To pay a specific invoice, open the invoice instead.</p>
            <StudentPicker value={student} onChange={setStudent} />
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1"><Label htmlFor="amt">Amount (₦)</Label><Input id="amt" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              <div className="space-y-1">
                <Label>Method</Label>
                <Select value={provider} onValueChange={(v) => setProvider(v as ManualProvider)}>
                  <SelectTrigger aria-label="Payment method"><SelectValue /></SelectTrigger>
                  <SelectContent>{MANUAL_PROVIDERS.map((p) => <SelectItem key={p} value={p}>{label(p)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label htmlFor="ref">Reference</Label><Input id="ref" value={reference} onChange={(e) => setReference(e.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="payer">Payer name</Label><Input id="payer" value={payer} onChange={(e) => setPayer(e.target.value)} /></div>
              <div className="space-y-1 sm:col-span-2"><Label htmlFor="note">Note</Label><Input id="note" value={note} onChange={(e) => setNote(e.target.value)} /></div>
            </div>
            {record.error && <FinanceError error={record.error} />}
            {record.isSuccess && <Alert><AlertTitle>Recorded</AlertTitle><AlertDescription>Payment saved and receipt issued.</AlertDescription></Alert>}
            <Button disabled={!student || !amount.trim() || record.isPending} onClick={() => record.mutate()}>{record.isPending ? "Recording…" : "Record payment"}</Button>
          </CardContent>
        </Card>
      )}

      {refundFor && (
        <Card>
          <CardHeader><CardTitle>Request a refund — {refundFor.studentName}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">Payment of <Money kobo={refundFor.amount} /> on {fmtWhen(refundFor.paid_at)}. A different person with refund approval must approve it before it is completed.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1"><Label htmlFor="r-amt">Amount (₦)</Label><Input id="r-amt" value={rAmount} onChange={(e) => setRAmount(e.target.value)} /></div>
              <div className="space-y-1">
                <Label>Take it from</Label>
                <Select value={rSource} onValueChange={(v) => setRSource(v as "invoice" | "wallet")}>
                  <SelectTrigger aria-label="Refund source"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="invoice">The invoice (fee owed again)</SelectItem><SelectItem value="wallet">Wallet credit</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label htmlFor="r-reason">Reason</Label><Input id="r-reason" value={rReason} onChange={(e) => setRReason(e.target.value)} /></div>
            </div>
            {refund.error && <FinanceError error={refund.error} />}
            <div className="flex gap-2">
              <Button disabled={!rAmount.trim() || !rReason.trim() || refund.isPending} onClick={() => refund.mutate()}>Request refund</Button>
              <Button variant="outline" onClick={() => setRefundFor(null)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Recent payments</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {list.error && <FinanceError error={list.error} />}
          {list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {list.data?.length === 0 && <p className="text-sm text-muted-foreground">No payments yet.</p>}
          {!!list.data?.length && (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-muted-foreground"><th className="py-2 pr-3">Date</th><th className="pr-3">Student</th><th className="pr-3">Method</th><th className="pr-3">Reference</th><th className="pr-3 text-right">Amount</th><th className="pr-3">Receipt</th><th className="pr-3">Invoice</th><th /></tr></thead>
              <tbody>
                {list.data.map((p) => (
                  <tr key={p.id} className="border-b border-border">
                    <td className="py-2 pr-3">{fmtWhen(p.paid_at)}</td>
                    <td className="pr-3">{p.studentName ?? "—"}</td>
                    <td className="pr-3">{label(p.provider)}</td>
                    <td className="pr-3">{p.provider_txn_id ?? "—"}</td>
                    <td className="pr-3 text-right"><Money kobo={p.amount} /></td>
                    <td className="pr-3">{p.receiptNumber ?? "—"}</td>
                    <td className="pr-3">{p.invoice_id ? <Link to="/finance/invoices/$invoiceId" params={{ invoiceId: p.invoice_id }} className="text-primary underline underline-offset-4">Open</Link> : "Wallet"}</td>
                    <td>{access.manage && <button type="button" className="text-xs text-primary underline" onClick={() => { setRefundFor(p); setRSource(p.invoice_id ? "invoice" : "wallet"); }}>Refund…</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </FinanceShell>
  );
}
