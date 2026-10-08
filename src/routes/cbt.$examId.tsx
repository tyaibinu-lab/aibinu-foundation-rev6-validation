import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CbtError, CbtShell, ExamStatusBadge, fmtDate, useExamAccess } from "@/components/cbt/shared";
import { ExamForm, examToInput } from "@/components/cbt/ExamForm";
import {
  addClassEligibility, addExamQuestion, closeExam, getExam, listClasses, listEligibility, listExamQuestions,
  listPublishedVersions, publishExam, removeEligibility, removeExamQuestion, updateExamDraft, type ExamDraftInput,
} from "@/lib/cbt/api";
import { listTopicOptions } from "@/lib/questionbank/api";
import { QUESTION_TYPE_LABEL, type QuestionType } from "@/lib/questionbank/permissions";

export const Route = createFileRoute("/cbt/$examId")({
  head: () => ({
    meta: [
      { title: "Exam Workspace — CBT — Aibinu Flexiprep" },
      { name: "description", content: "Assemble published questions, set eligibility and publish a computer-based exam." },
      { property: "og:title", content: "Exam Workspace — CBT — Aibinu Flexiprep" },
      { property: "og:description", content: "Assemble published questions, set eligibility and publish a computer-based exam." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExamWorkspace,
});

const ALL = "all";

function ExamWorkspace() {
  const { examId } = Route.useParams();
  const qc = useQueryClient();
  const access = useExamAccess();
  const exam = useQuery({ queryKey: ["cbt", "exam", examId], queryFn: () => getExam(examId), retry: false });
  const eqs = useQuery({ queryKey: ["cbt", "exam", examId, "questions"], queryFn: () => listExamQuestions(examId), retry: false });
  const elig = useQuery({ queryKey: ["cbt", "exam", examId, "eligibility"], queryFn: () => listEligibility(examId), retry: false });
  const editable = access.canCreate && exam.data?.status === "draft";
  const published = useQuery({ queryKey: ["cbt", "published-versions"], queryFn: listPublishedVersions, retry: false, enabled: editable });
  const topics = useQuery({ queryKey: ["questionbank", "topics"], queryFn: listTopicOptions, retry: false, enabled: editable });
  const classes = useQuery({ queryKey: ["cbt", "classes"], queryFn: listClasses, retry: false, enabled: editable });

  const [topic, setTopic] = useState(ALL);
  const [search, setSearch] = useState("");
  const [classId, setClassId] = useState("");
  const refresh = () => void qc.invalidateQueries({ queryKey: ["cbt"] });
  const onErr = { onSuccess: refresh };

  const save = useMutation({ mutationFn: (v: ExamDraftInput) => updateExamDraft(examId, v), ...onErr });
  const addQ = useMutation({ mutationFn: (vid: string) => addExamQuestion(examId, vid, (eqs.data?.length ?? 0) + 1), ...onErr });
  const rmQ = useMutation({ mutationFn: removeExamQuestion, ...onErr });
  const addE = useMutation({ mutationFn: (cid: string) => addClassEligibility(examId, cid, elig.data ?? []), ...onErr });
  const rmE = useMutation({ mutationFn: removeEligibility, ...onErr });
  const pub = useMutation({ mutationFn: () => publishExam(examId), ...onErr });
  const close = useMutation({ mutationFn: () => closeExam(examId), ...onErr });
  const firstError = [save, addQ, rmQ, addE, rmE, pub, close].find((m) => m.error)?.error;

  const inExam = useMemo(() => new Set((eqs.data ?? []).map((q) => q.questionId)), [eqs.data]);
  const topicName = (id: string) => topics.data?.find((t) => t.id === id)?.title ?? "—";
  const choices = (published.data ?? []).filter((p) => (topic === ALL || p.topicId === topic) && (!search || p.stem.toLowerCase().includes(search.toLowerCase())));
  const selectedTotal = (eqs.data ?? []).reduce((s, q) => s + q.marks, 0);

  if (exam.isLoading) return <CbtShell title="Exam" subtitle="Loading…"><p className="text-sm text-muted-foreground">Loading exam…</p></CbtShell>;
  if (exam.error) return <CbtShell title="Exam" subtitle=""><CbtError error={exam.error} /></CbtShell>;
  if (!exam.data) return <CbtShell title="Exam not found" subtitle="It does not exist or is not visible in your active organisation."><Button variant="outline" asChild><Link to="/cbt">Back to exams</Link></Button></CbtShell>;
  const x = exam.data;

  return (
    <CbtShell
      title={x.title}
      subtitle={`${fmtDate(x.opens_at)} → ${fmtDate(x.closes_at)} · ${x.duration_min} min · ${Number(x.total_marks)} marks`}
      actions={
        <div className="flex items-center gap-2">
          <ExamStatusBadge status={x.status} />
          {editable && <Button onClick={() => pub.mutate()} disabled={pub.isPending}>{pub.isPending ? "Publishing…" : "Publish exam"}</Button>}
          {access.canCreate && x.status === "published" && <Button variant="secondary" onClick={() => close.mutate()} disabled={close.isPending}>Close exam</Button>}
        </div>
      }
    >
      {firstError && <CbtError error={firstError} />}

      <Card>
        <CardHeader><CardTitle>Questions ({eqs.data?.length ?? 0}) · total {selectedTotal} marks</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(eqs.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No questions yet.</p>}
          {(eqs.data ?? []).map((q, i) => (
            <div key={q.id} className="flex items-start justify-between gap-3 rounded-md border border-border p-3 text-sm">
              <div><p className="font-medium">{i + 1}. {q.stem}</p><p className="text-xs text-muted-foreground">Version {q.questionVersionId} · {q.marks} mark(s)</p></div>
              {editable && <Button size="sm" variant="outline" onClick={() => rmQ.mutate(q.id)}>Remove</Button>}
            </div>
          ))}
        </CardContent>
      </Card>

      {editable && (
        <Card>
          <CardHeader><CardTitle>Add published questions</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Input placeholder="Search question text" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
              <Select value={topic} onValueChange={setTopic}>
                <SelectTrigger aria-label="Topic" className="w-64"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={ALL}>All topics</SelectItem>{(topics.data ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.subjectName} · {t.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {published.error && <CbtError error={published.error} />}
            {choices.length === 0 && !published.isLoading && <p className="text-sm text-muted-foreground">No published questions match.</p>}
            {choices.map((p) => (
              <div key={p.versionId} className="flex items-start justify-between gap-3 rounded-md border border-border p-3 text-sm">
                <div>
                  <p>{p.stem}</p>
                  <p className="text-xs text-muted-foreground">{QUESTION_TYPE_LABEL[p.type as QuestionType] ?? p.type} · {topicName(p.topicId)} · {p.difficulty} · {p.marks} mark(s)</p>
                </div>
                <Button size="sm" disabled={inExam.has(p.questionId) || addQ.isPending} onClick={() => addQ.mutate(p.versionId)}>{inExam.has(p.questionId) ? "Added" : "Add"}</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Who can sit this exam</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {(elig.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No eligible classes yet.</p>}
          {(elig.data ?? []).map((e) => (
            <div key={e.id} className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
              <span>{e.classId ? `Class: ${e.className ?? e.classId}` : `Student: ${e.studentId}`}{e.isBlocked ? " (blocked)" : ""}</span>
              {editable && <Button size="sm" variant="outline" onClick={() => rmE.mutate(e.id)}>Remove</Button>}
            </div>
          ))}
          {editable && (
            <div className="flex gap-2">
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger aria-label="Class" className="w-64"><SelectValue placeholder="Choose a class" /></SelectTrigger>
                <SelectContent>{(classes.data ?? []).filter((c) => !(elig.data ?? []).some((e) => e.classId === c.id)).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
              <Button disabled={!classId || addE.isPending} onClick={() => { addE.mutate(classId); setClassId(""); }}>Add class</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <ExamForm key={`${x.id}-${x.status}`} initial={examToInput(x)} submitLabel="Save draft settings" pending={save.isPending} disabled={!editable} onSubmit={(v) => save.mutate(v)} />
    </CbtShell>
  );
}
