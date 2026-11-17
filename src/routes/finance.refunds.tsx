import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FinanceShell } from "@/components/finance/FinanceShell";
import { FinanceError, Money, NoFinanceAccess, fmtWhen, useLiveFinanceAccess } from "@/components/finance/live";
import { approveRefund, completeRefund, listRefunds, rejectRefund, type RefundRow } from "@/lib/finance/live";

export const Route = createFileRoute("/finance/refunds")({
  head: () => ({
    meta: [
      { title: "Refunds — Finance — Aibinu Flexiprep" },
      { name: "description", content: "Refund requests, approvals and completion." },
      { property: "og:title", content: "Refunds — Finance — Aibinu Flexiprep" },
      { property: "og:description", content: "Refund requests, approvals and completion." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Refunds,
});

function Refunds() {
  const access = useLiveFinanceAccess();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["finance", "refunds"], queryFn: listRefunds, retry: false, enabled: access.staff });
  const [note, setNote] = useState<Record<string, string>>({});
  const act = useMutation({
    mutationFn: async (p: { r: RefundRow; kind: "approve" | "reject" | "complete" }) => {
      const n = note[p.r.id];
      if (p.kind === "approve") return approveRefund(p.r.id, n);
      if (p.kind === "reject") return rejectRefund(p.r.id, n);
      return completeRefund(p.r.id, n);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["finance"] }),
  });

  if (access.loading) return <FinanceShell title="Refunds" subtitle="Checking access…"><span /></FinanceShell>;
  if (!access.staff) return <FinanceShell title="Refunds" subtitle=""><NoFinanceAccess need="finance.view_all (bursar or administrator)" /></FinanceShell>;

  return (
    <FinanceShell title="Refunds" subtitle="Request → approve (by a different person) → complete after the money has been sent back. Request refunds from the Payments page.">
      {list.error && <FinanceError error={list.error} />}
      {act.error && <FinanceError error={act.error} />}
      {list.data?.length === 0 && <p className="text-sm text-muted-foreground">No refunds.</p>}
      {list.data?.map((r) => (
        <Card key={r.id}>
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <Money kobo={r.amount} /> · {r.studentName ?? "Student"}
              <Badge variant={r.status === "completed" ? "default" : r.status === "rejected" ? "outline" : "secondary"}>{r.status}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{r.reason} · from {r.source === "invoice" ? "invoice" : "wallet"} · requested {fmtWhen(r.created_at)}</p>
            {r.decision_note && <p className="text-muted-foreground">Note: {r.decision_note}</p>}
            {r.status === "requested" && access.approve && (
              <div className="flex flex-wrap items-center gap-2">
                <Input className="max-w-xs" placeholder="Decision note (optional)" value={note[r.id] ?? ""} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} />
                <Button size="sm" disabled={act.isPending} onClick={() => act.mutate({ r, kind: "approve" })}>Approve</Button>
                <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ r, kind: "reject" })}>Reject</Button>
              </div>
            )}
            {r.status === "requested" && !access.approve && <p className="text-muted-foreground">Awaiting approval by someone with refund approval.</p>}
            {r.status === "approved" && access.manage && (
              <div className="flex flex-wrap items-center gap-2">
                <Input className="max-w-xs" placeholder="Bank / provider refund reference" value={note[r.id] ?? ""} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} />
                <Button size="sm" disabled={act.isPending} onClick={() => act.mutate({ r, kind: "complete" })}>Mark money sent</Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </FinanceShell>
  );
}
