import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { CbtShell, ExamStatusBadge, fmtDate } from "@/components/cbt/shared";
import { getExam } from "@/lib/cbt/api";
import { describeResultError, fetchResultAccess, listExamResults, releaseResults } from "@/lib/cbt/results";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { NoResultAccess } from "./cbt.results.index";

export const Route = createFileRoute("/cbt/results/$examId")({
  head: () => ({
    meta: [
      { title: "Exam Results — CBT — Aibinu Flexiprep" },
      { name: "description", content: "See each student's score for an exam and release results." },
      { property: "og:title", content: "Exam Results — CBT — Aibinu Flexiprep" },
      { property: "og:description", content: "See each student's score for an exam and release results." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExamResults,
});

function Err({ error }: { error: unknown }) {
  return <Alert variant="destructive"><AlertTitle>Action not completed</AlertTitle><AlertDescription>{describeResultError(error)}</AlertDescription></Alert>;
}

function ExamResults() {
  const { examId } = Route.useParams();
  const qc = useQueryClient();
  const access = useQuery({ queryKey: ["cbt", "results", "access"], queryFn: fetchResultAccess, retry: false });
  const canRead = !!access.data && (access.data.readAll || access.data.readClass);
  const exam = useQuery({ queryKey: ["cbt", "exam", examId], queryFn: () => getExam(examId), retry: false, enabled: canRead });
  const rows = useQuery({ queryKey: ["cbt", "results", examId], queryFn: () => listExamResults(examId), retry: false, enabled: canRead });
  const [force, setForce] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const release = useMutation({
    mutationFn: () => releaseResults(examId, force),
    onSuccess: () => { setConfirm(false); void qc.invalidateQueries({ queryKey: ["cbt"] }); },
  });

  if (access.isLoading) return <CbtShell title="Results" subtitle="Checking access…"><span /></CbtShell>;
  if (!canRead) return <CbtShell title="Results" subtitle=""><NoResultAccess /></CbtShell>;

  const list = rows.data ?? [];
  const unreleased = list.filter((r) => !r.released_at).length;
  const pending = list.filter((r) => !r.marking_complete).length;
  const x = exam.data;

  return (
    <CbtShell
      title={x?.title ?? "Exam results"}
      subtitle={x ? `${fmtDate(x.opens_at)} → ${fmtDate(x.closes_at)} · release policy ${x.release_policy} · answer review ${x.allow_review ? "allowed" : "off"}` : ""}
      actions={x && <ExamStatusBadge status={x.status} />}
    >
      <Button variant="outline" size="sm" asChild><Link to="/cbt/results">← All results</Link></Button>
      {rows.error && <Err error={rows.error} />}
      {release.error && <Err error={release.error} />}
      {release.data !== undefined && !release.error && <Alert><AlertTitle>Released</AlertTitle><AlertDescription>{release.data} result(s) are now visible to students.</AlertDescription></Alert>}

      {access.data?.release && (
        <Card>
          <CardHeader><CardTitle>Release results</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">{unreleased} unreleased · {pending} awaiting marking. Releasing makes scores visible to each student and sets class positions.</p>
            {pending > 0 && (
              <label className="flex items-center gap-2"><Checkbox checked={force} onCheckedChange={(v) => setForce(v === true)} /> Release even though some answers still need marking</label>
            )}
            {!confirm ? (
              <Button disabled={unreleased === 0} onClick={() => setConfirm(true)}>{unreleased === 0 ? "Nothing to release" : `Release ${unreleased} result(s)`}</Button>
            ) : (
              <div className="flex gap-2">
                <Button onClick={() => release.mutate()} disabled={release.isPending}>{release.isPending ? "Releasing…" : "Confirm release"}</Button>
                <Button variant="outline" onClick={() => setConfirm(false)}>Cancel</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Students ({list.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {rows.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!rows.isLoading && list.length === 0 && <p className="text-sm text-muted-foreground">No results you can see for this exam.</p>}
          {list.length > 0 && (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-3">Student</th><th className="pr-3">Attempt</th><th className="pr-3">Score</th><th className="pr-3">%</th><th className="pr-3">Grade</th><th className="pr-3">Pass</th><th className="pr-3">Position</th><th className="pr-3">Marking</th><th>Released</th>
              </tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="border-b border-border">
                    <td className="py-2 pr-3 font-medium">{r.studentName ?? r.student_id}</td>
                    <td className="pr-3">{r.attemptNo ?? "—"} · {r.attemptStatus ?? ""}</td>
                    <td className="pr-3">{Number(r.score)} / {Number(r.total_marks)}</td>
                    <td className="pr-3">{Number(r.percentage)}</td>
                    <td className="pr-3">{r.grade ?? "—"}</td>
                    <td className="pr-3">{r.passed === null ? "—" : r.passed ? "Yes" : "No"}</td>
                    <td className="pr-3">{r.position_in_class ?? "—"}</td>
                    <td className="pr-3">{r.marking_complete ? "Complete" : "Pending"}</td>
                    <td>{r.released_at ? fmtDate(r.released_at) : "Not released"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </CbtShell>
  );
}
