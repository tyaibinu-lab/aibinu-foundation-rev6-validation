import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CasError, LearningShell, MasteryBar, fmtDay, label, useCasAccess } from "@/components/cas/shared";
import {
  assignIntervention,
  getClassMastery,
  getClassRoster,
  listClasses,
  listInterventionBoard,
  listMyLearners,
  setInterventionStatus,
  type BoardRow,
} from "@/lib/cas/api";

export const Route = createFileRoute("/learning/")({
  head: () => ({
    meta: [
      { title: "Learning Progress — Aibinu Flexiprep" },
      { name: "description", content: "Topic mastery, weak areas and support tasks for each class and learner." },
      { property: "og:title", content: "Learning Progress — Aibinu Flexiprep" },
      { property: "og:description", content: "Topic mastery, weak areas and support tasks for each class and learner." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LearningHome,
});

function LearningHome() {
  const access = useCasAccess();
  if (access.loading) return <LearningShell title="Learning progress" subtitle="Checking access…"><span /></LearningShell>;
  if (access.error) return <LearningShell title="Learning progress" subtitle=""><CasError error={access.error} /></LearningShell>;
  return access.staff ? <StaffHome manage={access.manage} /> : <FamilyHome />;
}

// ---------- staff ----------

function StaffHome({ manage }: { manage: boolean }) {
  const qc = useQueryClient();
  const classes = useQuery({ queryKey: ["cas", "classes"], queryFn: listClasses, retry: false });
  const [classId, setClassId] = useState("");
  const heat = useQuery({ queryKey: ["cas", "class", classId], queryFn: () => getClassMastery(classId), retry: false, enabled: !!classId });
  const roster = useQuery({ queryKey: ["cas", "roster", classId], queryFn: () => getClassRoster(classId), retry: false, enabled: !!classId });
  const board = useQuery({ queryKey: ["cas", "board"], queryFn: listInterventionBoard, retry: false });
  const [due, setDue] = useState<Record<string, string>>({});
  const act = useMutation({
    mutationFn: (p: { row: BoardRow; to: "assign" | "in_progress" | "completed" | "cancelled" }) =>
      p.to === "assign" ? assignIntervention(p.row.intervention_id, due[p.row.intervention_id]) : setInterventionStatus(p.row.intervention_id, p.to),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["cas"] }),
  });

  return (
    <LearningShell title="Classes & support" subtitle="Mastery is calculated by the system from marked exam answers. Weak topics are listed first.">
      <Card>
        <CardHeader><CardTitle>Class topic map</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm">
          {classes.error && <CasError error={classes.error} />}
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger aria-label="Class" className="max-w-xs"><SelectValue placeholder="Choose a class" /></SelectTrigger>
            <SelectContent>{(classes.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
          {heat.error && <CasError error={heat.error} />}
          {classId && heat.data?.length === 0 && <p className="text-muted-foreground">No topic evidence yet for students you can see in this class.</p>}
          {!!heat.data?.length && (
            <table className="w-full">
              <thead><tr className="border-b border-border text-left text-muted-foreground"><th className="py-2 pr-3">Topic</th><th className="pr-3">Class average</th><th className="pr-3">Students assessed</th><th>Weak</th></tr></thead>
              <tbody>
                {heat.data.map((t) => (
                  <tr key={t.topic_key} className="border-b border-border">
                    <td className="py-2 pr-3">{t.topic_title ?? "Topic"}</td>
                    <td className="pr-3"><MasteryBar value={t.avg_mastery} /></td>
                    <td className="pr-3">{t.students_assessed}</td>
                    <td>{t.students_weak > 0 ? <Badge variant="destructive">{t.students_weak}</Badge> : "0"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!!roster.data?.length && (
            <div>
              <p className="mb-2 font-medium">Learners</p>
              <div className="flex flex-wrap gap-2">
                {roster.data.map((s) => (
                  <Link key={s.student_id} to="/learning/student/$studentId" params={{ studentId: s.student_id }} className="rounded-md border border-border px-3 py-1 hover:bg-accent">{s.full_name}</Link>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Support tasks</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto text-sm">
          {board.error && <CasError error={board.error} />}
          {act.error && <CasError error={act.error} />}
          {board.data?.length === 0 && <p className="text-muted-foreground">No open support tasks.</p>}
          {!!board.data?.length && (
            <table className="w-full">
              <thead><tr className="border-b border-border text-left text-muted-foreground"><th className="py-2 pr-3">Learner</th><th className="pr-3">Task</th><th className="pr-3">Type</th><th className="pr-3">Due</th><th className="pr-3">Status</th>{manage && <th />}</tr></thead>
              <tbody>
                {board.data.map((r) => (
                  <tr key={r.intervention_id} className="border-b border-border align-top">
                    <td className="py-2 pr-3"><Link to="/learning/student/$studentId" params={{ studentId: r.student_id }} className="text-primary underline-offset-4 hover:underline">{r.student_name}</Link></td>
                    <td className="pr-3">{r.title}{r.severity && <span className="text-muted-foreground"> · {r.severity} {r.diagnosis_kind ? label(r.diagnosis_kind) : ""}</span>}</td>
                    <td className="pr-3">{label(r.type)}</td>
                    <td className="pr-3">{fmtDay(r.due_on)}{r.is_overdue && <Badge variant="destructive" className="ml-1">Overdue</Badge>}</td>
                    <td className="pr-3">{label(r.status)}</td>
                    {manage && (
                      <td className="space-x-2 whitespace-nowrap">
                        {r.status === "suggested" && (
                          <>
                            <Input type="date" aria-label="Due date" className="inline-block h-8 w-36" value={due[r.intervention_id] ?? ""} onChange={(e) => setDue({ ...due, [r.intervention_id]: e.target.value })} />
                            <Button size="sm" disabled={act.isPending} onClick={() => act.mutate({ row: r, to: "assign" })}>Assign to me</Button>
                          </>
                        )}
                        {r.status === "assigned" && <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ row: r, to: "in_progress" })}>Start</Button>}
                        {(r.status === "assigned" || r.status === "in_progress") && <Button size="sm" disabled={act.isPending} onClick={() => act.mutate({ row: r, to: "completed" })}>Done</Button>}
                        <Button size="sm" variant="ghost" disabled={act.isPending} onClick={() => act.mutate({ row: r, to: "cancelled" })}>Cancel</Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </LearningShell>
  );
}

// ---------- students & parents ----------

function FamilyHome() {
  const learners = useQuery({ queryKey: ["cas", "my-learners"], queryFn: listMyLearners, retry: false });
  return (
    <LearningShell title="Progress" subtitle="Based on results your school has released.">
      {learners.error && <CasError error={learners.error} />}
      {learners.data?.length === 0 && <p className="text-sm text-muted-foreground">No learner is linked to your account yet. Ask the school office.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {learners.data?.map((s) => (
          <Card key={s.id}>
            <CardContent className="flex items-center justify-between pt-6 text-sm">
              <span className="font-medium">{s.full_name}{s.admission_no && <span className="text-muted-foreground"> · {s.admission_no}</span>}</span>
              <Button asChild size="sm"><Link to="/learning/student/$studentId" params={{ studentId: s.id }}>Open progress</Link></Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </LearningShell>
  );
}
