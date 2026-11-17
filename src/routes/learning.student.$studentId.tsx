import { createFileRoute, Link } from "@tanstack/react-router";
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
import { CasError, LearningShell, MasteryBar, fmtDay, label, useCasAccess } from "@/components/cas/shared";
import {
  INTERVENTION_TYPES,
  addIntervention,
  dismissDiagnosis,
  getLearningDashboard,
  levelTone,
  markTaskDone,
  validateIntervention,
  type InterventionType,
} from "@/lib/cas/api";
import {
  describeAiError,
  fetchAiAccess,
  listStudentReviews,
  listSuggestions,
  requestDiagnosisExplanation,
  requestStudentReview,
  reviewDiagnosisNarrative,
  reviewStudentReview,
} from "@/lib/ai/api";

export const Route = createFileRoute("/learning/student/$studentId")({
  head: () => ({
    meta: [
      { title: "Learner Progress — Aibinu Flexiprep" },
      { name: "description", content: "Topic mastery, recent results and support tasks for one learner." },
      { property: "og:title", content: "Learner Progress — Aibinu Flexiprep" },
      { property: "og:description", content: "Topic mastery, recent results and support tasks for one learner." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LearnerPage,
});

function LearnerPage() {
  const { studentId } = Route.useParams();
  const qc = useQueryClient();
  const access = useCasAccess();
  const dash = useQuery({ queryKey: ["cas", "dashboard", studentId], queryFn: () => getLearningDashboard(studentId), retry: false });
  const staffView = dash.data?.view === "staff";
  const refresh = () => void qc.invalidateQueries({ queryKey: ["cas"] });
  const done = useMutation({ mutationFn: markTaskDone, onSuccess: refresh });

  if (dash.isLoading) return <LearningShell title="Learner progress" subtitle="Loading…"><span /></LearningShell>;
  if (dash.error || !dash.data) return <LearningShell title="Learner progress" subtitle=""><CasError error={dash.error} title="Progress not available" /></LearningShell>;
  const d = dash.data;

  return (
    <LearningShell
      title={d.student.name}
      subtitle={`${d.student.admission_no ? `${d.student.admission_no} · ` : ""}${staffView ? "Staff view — includes results not yet released" : "Released results only"} · updated ${fmtDay(d.generated_at)}`}
    >
      <Button variant="outline" size="sm" asChild><Link to="/learning">← Back</Link></Button>
      {done.error && <CasError error={done.error} />}

      {!!d.subjects.length && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {d.subjects.map((s) => (
            <Card key={s.subject}>
              <CardContent className="space-y-2 pt-6 text-sm">
                <p className="font-semibold">{s.subject}</p>
                <MasteryBar value={s.average_mastery} />
                <p className="text-muted-foreground">{s.topics} topic(s){s.weak_topics > 0 && <> · <span className="text-destructive">{s.weak_topics} weak</span></>}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {staffView && <Diagnoses studentId={studentId} items={d.open_diagnoses} manage={access.manage} onChange={refresh} />}

      <Card>
        <CardHeader><CardTitle>Topics (weakest first)</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto text-sm">
          {d.topics.length === 0 && <p className="text-muted-foreground">No topic evidence yet.</p>}
          {!!d.topics.length && (
            <table className="w-full">
              <thead><tr className="border-b border-border text-left text-muted-foreground"><th className="py-2 pr-3">Topic</th><th className="pr-3">Subject</th><th className="pr-3">Mastery</th><th className="pr-3">Level</th><th className="pr-3">Change</th><th>Last assessed</th></tr></thead>
              <tbody>
                {d.topics.map((t) => (
                  <tr key={t.topic_key} className="border-b border-border">
                    <td className="py-2 pr-3">{t.topic ?? "Topic"}</td>
                    <td className="pr-3">{t.subject ?? "—"}</td>
                    <td className="pr-3"><MasteryBar value={t.mastery} /></td>
                    <td className="pr-3"><Badge variant={levelTone(t.level)}>{label(t.level)}</Badge></td>
                    <td className="pr-3">{t.change === null ? "—" : `${t.change > 0 ? "▲" : t.change < 0 ? "▼" : "•"} ${Math.round(Math.abs(t.change) * 100)}%`}</td>
                    <td>{fmtDay(t.last_assessed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Recent assessments</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {d.recent_assessments.length === 0 && <p className="text-muted-foreground">None yet.</p>}
            <ul className="divide-y divide-border">
              {d.recent_assessments.map((a, i) => (
                <li key={i} className="flex justify-between py-2">
                  <span>{a.exam} <span className="text-muted-foreground">· {label(a.kind)} · {fmtDay(a.date)}</span></span>
                  <span className="tabular-nums">{Number(a.percentage)}%{a.grade && ` · ${a.grade}`}{!a.marking_complete && " · marking"}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Support tasks</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {d.tasks.length === 0 && <p className="text-muted-foreground">No tasks.</p>}
            <ul className="divide-y divide-border">
              {d.tasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                  <span>{t.title} <span className="text-muted-foreground">· {label(t.type)} · {label(t.status)}{t.due_on && ` · due ${fmtDay(t.due_on)}`}</span></span>
                  <span className="flex gap-2">
                    {t.note_id && <Link to="/notebank/$noteId" params={{ noteId: t.note_id }} className="text-primary underline underline-offset-4">Read</Link>}
                    {!staffView && (t.type === "note" || t.type === "practice") && (t.status === "assigned" || t.status === "in_progress") && (
                      <Button size="sm" disabled={done.isPending} onClick={() => done.mutate(t.id)}>Mark done</Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {staffView && access.manage && <AddTask studentId={studentId} topics={d.topics.map((t) => ({ key: t.topic_key, name: t.topic ?? "Topic" }))} onDone={refresh} />}
          </CardContent>
        </Card>
      </div>

      {staffView && <AiReviews studentId={studentId} />}
    </LearningShell>
  );
}

function Diagnoses({ studentId, items, manage, onChange }: { studentId: string; items: { id: string; kind: string; severity: string; finding: string; raised_at: string }[]; manage: boolean; onChange: () => void }) {
  const qc = useQueryClient();
  const ai = useQuery({ queryKey: ["ai", "access"], queryFn: fetchAiAccess, retry: false });
  const sugg = useQuery({ queryKey: ["cas", "narratives", studentId, items.map((i) => i.id).join()], queryFn: () => listSuggestions("diagnosis_narrative", items.map((i) => i.id)), retry: false, enabled: !!ai.data?.use && items.length > 0 });
  const [reason, setReason] = useState<Record<string, string>>({});
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [queued, setQueued] = useState<string | null>(null);
  const dismiss = useMutation({ mutationFn: (id: string) => dismissDiagnosis(id, reason[id] ?? ""), onSuccess: onChange });
  const explain = useMutation({ mutationFn: requestDiagnosisExplanation, onSuccess: () => setQueued("AI explanation requested. It will appear here for you to check once it has been generated.") });
  const review = useMutation({
    mutationFn: (p: { id: string; accept: boolean }) => reviewDiagnosisNarrative(p.id, p.accept, edit[p.id]),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["cas"] }),
  });
  if (!items.length) return null;
  return (
    <Card>
      <CardHeader><CardTitle>Open concerns</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {dismiss.error && <CasError error={dismiss.error} />}
        {explain.error && <Alert variant="destructive"><AlertTitle>AI request not accepted</AlertTitle><AlertDescription>{describeAiError(explain.error)}</AlertDescription></Alert>}
        {review.error && <Alert variant="destructive"><AlertTitle>Not saved</AlertTitle><AlertDescription>{describeAiError(review.error)}</AlertDescription></Alert>}
        {queued && <Alert><AlertTitle>Requested</AlertTitle><AlertDescription>{queued}</AlertDescription></Alert>}
        {items.map((g) => {
          const s = sugg.data?.find((x) => x.target_id === g.id);
          return (
            <div key={g.id} className="space-y-2 rounded-md border border-border p-3">
              <p><Badge variant={g.severity === "high" ? "destructive" : "secondary"}>{g.severity}</Badge> <span className="font-medium">{label(g.kind)}</span> · raised {fmtDay(g.raised_at)}</p>
              <p>{g.finding}</p>
              {s && (
                <div className="space-y-2 rounded-md bg-muted p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">AI suggestion — check before accepting</p>
                  <Textarea rows={3} value={edit[s.id] ?? s.text} onChange={(e) => setEdit({ ...edit, [s.id]: e.target.value })} />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={review.isPending} onClick={() => review.mutate({ id: s.id, accept: true })}>Accept</Button>
                    <Button size="sm" variant="outline" disabled={review.isPending} onClick={() => review.mutate({ id: s.id, accept: false })}>Discard</Button>
                  </div>
                </div>
              )}
              {manage && (
                <div className="flex flex-wrap items-center gap-2">
                  <Input className="max-w-xs" placeholder="Reason to dismiss" value={reason[g.id] ?? ""} onChange={(e) => setReason({ ...reason, [g.id]: e.target.value })} />
                  <Button size="sm" variant="outline" disabled={!reason[g.id]?.trim() || dismiss.isPending} onClick={() => dismiss.mutate(g.id)}>Dismiss</Button>
                  {ai.data?.use && !s && <Button size="sm" variant="ghost" disabled={explain.isPending} onClick={() => explain.mutate(g.id)}>Explain with AI</Button>}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function AddTask({ studentId, topics, onDone }: { studentId: string; topics: { key: string; name: string }[]; onDone: () => void }) {
  const [topicKey, setTopicKey] = useState("");
  const [type, setType] = useState<InterventionType>("practice");
  const [title, setTitle] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const add = useMutation({ mutationFn: () => addIntervention({ studentId, topicKey, type, title, dueOn }), onSuccess: () => { setTitle(""); onDone(); } });
  if (!topics.length) return null;
  return (
    <div className="mt-4 space-y-2 border-t border-border pt-4">
      <p className="font-medium">Add a support task</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Select value={topicKey} onValueChange={setTopicKey}>
          <SelectTrigger aria-label="Topic"><SelectValue placeholder="Topic" /></SelectTrigger>
          <SelectContent>{topics.map((t) => <SelectItem key={t.key} value={t.key}>{t.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={type} onValueChange={(v) => setType(v as InterventionType)}>
          <SelectTrigger aria-label="Type"><SelectValue /></SelectTrigger>
          <SelectContent>{INTERVENTION_TYPES.map((t) => <SelectItem key={t} value={t}>{label(t)}</SelectItem>)}</SelectContent>
        </Select>
        <div className="space-y-1"><Label htmlFor="task-title">Task</Label><Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Practise 10 projectile questions" /></div>
        <div className="space-y-1"><Label htmlFor="task-due">Due</Label><Input id="task-due" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} /></div>
      </div>
      {errors.length > 0 && <ul className="list-disc pl-5 text-destructive">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      {add.error && <CasError error={add.error} />}
      <Button size="sm" disabled={add.isPending} onClick={() => { const e = validateIntervention({ studentId, topicKey, type, title }); setErrors(e); if (!e.length) add.mutate(); }}>Add task</Button>
    </div>
  );
}

function AiReviews({ studentId }: { studentId: string }) {
  const qc = useQueryClient();
  const ai = useQuery({ queryKey: ["ai", "access"], queryFn: fetchAiAccess, retry: false });
  const can = !!ai.data?.use && !!ai.data?.cas;
  const reviews = useQuery({ queryKey: ["cas", "ai-reviews", studentId], queryFn: () => listStudentReviews(studentId), retry: false, enabled: can });
  const req = useMutation({ mutationFn: () => requestStudentReview(studentId) });
  const decide = useMutation({ mutationFn: (p: { id: string; accept: boolean }) => reviewStudentReview(p.id, p.accept), onSuccess: () => void qc.invalidateQueries({ queryKey: ["cas", "ai-reviews", studentId] }) });
  if (!can) return null;
  return (
    <Card>
      <CardHeader><CardTitle>AI learner review (for teachers only)</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">An AI summary of strengths and concerns from this learner's data. It is never shown to the family.</p>
        {req.error && <Alert variant="destructive"><AlertTitle>AI request not accepted</AlertTitle><AlertDescription>{describeAiError(req.error)}</AlertDescription></Alert>}
        {req.isSuccess && <Alert><AlertTitle>Requested</AlertTitle><AlertDescription>Track it on the <Link to="/ai" className="underline">AI drafting</Link> page.</AlertDescription></Alert>}
        <Button size="sm" variant="outline" disabled={req.isPending} onClick={() => req.mutate()}>Request AI review</Button>
        {decide.error && <Alert variant="destructive"><AlertTitle>Not saved</AlertTitle><AlertDescription>{describeAiError(decide.error)}</AlertDescription></Alert>}
        {reviews.data?.map((r) => (
          <div key={r.id} className="space-y-2 rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">{fmtDay(r.created_at)} · {label(r.review_state)}</p>
            <p>{r.summary}</p>
            {r.review_state === "pending_review" && (
              <div className="flex gap-2">
                <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, accept: true })}>Keep</Button>
                <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, accept: false })}>Discard</Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
