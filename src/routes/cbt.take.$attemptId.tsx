import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { StudentError, StudentShell, useStudentAccess } from "@/components/cbt/student";
import {
  fmtCountdown, getPaper, readPending, remainingMs, retryDelay, saveAnswer, submitAttempt, toAnswer, writePending,
  type Answer, type PaperQuestion,
} from "@/lib/cbt/student";

export const Route = createFileRoute("/cbt/take/$attemptId")({
  head: () => ({
    meta: [
      { title: "Exam in progress — Aibinu Flexiprep" },
      { name: "description", content: "Answer your computer-based exam. Answers are saved automatically." },
      { property: "og:title", content: "Exam in progress — Aibinu Flexiprep" },
      { property: "og:description", content: "Answer your computer-based exam. Answers are saved automatically." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TakeExam,
});

type SaveState = "saved" | "saving" | "retrying";
type Done = { status: string; result: { score: number; total_marks: number; percentage: number } | null };

function TakeExam() {
  const { attemptId } = Route.useParams();
  const access = useStudentAccess();
  const qc = useQueryClient();
  const paper = useQuery({
    queryKey: ["cbt", "student", "paper", attemptId],
    queryFn: async () => ({ paper: await getPaper(attemptId), fetchedAt: Date.now() }),
    retry: 1, enabled: access.canTake, refetchOnWindowFocus: false, staleTime: Infinity,
  });
  const p = paper.data?.paper;

  const [answers, setAnswers] = useState<Record<string, Answer | null>>({});
  const [current, setCurrent] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [now, setNow] = useState(() => Date.now());
  const pending = useRef<Record<string, Answer | null>>({});
  const flushing = useRef(false);
  const retries = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submitted = useRef(false);

  // Load server answers, overlay any unsent local answers (resume after refresh / lost connection).
  useEffect(() => {
    if (p?.status !== "in_progress") return;
    pending.current = readPending(attemptId);
    setAnswers({ ...p.answers, ...pending.current });
    if (Object.keys(pending.current).length) schedule(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, attemptId]);

  const finish = useCallback(async () => {
    if (submitted.current) return;
    submitted.current = true;
    try {
      await flush();
      const r = await submitAttempt(attemptId);
      writePending(attemptId, {});
      setDone(r);
      void qc.invalidateQueries({ queryKey: ["cbt", "student"] });
    } catch (e) {
      submitted.current = false;
      setSubmitError(e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, qc]);

  async function flush(): Promise<void> {
    if (flushing.current) return;
    flushing.current = true;
    try {
      for (const [eqId, ans] of Object.entries(pending.current)) {
        setSaveState("saving");
        const out = await saveAnswer(attemptId, eqId, ans);
        if (out === "expired") { pending.current = {}; writePending(attemptId, {}); await paper.refetch(); return; }
        if (pending.current[eqId] === ans) delete pending.current[eqId];
        writePending(attemptId, pending.current);
      }
      retries.current = 0;
      setSaveState("saved");
    } catch {
      setSaveState("retrying");
      schedule(retryDelay(retries.current++));
    } finally {
      flushing.current = false;
      if (Object.keys(pending.current).length && retries.current === 0) schedule(300);
    }
  }
  function schedule(ms: number) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), ms);
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const setAnswer = (q: PaperQuestion, value: string[] | string) => {
    const a = toAnswer(q.type, value);
    setAnswers((s) => ({ ...s, [q.exam_question_id]: a }));
    pending.current[q.exam_question_id] = a;
    writePending(attemptId, pending.current);
    setSaveState("saving");
    schedule(600);
  };

  // Display countdown only. The DB enforces the deadline on every save/submit.
  const remaining = p?.status === "in_progress" && paper.data ? remainingMs(p.deadline_at, p.server_now, paper.data.fetchedAt, now) : null;
  useEffect(() => {
    if (p?.status !== "in_progress") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [p?.status]);
  useEffect(() => { if (remaining === 0 && !done) void finish(); }, [remaining, done, finish]);

  if (access.loading || paper.isLoading) return <StudentShell title="Exam"><p className="text-sm text-muted-foreground">Loading your paper…</p></StudentShell>;
  if (!access.canTake) return <StudentShell title="Exam"><Card><CardContent className="pt-6 text-sm text-muted-foreground">Only students can take exams.</CardContent></Card></StudentShell>;
  if (paper.error) return <StudentShell title="Exam"><StudentError error={paper.error} /><Button variant="outline" asChild><Link to="/cbt/my">Back to my exams</Link></Button></StudentShell>;

  if (done || (p && p.status !== "in_progress")) {
    const status = done?.status ?? p?.status;
    return (
      <StudentShell title="Exam finished">
        <Card><CardContent className="space-y-3 pt-6 text-sm">
          <p>{status === "auto_submitted" ? "Time ran out, so your answers were submitted automatically." : "Your answers have been submitted."}</p>
          {done?.result ? <p className="font-medium">Score: {Number(done.result.score)} / {Number(done.result.total_marks)} ({Number(done.result.percentage)}%)</p> : <p className="text-muted-foreground">Your result will appear under My results once your teacher releases it.</p>}
          <Button asChild><Link to="/cbt/my">Back to my exams</Link></Button>
        </CardContent></Card>
      </StudentShell>
    );
  }
  if (!p || p.status !== "in_progress") return null;

  const q = p.questions[current];
  const answered = (id: string) => !!answers[id];
  const sel = (id: string) => { const a = answers[id]; return a && "selected" in a ? a.selected : []; };
  const txt = (id: string) => { const a = answers[id]; return a && "text" in a ? a.text : ""; };
  const low = remaining !== null && remaining < 60_000;

  return (
    <StudentShell
      title={p.exam.title}
      subtitle={`${p.questions.length} questions · ${Number(p.exam.total_marks)} marks`}
      aside={
        <div className="text-right">
          <p className={`font-mono text-2xl font-bold ${low ? "text-destructive" : "text-foreground"}`} role="timer" aria-live="polite">{remaining !== null ? fmtCountdown(remaining) : "--:--"}</p>
          <p className="text-xs text-muted-foreground" aria-live="polite">{saveState === "saved" ? "All answers saved" : saveState === "saving" ? "Saving…" : "Connection problem — retrying"}</p>
        </div>
      }
    >
      {p.exam.instructions && <Card><CardContent className="pt-6 text-sm text-muted-foreground">{p.exam.instructions}</CardContent></Card>}
      <nav aria-label="Questions" className="flex flex-wrap gap-2">
        {p.questions.map((x, i) => (
          <Button key={x.exam_question_id} size="sm" variant={i === current ? "default" : answered(x.exam_question_id) ? "secondary" : "outline"} onClick={() => setCurrent(i)} aria-label={`Question ${i + 1}${answered(x.exam_question_id) ? ", answered" : ""}`}>{i + 1}</Button>
        ))}
      </nav>
      {q && (
        <Card>
          <CardHeader><CardTitle className="text-base">Question {current + 1} · {Number(q.marks)} mark(s)</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="whitespace-pre-wrap">{q.stem}</p>
            {(q.type === "mcq" || q.type === "true_false") && (
              <RadioGroup value={sel(q.exam_question_id)[0] ?? ""} onValueChange={(v) => setAnswer(q, [v])}>
                {(q.options ?? []).map((o) => (
                  <div key={o.key} className="flex items-center gap-2"><RadioGroupItem id={`${q.exam_question_id}-${o.key}`} value={o.key} /><Label htmlFor={`${q.exam_question_id}-${o.key}`}>{o.text}</Label></div>
                ))}
              </RadioGroup>
            )}
            {q.type === "multi_select" && (q.options ?? []).map((o) => {
              const s = sel(q.exam_question_id);
              return (
                <label key={o.key} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={s.includes(o.key)} onCheckedChange={(c) => setAnswer(q, c === true ? [...s, o.key] : s.filter((k) => k !== o.key))} />{o.text}
                </label>
              );
            })}
            {!["mcq", "true_false", "multi_select"].includes(q.type) && (
              <Textarea aria-label="Your answer" rows={q.type === "theory" ? 8 : 2} value={txt(q.exam_question_id)} onChange={(e) => setAnswer(q, e.target.value)} />
            )}
            <div className="flex justify-between">
              <Button variant="outline" disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}>Previous</Button>
              <Button variant="outline" disabled={current >= p.questions.length - 1} onClick={() => setCurrent((c) => c + 1)}>Next</Button>
            </div>
          </CardContent>
        </Card>
      )}
      {submitError ? <StudentError error={submitError} /> : null}
      <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6 text-sm">
        <span>{p.questions.filter((x) => answered(x.exam_question_id)).length} of {p.questions.length} answered</span>
        {confirming ? (
          <div className="flex gap-2"><Button variant="outline" onClick={() => setConfirming(false)}>Keep working</Button><Button onClick={() => void finish()}>Confirm submit</Button></div>
        ) : <Button onClick={() => setConfirming(true)}>Submit exam</Button>}
      </CardContent></Card>
    </StudentShell>
  );
}
