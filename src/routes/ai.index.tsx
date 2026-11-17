import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AiError, AiShell, JobStatusBadge, fmtWhen, label, useAiAccess } from "@/components/ai/shared";
import {
  COGNITIVE,
  DIFFICULTIES,
  NOTE_STYLES,
  OPEN_STATUSES,
  QUESTION_TYPES,
  cancelJob,
  listJobs,
  listMyDrafts,
  listTopics,
  newIdempotencyKey,
  requestAiNote,
  requestAiQuestions,
  validateInstructions,
  validateQuestionRequest,
  type NoteStyle,
  type QuestionRequest,
} from "@/lib/ai/api";

export const Route = createFileRoute("/ai/")({
  head: () => ({
    meta: [
      { title: "AI Drafting — Aibinu Flexiprep" },
      { name: "description", content: "Request AI-drafted notes and questions for teacher review." },
      { property: "og:title", content: "AI Drafting — Aibinu Flexiprep" },
      { property: "og:description", content: "Request AI-drafted notes and questions for teacher review." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AiHome,
});

function AiHome() {
  const access = useAiAccess();
  if (access.loading) return <AiShell title="AI drafting" subtitle="Checking access…"><span /></AiShell>;
  if (!access.use) {
    return <AiShell title="AI drafting" subtitle=""><div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">AI drafting is for staff with AI access (ai.use) in this organisation.</div></AiShell>;
  }
  return (
    <AiShell title="AI drafting" subtitle="AI writes drafts only. Every note and question goes into the normal review → approve → publish workflow before any student sees it.">
      <Alert>
        <AlertTitle>How it works</AlertTitle>
        <AlertDescription>Your request is checked against the school's AI plan and limits, and may need an administrator's approval. Drafts appear in NoteBank or the Question Bank once the AI service has processed the job.</AlertDescription>
      </Alert>
      <div className="grid gap-4 lg:grid-cols-2">
        {access.notesWrite && <NoteForm />}
        {access.questionsWrite && <QuestionForm />}
      </div>
      <Jobs />
      <Drafts />
    </AiShell>
  );
}

function TopicSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const topics = useQuery({ queryKey: ["ai", "topics"], queryFn: listTopics, retry: false });
  const [filter, setFilter] = useState("");
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (topics.data ?? []).filter((t) => !f || t.title.toLowerCase().includes(f) || t.code.toLowerCase().includes(f)).slice(0, 200);
  }, [topics.data, filter]);
  return (
    <div className="space-y-1">
      <Label>Curriculum topic</Label>
      <Input aria-label="Filter topics" placeholder="Filter by title or code" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label="Topic"><SelectValue placeholder={topics.isLoading ? "Loading topics…" : "Choose a topic"} /></SelectTrigger>
        <SelectContent>{shown.map((t) => <SelectItem key={t.id} value={t.id}>{t.code} · {t.title}{t.class_level ? ` (${t.class_level})` : ""}</SelectItem>)}</SelectContent>
      </Select>
      {topics.data?.length === 0 && <p className="text-xs text-muted-foreground">No curriculum topics yet. Add them in the Curriculum Bank first.</p>}
    </div>
  );
}

function NoteForm() {
  const qc = useQueryClient();
  const [topicId, setTopicId] = useState("");
  const [style, setStyle] = useState<NoteStyle>("exam_focused");
  const [instructions, setInstructions] = useState("");
  const [key, setKey] = useState(newIdempotencyKey);
  const req = useMutation({
    mutationFn: () => requestAiNote({ topicId, style, instructions }, key),
    onSuccess: () => { setKey(newIdempotencyKey()); setInstructions(""); void qc.invalidateQueries({ queryKey: ["ai", "jobs"] }); },
  });
  const errs = validateInstructions(instructions);
  return (
    <Card>
      <CardHeader><CardTitle>Draft a lesson note</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <TopicSelect value={topicId} onChange={setTopicId} />
        <div className="space-y-1">
          <Label>Style</Label>
          <Select value={style} onValueChange={(v) => setStyle(v as NoteStyle)}>
            <SelectTrigger aria-label="Note style"><SelectValue /></SelectTrigger>
            <SelectContent>{NOTE_STYLES.map((s) => <SelectItem key={s} value={s}>{label(s)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><Label htmlFor="n-ins">Extra instructions (optional)</Label><Textarea id="n-ins" rows={3} maxLength={1000} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. Use Nigerian examples; WAEC style." /></div>
        {errs.map((e) => <p key={e} className="text-destructive">{e}</p>)}
        {req.error && <AiError error={req.error} />}
        {req.isSuccess && <p className="text-muted-foreground">Requested. Track it below.</p>}
        <Button disabled={!topicId || errs.length > 0 || req.isPending} onClick={() => req.mutate()}>{req.isPending ? "Requesting…" : "Request note draft"}</Button>
      </CardContent>
    </Card>
  );
}

function QuestionForm() {
  const qc = useQueryClient();
  const [r, setR] = useState<QuestionRequest>({ topicId: "", count: 5, type: "mcq", difficulty: "medium", cognitive: "apply", instructions: "" });
  const [key, setKey] = useState(newIdempotencyKey);
  const [errors, setErrors] = useState<string[]>([]);
  const req = useMutation({
    mutationFn: () => requestAiQuestions(r, key),
    onSuccess: () => { setKey(newIdempotencyKey()); void qc.invalidateQueries({ queryKey: ["ai", "jobs"] }); },
  });
  const pick = <K extends keyof QuestionRequest>(k: K, opts: readonly string[], aria: string) => (
    <Select value={String(r[k])} onValueChange={(v) => setR({ ...r, [k]: v })}>
      <SelectTrigger aria-label={aria}><SelectValue /></SelectTrigger>
      <SelectContent>{opts.map((o) => <SelectItem key={o} value={o}>{label(o)}</SelectItem>)}</SelectContent>
    </Select>
  );
  return (
    <Card>
      <CardHeader><CardTitle>Draft exam questions</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <TopicSelect value={r.topicId} onChange={(v) => setR({ ...r, topicId: v })} />
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label htmlFor="q-n">How many</Label><Input id="q-n" type="number" min={1} max={20} value={r.count} onChange={(e) => setR({ ...r, count: Number(e.target.value) })} /></div>
          <div className="space-y-1"><Label>Type</Label>{pick("type", QUESTION_TYPES, "Question type")}</div>
          <div className="space-y-1"><Label>Difficulty</Label>{pick("difficulty", DIFFICULTIES, "Difficulty")}</div>
          <div className="space-y-1"><Label>Thinking level</Label>{pick("cognitive", COGNITIVE, "Cognitive level")}</div>
        </div>
        <div className="space-y-1"><Label htmlFor="q-ins">Extra instructions (optional)</Label><Textarea id="q-ins" rows={2} maxLength={1000} value={r.instructions} onChange={(e) => setR({ ...r, instructions: e.target.value })} /></div>
        {errors.map((e) => <p key={e} className="text-destructive">{e}</p>)}
        {req.error && <AiError error={req.error} />}
        {req.isSuccess && <p className="text-muted-foreground">Requested. Track it below.</p>}
        <Button disabled={req.isPending} onClick={() => { const e = validateQuestionRequest(r); setErrors(e); if (!e.length) req.mutate(); }}>{req.isPending ? "Requesting…" : "Request question drafts"}</Button>
      </CardContent>
    </Card>
  );
}

function Jobs() {
  const qc = useQueryClient();
  const jobs = useQuery({
    queryKey: ["ai", "jobs"], queryFn: () => listJobs(), retry: false,
    refetchInterval: (q) => ((q.state.data ?? []).some((j) => OPEN_STATUSES.includes(j.status)) ? 15000 : false),
  });
  const cancel = useMutation({ mutationFn: (id: string) => cancelJob(id), onSuccess: () => void qc.invalidateQueries({ queryKey: ["ai", "jobs"] }) });
  return (
    <Card>
      <CardHeader><CardTitle>Requests</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto text-sm">
        {jobs.error && <AiError error={jobs.error} title="Could not load requests" />}
        {cancel.error && <AiError error={cancel.error} title="Not cancelled" />}
        {jobs.data?.length === 0 && <p className="text-muted-foreground">No requests yet.</p>}
        {!!jobs.data?.length && (
          <table className="w-full">
            <thead><tr className="border-b border-border text-left text-muted-foreground"><th className="py-2 pr-3">Requested</th><th className="pr-3">Type</th><th className="pr-3">Status</th><th className="pr-3">Credits</th><th className="pr-3">Result</th><th /></tr></thead>
            <tbody>
              {jobs.data.map((j) => (
                <tr key={j.id} className="border-b border-border">
                  <td className="py-2 pr-3">{fmtWhen(j.created_at)}</td>
                  <td className="pr-3">{label(j.type)}</td>
                  <td className="pr-3"><JobStatusBadge status={j.status} />{j.status === "awaiting_approval" && <span className="ml-1 text-xs text-muted-foreground">needs admin approval</span>}</td>
                  <td className="pr-3">{j.consumed_credits ?? j.estimated_credits ?? "—"}</td>
                  <td className="pr-3">{j.error ?? j.cancel_reason ?? (j.result_summary ? Object.entries(j.result_summary).map(([k, v]) => `${v} ${k}`).join(", ") : "—")}</td>
                  <td>{(j.status === "queued" || j.status === "awaiting_approval") && <Button size="sm" variant="ghost" disabled={cancel.isPending} onClick={() => cancel.mutate(j.id)}>Cancel</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function Drafts() {
  const drafts = useQuery({ queryKey: ["ai", "drafts"], queryFn: listMyDrafts, retry: false });
  if (!drafts.data?.length && !drafts.error) return null;
  return (
    <Card>
      <CardHeader><CardTitle>Your AI drafts waiting for review</CardTitle></CardHeader>
      <CardContent className="text-sm">
        {drafts.error && <AiError error={drafts.error} title="Could not load drafts" />}
        <ul className="divide-y divide-border">
          {drafts.data?.map((d) => (
            <li key={d.aiContentId} className="flex justify-between py-2">
              <span>{label(d.kind)} · {fmtWhen(d.createdAt)}</span>
              {d.noteId ? <Link to="/notebank/$noteId" params={{ noteId: d.noteId }} className="text-primary underline underline-offset-4">Open in NoteBank</Link>
                : d.questionId ? <Link to="/questionbank/$questionId" params={{ questionId: d.questionId }} className="text-primary underline underline-offset-4">Open in Question Bank</Link>
                : <span className="text-muted-foreground">—</span>}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
