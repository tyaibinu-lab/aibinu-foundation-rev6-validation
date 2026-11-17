import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FinanceShell } from "@/components/finance/FinanceShell";
import { FinanceError, InvoiceStatusBadge, Money, NoFinanceAccess, fmtDay, useLiveFinanceAccess } from "@/components/finance/live";
import { listCollectionSummary, listInvoices, listSessions, type InvoiceStatus } from "@/lib/finance/live";

export const Route = createFileRoute("/finance/invoices/")({
  head: () => ({
    meta: [
      { title: "Invoices — Finance — Aibinu Flexiprep" },
      { name: "description", content: "Student fee invoices, balances and collection progress." },
      { property: "og:title", content: "Invoices — Finance — Aibinu Flexiprep" },
      { property: "og:description", content: "Student fee invoices, balances and collection progress." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Invoices,
});

type Filter = "all" | InvoiceStatus | "overdue";
const FILTERS: { v: Filter; l: string }[] = [
  { v: "all", l: "All" }, { v: "draft", l: "Drafts" }, { v: "issued", l: "Issued" }, { v: "partially_paid", l: "Part paid" },
  { v: "overdue", l: "Overdue" }, { v: "paid", l: "Paid" }, { v: "void", l: "Void" },
];

function Invoices() {
  const access = useLiveFinanceAccess();
  const [filter, setFilter] = useState<Filter>("all");
  const list = useQuery({
    queryKey: ["finance", "invoices", filter],
    queryFn: () => listInvoices(filter === "all" ? undefined : filter),
    retry: false, enabled: access.staff,
  });
  const summary = useQuery({ queryKey: ["finance", "collection"], queryFn: listCollectionSummary, retry: false, enabled: access.staff });
  const sessions = useQuery({ queryKey: ["finance", "sessions"], queryFn: listSessions, retry: false, enabled: access.staff });

  if (access.loading) return <FinanceShell title="Invoices" subtitle="Checking access…"><span /></FinanceShell>;
  if (!access.staff) {
    return (
      <FinanceShell title="Invoices" subtitle="">
        {access.family ? <p className="text-sm">See your own fees on <Link to="/finance/my" className="text-primary underline underline-offset-4">My fees & receipts</Link>.</p> : <NoFinanceAccess need="finance.view_all (bursar or administrator)" />}
      </FinanceShell>
    );
  }

  const sessionName = (id: string | null) => (id ? sessions.data?.find((s) => s.id === id)?.name ?? "Session" : "No session");

  return (
    <FinanceShell title="Invoices" subtitle="Totals and balances come from the ledger. Payments and refunds update them automatically.">
      {access.manage && <Button asChild><Link to="/finance/invoices/new">New invoice</Link></Button>}
      {summary.error && <FinanceError error={summary.error} />}
      {!!summary.data?.length && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {summary.data.map((s) => (
            <Card key={s.academic_session_id ?? "none"}>
              <CardHeader className="pb-2"><CardTitle className="text-base">{sessionName(s.academic_session_id)}</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p>Billed <Money kobo={s.billed} className="font-semibold" /> · {s.invoices} invoice(s)</p>
                <p>Collected <Money kobo={s.collected} className="font-semibold" /></p>
                <p>Outstanding <Money kobo={s.outstanding} /> · overdue <Money kobo={s.overdue} className="text-destructive" /></p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Show</span>
        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <SelectTrigger aria-label="Filter invoices" className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>{FILTERS.map((f) => <SelectItem key={f.v} value={f.v}>{f.l}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="overflow-x-auto pt-6">
          {list.error && <FinanceError error={list.error} />}
          {list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {list.data?.length === 0 && <p className="text-sm text-muted-foreground">No invoices match.</p>}
          {!!list.data?.length && (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-muted-foreground"><th className="py-2 pr-3">Invoice</th><th className="pr-3">Student</th><th className="pr-3">Issued</th><th className="pr-3">Due</th><th className="pr-3 text-right">Total</th><th className="pr-3 text-right">Balance</th><th>Status</th></tr></thead>
              <tbody>
                {list.data.map((r) => (
                  <tr key={r.invoice_id} className="border-b border-border">
                    <td className="py-2 pr-3"><Link to="/finance/invoices/$invoiceId" params={{ invoiceId: r.invoice_id }} className="font-medium text-primary underline-offset-4 hover:underline">{r.number ?? "Draft"}</Link></td>
                    <td className="pr-3">{r.student_name}{r.admission_no && <span className="text-muted-foreground"> · {r.admission_no}</span>}</td>
                    <td className="pr-3">{fmtDay(r.issued_at)}</td>
                    <td className="pr-3">{fmtDay(r.due_on)}{r.is_overdue && <span className="text-destructive"> · {r.days_overdue}d late</span>}</td>
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
    </FinanceShell>
  );
}
