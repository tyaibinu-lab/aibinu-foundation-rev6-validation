import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FinanceShell } from "@/components/finance/FinanceShell";
import { FinanceError, InvoiceStatusBadge, Money, NoFinanceAccess, fmtDay, fmtWhen, useLiveFinanceAccess } from "@/components/finance/live";
import { listMyInvoices, listMyReceipts } from "@/lib/finance/live";

export const Route = createFileRoute("/finance/my")({
  head: () => ({
    meta: [
      { title: "My Fees & Receipts — Aibinu Flexiprep" },
      { name: "description", content: "Your (or your child's) school fees, balances and receipts." },
      { property: "og:title", content: "My Fees & Receipts — Aibinu Flexiprep" },
      { property: "og:description", content: "Your (or your child's) school fees, balances and receipts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyFees,
});

// Students and parents: RLS (finance.read + is_self_or_parent) limits rows to their own / ward's
// issued invoices and receipts. Staff with finance.view_all would see everyone, so they are sent
// to the staff pages instead of rendering an organisation-wide list here.
function MyFees() {
  const access = useLiveFinanceAccess();
  const family = access.family;
  const invoices = useQuery({ queryKey: ["finance", "my", "invoices"], queryFn: listMyInvoices, retry: false, enabled: family });
  const receipts = useQuery({ queryKey: ["finance", "my", "receipts"], queryFn: listMyReceipts, retry: false, enabled: family });

  if (access.loading) return <FinanceShell title="My fees" subtitle="Checking access…"><span /></FinanceShell>;
  if (access.staff) {
    return <FinanceShell title="My fees" subtitle=""><p className="text-sm">You have staff finance access. Use <Link to="/finance/invoices" className="text-primary underline underline-offset-4">Invoices</Link> and <Link to="/finance/payments" className="text-primary underline underline-offset-4">Payments</Link>.</p></FinanceShell>;
  }
  if (!family) return <FinanceShell title="My fees" subtitle=""><NoFinanceAccess need="a student or parent account" /></FinanceShell>;

  const owed = (invoices.data ?? []).filter((i) => i.status === "issued" || i.status === "partially_paid").reduce((a, i) => a + Number(i.balance), 0);

  return (
    <FinanceShell title="My fees & receipts" subtitle="To pay, use the school's bank details or pay at the bursary. Online card payment will appear here once the school switches it on.">
      {invoices.error && <FinanceError error={invoices.error} />}
      <Card><CardContent className="pt-6 text-sm"><p className="text-muted-foreground">Total outstanding</p><Money kobo={owed} className="text-2xl font-bold" /></CardContent></Card>
      <Card>
        <CardHeader><CardTitle>Invoices</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {invoices.data?.length === 0 && <p className="text-sm text-muted-foreground">No invoices.</p>}
          {!!invoices.data?.length && (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-muted-foreground"><th className="py-2 pr-3">Invoice</th><th className="pr-3">Student</th><th className="pr-3">Due</th><th className="pr-3 text-right">Total</th><th className="pr-3 text-right">Balance</th><th>Status</th></tr></thead>
              <tbody>
                {invoices.data.map((r) => (
                  <tr key={r.invoice_id} className="border-b border-border">
                    <td className="py-2 pr-3"><Link to="/finance/invoices/$invoiceId" params={{ invoiceId: r.invoice_id }} className="text-primary underline-offset-4 hover:underline">{r.number}</Link></td>
                    <td className="pr-3">{r.student_name}</td>
                    <td className="pr-3">{fmtDay(r.due_on)}</td>
                    <td className="pr-3 text-right"><Money kobo={r.total} /></td>
                    <td className="pr-3 text-right"><Money kobo={r.balance} /></td>
                    <td><InvoiceStatusBadge status={r.status} overdue={r.is_overdue} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Receipts</CardTitle></CardHeader>
        <CardContent className="text-sm">
          {receipts.error && <FinanceError error={receipts.error} />}
          {receipts.data?.length === 0 && <p className="text-muted-foreground">No receipts yet.</p>}
          <ul className="divide-y divide-border">
            {receipts.data?.map((r) => <li key={r.id} className="flex justify-between py-2"><span>{r.number} · {fmtWhen(r.issued_at)}</span><Money kobo={r.amount} /></li>)}
          </ul>
        </CardContent>
      </Card>
    </FinanceShell>
  );
}
