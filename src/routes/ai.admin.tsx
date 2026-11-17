import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AiError, AiShell, fmtWhen, label, useAiAccess } from "@/components/ai/shared";
import { decideJob, getCreditBalance, getUsageThisMonth, listJobs } from "@/lib/ai/api";

export const Route = createFileRoute("/ai/admin")({
  head: () => ({
    meta: [
      { title: "AI Approvals & Usage — Aibinu Flexiprep" },
      { name: "description", content: "Approve large AI requests and watch AI credits and usage." },
      { property: "og:title", content: "AI Approvals & Usage — Aibinu Flexiprep" },
      { property: "og:description", content: "Approve large AI requests and watch AI credits and usage." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AiAdmin,
});

// ai.manage only. approve_ai_job refuses a manager's own requests (separation of duties).
// The platform-wide AI on/off switch is platform-admin only and deliberately not exposed here.
function AiAdmin() {
  const access = useAiAccess();
  const qc = useQueryClient();
  const pending = useQuery({ queryKey: ["ai", "jobs", "awaiting"], queryFn: () => listJobs("awaiting_approval"), retry: false, enabled: access.manage });
  const balance = useQuery({ queryKey: ["ai", "balance"], queryFn: getCreditBalance, retry: false, enabled: access.manage });
  const usage = useQuery({ queryKey: ["ai", "usage"], queryFn: getUsageThisMonth, retry: false, enabled: access.manage });
  const [reason, setReason] = useState<Record<string, string>>({});
  const decide = useMutation({
    mutationFn: (p: { id: string; approve: boolean }) => decideJob(p.id, p.approve, reason[p.id]),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ai"] }),
  });

  if (access.loading) return <AiShell title="Approvals & usage" subtitle="Checking access…"><span /></AiShell>;
  if (!access.manage) return <AiShell title="Approvals & usage" subtitle=""><div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">This page is for AI administrators (ai.manage).</div></AiShell>;

  return (
    <AiShell title="Approvals & usage" subtitle="Requests above the plan's credit threshold wait here. You cannot approve your own request.">
      <div className="grid gap-3 sm:grid-cols-3">
        {balance.error && <AiError error={balance.error} title="Could not load credits" />}
        {[["Credits available", balance.data?.available], ["Held for running jobs", balance.data?.held], ["Used", balance.data?.consumed]].map(([l, v]) => (
          <Card key={l as string}><CardContent className="pt-6 text-sm"><p className="text-muted-foreground">{l}</p><p className="text-2xl font-bold tabular-nums">{v ?? "—"}</p></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Awaiting approval</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {pending.error && <AiError error={pending.error} title="Could not load requests" />}
          {decide.error && <AiError error={decide.error} title="Decision not saved" />}
          {pending.data?.length === 0 && <p className="text-muted-foreground">Nothing waiting.</p>}
          {pending.data?.map((j) => (
            <div key={j.id} className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
              <span className="font-medium">{label(j.type)}</span>
              <span className="text-muted-foreground">{fmtWhen(j.created_at)} · est. {j.estimated_credits ?? "?"} credits</span>
              <Input className="max-w-xs" placeholder="Reason (optional)" value={reason[j.id] ?? ""} onChange={(e) => setReason({ ...reason, [j.id]: e.target.value })} />
              <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: j.id, approve: true })}>Approve</Button>
              <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ id: j.id, approve: false })}>Reject</Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>This month</CardTitle></CardHeader>
        <CardContent className="text-sm">
          {usage.error && <AiError error={usage.error} title="Could not load usage" />}
          {usage.data?.length === 0 && <p className="text-muted-foreground">No AI jobs this month.</p>}
          {!!usage.data?.length && (
            <table className="w-full">
              <thead><tr className="border-b border-border text-left text-muted-foreground"><th className="py-2 pr-3">Type</th><th className="pr-3">Jobs</th><th className="pr-3">Failed</th><th>Provider cost (USD)</th></tr></thead>
              <tbody>{usage.data.map((u) => <tr key={u.type} className="border-b border-border"><td className="py-2 pr-3">{label(u.type)}</td><td className="pr-3">{u.jobs}</td><td className="pr-3">{u.failed}</td><td>{Number(u.cost_usd).toFixed(4)}</td></tr>)}</tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </AiShell>
  );
}
