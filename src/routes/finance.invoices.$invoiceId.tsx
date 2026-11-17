import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FinanceShell } from "@/components/finance/FinanceShell";
import { formatKobo } from "@/lib/finance/currency";
import { FinanceError, InvoiceStatusBadge, Money, NoFinanceAccess, fmtDay, fmtWhen, label, useLiveFinanceAccess } from "@/components/finance/live";
import {
  MANUAL_PROVIDERS,
  applyWallet,
  deleteDraftInvoice,
  getInvoice,
  issueInvoice,
  recordManualPayment,
  voidInvoice,
  writeOffBalance,
  type ManualProvider,
} from "@/lib/finance/live";

export const Route = createFileRoute("/finance/invoices/$invoiceId")({
  head: () => ({
    meta: [
      { title: "Invoice — Finance — Aibinu Flexiprep" },
      { name: "description", content: "Invoice lines, payments and actions." },
      { property: "og:title", content: "Invoice — Finance — Aibinu Flexiprep" },
      { property: "og:description", content: "Invoice lines, payments and actions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InvoicePage,
});

type Panel = null | "pay" | "void" | "writeoff" | "wallet" | "issue" | "delete";

function InvoicePage() {
  const { invoiceId } = Route.useParams();
  const access = useLiveFinanceAccess();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const inv = useQuery({ queryKey: ["finance", "invoice", invoiceId], queryFn: () => getInvoice(invoiceId), retry: false, enabled: access.any });
  const [panel, setPanel] = useState<Panel>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [provider, setProvider] = useState<ManualProvider>("cash");
  const [reference, setReference] = useState("");
  const [payer, setPayer] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const after = (msg: string) => {
    setPanel(null); setAmount(""); setReason(""); setReference(""); setPayer(""); setDone(msg);
    void qc.invalidateQueries({ queryKey: ["finance"] });
  };
  const act = useMutation({
    mutationFn: async (p: Panel) => {
      const d = inv.data!;
      switch (p) {
        case "issue": await issueInvoice(invoiceId); return "Invoice issued. Any wallet credit was applied automatically.";
        case "void": await voidInvoice(invoiceId, reason); return "Invoice voided. Any amount already paid moved to the student's wallet.";
        case "writeoff": await writeOffBalance(invoiceId, amount, reason); return "Balance written off.";
        case "wallet": { const used = await applyWallet(invoiceId, amount); return `Applied ${formatKobo(used)} of wallet credit.`; }
        case "pay": await recordManualPayment({ studentId: d.invoice.student_id, invoiceId, amountNaira: amount, provider, reference, payerName: payer }); return "Payment recorded and receipt issued.";
        case "delete": await deleteDraftInvoice(invoiceId); return "deleted";
        default: return "";
      }
    },
    onSuccess: (msg) => {
      if (msg === "deleted") { void qc.invalidateQueries({ queryKey: ["finance"] }); void navigate({ to: "/finance/invoices" }); return; }
      after(msg);
    },
  });

  if (access.loading) return <FinanceShell title="Invoice" subtitle="Checking access…"><span /></FinanceShell>;
  if (!access.any) return <FinanceShell title="Invoice" subtitle=""><NoFinanceAccess /></FinanceShell>;
  if (inv.error) return <FinanceShell title="Invoice" subtitle=""><FinanceError error={inv.error} title="Invoice not available" /></FinanceShell>;
  if (!inv.data) return <FinanceShell title="Invoice" subtitle="Loading…"><span /></FinanceShell>;

  const { invoice: i, items, payments, receipts, walletBalance } = inv.data;
  const open = i.status === "issued" || i.status === "partially_paid";
  const overdue = open && !!i.due_on && new Date(i.due_on) < new Date(new Date().toDateString());

  return (
    <FinanceShell
      title={i.number ? `Invoice ${i.number}` : "Draft invoice"}
      subtitle={`${inv.data.studentName ?? "Student"}${inv.data.admissionNo ? ` · ${inv.data.admissionNo}` : ""} · issued ${fmtDay(i.issued_at)} · due ${fmtDay(i.due_on)}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" asChild><Link to={access.staff ? "/finance/invoices" : "/finance/my"}>← Back</Link></Button>
        <InvoiceStatusBadge status={i.status} overdue={overdue} />
      </div>
      {act.error && <FinanceError error={act.error} />}
      {done && <Alert><AlertTitle>Done</AlertTitle><AlertDescription>{done}</AlertDescription></Alert>}
      {i.status === "void" && <Alert><AlertTitle>Void</AlertTitle><AlertDescription>{fmtWhen(i.voided_at)} — {i.void_reason}</AlertDescription></Alert>}

      <div className="grid gap-3 sm:grid-cols-4">
        {[["Total", i.total], ["Paid", i.total - i.balance], ["Balance", i.balance], ["Wallet credit", walletBalance]].map(([l, v]) => (
          <Card key={l as string}><CardContent className="pt-6 text-sm"><p className="text-muted-foreground">{l}</p><Money kobo={v as number} className="text-lg font-semibold" /></CardContent></Card>
        ))}
      </div>

      {access.manage && (
        <Card>
          <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              {i.status === "draft" && <Button onClick={() => setPanel("issue")}>Issue invoice</Button>}
              {i.status === "draft" && <Button variant="outline" onClick={() => setPanel("delete")}>Delete draft</Button>}
              {open && <Button onClick={() => setPanel("pay")}>Record payment</Button>}
              {open && walletBalance > 0 && <Button variant="outline" onClick={() => setPanel("wallet")}>Use wallet credit</Button>}
              {open && access.approve && <Button variant="outline" onClick={() => setPanel("writeoff")}>Write off</Button>}
              {i.status !== "void" && <Button variant="outline" onClick={() => setPanel("void")}>Void</Button>}
            </div>

            {panel === "issue" && (
              <Confirm text="Issuing numbers the invoice and posts it to the student's account. It can then only be voided, not edited." go={() => act.mutate("issue")} pending={act.isPending} cancel={() => setPanel(null)} />
            )}
            {panel === "delete" && (
              <Confirm text="Delete this draft? Nothing has been posted to the account." go={() => act.mutate("delete")} pending={act.isPending} cancel={() => setPanel(null)} />
            )}
            {panel === "pay" && (
              <div className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-2">
                <Field id="pay-amt" label="Amount (₦)" value={amount} set={setAmount} placeholder="Up to the balance; extra goes to wallet" />
                <div className="space-y-1">
                  <Label>Method</Label>
                  <Select value={provider} onValueChange={(v) => setProvider(v as ManualProvider)}>
                    <SelectTrigger aria-label="Payment method"><SelectValue /></SelectTrigger>
                    <SelectContent>{MANUAL_PROVIDERS.map((p) => <SelectItem key={p} value={p}>{label(p)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Field id="pay-ref" label="Bank / POS reference" value={reference} set={setReference} placeholder="Recorded once only" />
                <Field id="pay-name" label="Payer name" value={payer} set={setPayer} />
                <div className="flex gap-2 sm:col-span-2">
                  <Button disabled={!amount.trim() || act.isPending} onClick={() => act.mutate("pay")}>{act.isPending ? "Recording…" : "Record payment"}</Button>
                  <Button variant="outline" onClick={() => setPanel(null)}>Cancel</Button>
                </div>
              </div>
            )}
            {panel === "wallet" && (
              <div className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3">
                <Field id="w-amt" label="Amount (₦)" value={amount} set={setAmount} placeholder="Empty = as much as available" />
                <Button disabled={act.isPending} onClick={() => act.mutate("wallet")}>Apply credit</Button>
                <Button variant="outline" onClick={() => setPanel(null)}>Cancel</Button>
              </div>
            )}
            {(panel === "void" || panel === "writeoff") && (
              <div className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-2">
                {panel === "writeoff" && <Field id="wo-amt" label="Amount to forgive (₦)" value={amount} set={setAmount} />}
                <Field id="reason" label="Reason (required, kept in the audit log)" value={reason} set={setReason} />
                <div className="flex gap-2 sm:col-span-2">
                  <Button
                    variant="destructive"
                    disabled={!reason.trim() || (panel === "writeoff" && !amount.trim()) || act.isPending}
                    onClick={() => act.mutate(panel)}
                  >{panel === "void" ? "Void invoice" : "Write off"}</Button>
                  <Button variant="outline" onClick={() => setPanel(null)}>Cancel</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Lines</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-muted-foreground"><th className="py-2 pr-3">Item</th><th className="pr-3 text-right">Qty</th><th className="pr-3 text-right">Unit</th><th className="pr-3 text-right">Discount</th><th className="pr-3 text-right">Scholarship</th><th className="text-right">Line total</th></tr></thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.id} className="border-b border-border">
                  <td className="py-2 pr-3">{x.description}</td>
                  <td className="pr-3 text-right">{x.quantity}</td>
                  <td className="pr-3 text-right"><Money kobo={x.unit_price} /></td>
                  <td className="pr-3 text-right"><Money kobo={x.discount_amount} /></td>
                  <td className="pr-3 text-right"><Money kobo={x.scholarship_amount} /></td>
                  <td className="text-right font-medium"><Money kobo={x.line_total} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {i.notes && <p className="mt-3 text-sm text-muted-foreground">Notes: {i.notes}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Payments & receipts</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto text-sm">
          {payments.length === 0 ? <p className="text-muted-foreground">No payments yet.</p> : (
            <table className="w-full">
              <thead><tr className="border-b border-border text-left text-muted-foreground"><th className="py-2 pr-3">Date</th><th className="pr-3">Method</th><th className="pr-3">Reference</th><th className="pr-3 text-right">Amount</th><th className="pr-3 text-right">To invoice</th><th className="pr-3 text-right">To wallet</th><th>Receipt</th></tr></thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-border">
                    <td className="py-2 pr-3">{fmtWhen(p.paid_at)}</td>
                    <td className="pr-3">{label(p.provider)}</td>
                    <td className="pr-3">{p.provider_txn_id ?? "—"}</td>
                    <td className="pr-3 text-right"><Money kobo={p.amount} /></td>
                    <td className="pr-3 text-right"><Money kobo={p.applied_amount} /></td>
                    <td className="pr-3 text-right"><Money kobo={p.wallet_amount} /></td>
                    <td>{receipts.find((r) => r.transaction_id === p.id)?.number ?? "—"}</td>
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

function Field({ id, label: l, value, set, placeholder }: { id: string; label: string; value: string; set: (v: string) => void; placeholder?: string }) {
  return <div className="space-y-1"><Label htmlFor={id}>{l}</Label><Input id={id} value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder} /></div>;
}

function Confirm({ text, go, pending, cancel }: { text: string; go: () => void; pending: boolean; cancel: () => void }) {
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <p>{text}</p>
      <div className="flex gap-2"><Button onClick={go} disabled={pending}>{pending ? "Working…" : "Confirm"}</Button><Button variant="outline" onClick={cancel}>Cancel</Button></div>
    </div>
  );
}
