import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CasError, LearningShell, fmtDay, label, useCasAccess } from "@/components/cas/shared";
import {
  REPORT_CHANNELS,
  approveReport,
  draftReportsForClass,
  listClasses,
  listReports,
  markReportSent,
  pct,
  validatePeriod,
  type ReportChannel,
  type ReportRow,
  type ReportStatus,
} from "@/lib/cas/api";
import { describeAiError, fetchAiAccess, listSuggestions, requestReportComment } from "@/lib/ai/api";

export const Route = createFileRoute("/learning/reports")({
  head: () => ({
    meta: [
      { title: "Parent Reports — Aibinu Flexiprep" },
      { name: "description", content: "Draft, approve and send progress reports to parents." },
      { property: "og:title", content: "Parent Reports — Aibinu Flexiprep" },
      { property: "og:description", content: "Draft, approve and send progress reports to parents." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Reports,
});

function Reports() {
  const access = useCasAccess();
  const qc = useQueryClient();
  const [status, setStatus] = useState<ReportStatus | "all">("all");
  const list = useQuery({
    queryKey: ["cas", "reports", status],
    queryFn: () => listReports(status === "all" ? undefined : status),
    retry: false, enabled: !access.loading,
  });
  const classes = useQuery({ queryKey: ["cas", "classes"], queryFn: listClasses, retry: false, enabled: access.manage });
  const [classId, setClassId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const draft = useMutation({ mutationFn: () => draftReportsForClass(classId, from, to), onSuccess: () => void qc.invalidateQueries({ queryKey: ["cas", "reports"] }) });

  if (access.loading) return <LearningShell title="Reports" subtitle="Checking access…"><span /></LearningShell>;

  return (
    <LearningShell title="Progress reports" subtitle={access.staff ? "Reports are built only from released results. Draft → approve (add your comment) → send." : "Reports your school has sent to you."}>
      {access.manage && (
        <Card>
          <CardHeader><CardTitle>Draft reports for a class</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>Class</Label>
                <Select value={classId} onValueChange={setClassId}>
                  <SelectTrigger aria-label="Class"><SelectValue placeholder="Choose a class" /></SelectTrigger>
                  <SelectContent>{(classes.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label htmlFor="from">From</Label><Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="to">To</Label><Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            </div>
            {errors.length > 0 && <ul className="list-disc pl-5 text-destructive">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
            {draft.error && <CasError error={draft.error} />}
            {draft.data !== undefined && <Alert><AlertTitle>Drafted</AlertTitle><AlertDescription>{draft.data} new report(s). Students who already had a report for this period were skipped.</AlertDescription></Alert>}
            <Button
              disabled={!classId || draft.isPending}
              onClick={() => { const e = validatePeriod(from, to); setErrors(e); if (!e.length) draft.mutate(); }}
            >{draft.isPending ? "Drafting…" : "Draft reports"}</Button>
          </CardContent>
        </Card>
      )}

      {access.staff && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Show</span>
          <Select value={status} onValueChange={(v) => setStatus(v as ReportStatus | "all")}>
            <SelectTrigger aria-label="Report status" className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="draft">Drafts</SelectItem><SelectItem value="approved">Approved</SelectItem><SelectItem value="sent">Sent</SelectItem><SelectItem value="all">All</SelectItem></SelectContent>
          </Select>
        </div>
      )}
      {list.error && <CasError error={list.error} />}
      {list.data?.length === 0 && <p className="text-sm text-muted-foreground">No reports.</p>}
      {list.data?.map((r) => <ReportCard key={r.id} r={r} manage={access.manage} />)}
    </LearningShell>
  );
}

function ReportCard({ r, manage }: { r: ReportRow; manage: boolean }) {
  const qc = useQueryClient();
  const c = r.content;
  const [comment, setComment] = useState(c.teacher_comment ?? "");
  const [channel, setChannel] = useState<ReportChannel>("whatsapp");
  const refresh = () => void qc.invalidateQueries({ queryKey: ["cas", "reports"] });
  const approve = useMutation({ mutationFn: () => approveReport(r.id, c, comment), onSuccess: refresh });
  const send = useMutation({ mutationFn: () => markReportSent(r.id, channel), onSuccess: refresh });
  const ai = useQuery({ queryKey: ["ai", "access"], queryFn: fetchAiAccess, retry: false, enabled: manage && r.status === "draft" });
  const sugg = useQuery({ queryKey: ["cas", "report-comment", r.id], queryFn: () => listSuggestions("report_comment", [r.id]), retry: false, enabled: !!ai.data?.use && r.status === "draft" });
  const ask = useMutation({ mutationFn: () => requestReportComment(r.id) });

  return (
    <Card className="print:break-inside-avoid">
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {r.title} <Badge variant={r.status === "sent" ? "default" : "secondary"}>{label(r.status)}</Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">{r.studentName ?? ""} · {fmtDay(r.period_start)} – {fmtDay(r.period_end)}{r.sent_at && ` · sent ${fmtDay(r.sent_at)} by ${r.sent_via}`}</p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <p className="font-medium">Assessments {c.average_percentage !== null && <span className="text-muted-foreground">· average {c.average_percentage}%</span>}</p>
            {c.assessments.length === 0 ? <p className="text-muted-foreground">No released results in this period.</p> : (
              <ul>{c.assessments.map((a, i) => <li key={i}>{a.exam}: {a.percentage}%{a.grade && ` (${a.grade})`}</li>)}</ul>
            )}
          </div>
          <div><p className="font-medium">Strengths</p>{c.strengths.length ? <ul>{c.strengths.map((s) => <li key={s.topic}>{s.topic} · {pct(s.mastery)}</li>)}</ul> : <p className="text-muted-foreground">—</p>}</div>
          <div><p className="font-medium">Focus areas</p>{c.focus_areas.length ? <ul>{c.focus_areas.map((s) => <li key={s.topic}>{s.topic} · {pct(s.mastery)}</li>)}</ul> : <p className="text-muted-foreground">—</p>}</div>
        </div>
        {c.support_tasks.length > 0 && <p><span className="font-medium">Support tasks:</span> {c.support_tasks.map((t) => `${t.title} (${label(t.status)})`).join("; ")}</p>}

        {r.status === "draft" && manage ? (
          <div className="space-y-2">
            <Label htmlFor={`c-${r.id}`}>Teacher's comment</Label>
            <Textarea id={`c-${r.id}`} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
            {sugg.data?.[0] && (
              <div className="rounded-md bg-muted p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">AI suggestion — edit before using</p>
                <p className="my-2">{sugg.data[0].text}</p>
                <Button size="sm" variant="outline" onClick={() => setComment(sugg.data![0]!.text)}>Use as starting point</Button>
              </div>
            )}
            {ask.error && <Alert variant="destructive"><AlertTitle>AI request not accepted</AlertTitle><AlertDescription>{describeAiError(ask.error)}</AlertDescription></Alert>}
            {ask.isSuccess && !sugg.data?.length && <p className="text-xs text-muted-foreground">AI comment requested. It will appear here once generated.</p>}
            {approve.error && <CasError error={approve.error} />}
            <div className="flex flex-wrap gap-2">
              <Button disabled={approve.isPending} onClick={() => approve.mutate()}>{approve.isPending ? "Approving…" : "Approve report"}</Button>
              {ai.data?.use && !sugg.data?.length && <Button variant="ghost" disabled={ask.isPending} onClick={() => ask.mutate()}>Suggest a comment with AI</Button>}
            </div>
          </div>
        ) : (
          c.teacher_comment && <p><span className="font-medium">Teacher's comment:</span> {c.teacher_comment}</p>
        )}

        {r.status === "approved" && manage && (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={channel} onValueChange={(v) => setChannel(v as ReportChannel)}>
              <SelectTrigger aria-label="Sent via" className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{REPORT_CHANNELS.map((ch) => <SelectItem key={ch} value={ch}>{label(ch)}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" onClick={() => window.print()}>Print</Button>
            <Button disabled={send.isPending} onClick={() => send.mutate()}>Mark as sent</Button>
            {send.error && <CasError error={send.error} />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
