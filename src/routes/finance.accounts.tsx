import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FinanceShell } from "@/components/finance/FinanceShell";
import { FinanceError, Money, NoFinanceAccess, fmtWhen, label, useLiveFinanceAccess } from "@/components/finance/live";
import { getStatement, listOutstanding, type OutstandingRow } from "@/lib/finance/live";

export const Route = createFileRoute("/finance/accounts")({
  head: () => ({
    meta: [
      { title: "Student Accounts — Finance — Aibinu Flexiprep" },
      { name: "description", content: "What each student owes, wallet credit and statements of account." },
      { property: "og:title", content: "Student Accounts — Finance — Aibinu Flexiprep" },
      { property: "og:description", content: "What each student owes, wallet credit and statements of account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Accounts,
});

function Accounts() {
  const access = useLiveFinanceAccess();
  const list = useQuery({ queryKey: ["finance", "outstanding"], queryFn: listOutstanding, retry: false, enabled: access.staff });
  const [open, setOpen] = useState<OutstandingRow | null>(null);

  if (access.loading) return <FinanceShell title="Student accounts" subtitle="Checking access…"><span /></FinanceShell>;
  if (!access.staff) return <FinanceShell title="Student accounts" subtitle=""><NoFinanceAccess need="finance.view_all (bursar or administrator)" /></FinanceShell>;

  return (
    <FinanceShell title="Student accounts" subtitle="Balances are kept by the ledger. Statements list every posting in order.">
      {list.error && <FinanceError error={list.error} />}
      {open && <Statement row={open} close={() => setOpen(null)} />}
      <Card>
        <CardContent className="overflow-x-auto pt-6">
          {list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {list.data?.length === 0 && <p className="text-sm text-muted-foreground">No student accounts yet. An account is opened with a student's first invoice or payment.</p>}
          {!!list.data?.length && (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-muted-foreground"><th className="py-2 pr-3">Student</th><th className="pr-3 text-right">Outstanding</th><th className="pr-3 text-right">Overdue</th><th className="pr-3 text-right">Wallet credit</th><th /></tr></thead>
              <tbody>
                {list.data.map((r) => (
                  <tr key={r.account_id} className="border-b border-border">
                    <td className="py-2 pr-3">{r.studentName ?? "—"}{r.admissionNo && <span className="text-muted-foreground"> · {r.admissionNo}</span>}</td>
                    <td className="pr-3 text-right"><Money kobo={r.outstanding} /></td>
                    <td className="pr-3 text-right"><Money kobo={r.overdue} className={r.overdue > 0 ? "text-destructive" : ""} /></td>
                    <td className="pr-3 text-right"><Money kobo={r.wallet} /></td>
                    <td><button type="button" className="text-primary underline underline-offset-4" onClick={() => setOpen(r)}>Statement</button></td>
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

function Statement({ row, close }: { row: OutstandingRow; close: () => void }) {
  const q = useQuery({ queryKey: ["finance", "statement", row.student_id], queryFn: () => getStatement(row.student_id), retry: false });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Statement — {row.studentName}</CardTitle>
        <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => window.print()}>Print</Button><Button variant="ghost" size="sm" onClick={close}>Close</Button></div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {q.error && <FinanceError error={q.error} />}
        {q.data?.length === 0 && <p className="text-sm text-muted-foreground">No postings.</p>}
        {!!q.data?.length && (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-muted-foreground"><th className="py-2 pr-3">Date</th><th className="pr-3">Entry</th><th className="pr-3">Invoice</th><th className="pr-3 text-right">Debit</th><th className="pr-3 text-right">Credit</th><th className="text-right">Balance</th></tr></thead>
            <tbody>
              {q.data.map((e) => (
                <tr key={e.entry_id} className="border-b border-border">
                  <td className="py-2 pr-3">{fmtWhen(e.posted_at)}</td>
                  <td className="pr-3">{label(e.kind)}{e.memo && <span className="text-muted-foreground"> · {e.memo}</span>}</td>
                  <td className="pr-3">{e.invoice_number ?? "—"}</td>
                  <td className="pr-3 text-right">{e.entry_type === "debit" ? <Money kobo={e.amount} /> : ""}</td>
                  <td className="pr-3 text-right">{e.entry_type === "credit" ? <Money kobo={e.amount} /> : ""}</td>
                  <td className="text-right"><Money kobo={e.balance_after} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
