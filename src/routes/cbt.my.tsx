import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StudentError, StudentShell, useStudentAccess } from "@/components/cbt/student";
import { listAvailableExams, listMyResults, startOrResumeAttempt } from "@/lib/cbt/student";

export const Route = createFileRoute("/cbt/my")({
  head: () => ({
    meta: [
      { title: "My Exams — Aibinu Flexiprep" },
      { name: "description", content: "See the computer-based exams open to you, start or resume an attempt, and view released results." },
      { property: "og:title", content: "My Exams — Aibinu Flexiprep" },
      { property: "og:description", content: "See the computer-based exams open to you, start or resume an attempt, and view released results." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyExams,
});

function MyExams() {
  const access = useStudentAccess();
  const navigate = useNavigate();
  const exams = useQuery({ queryKey: ["cbt", "student", "available"], queryFn: listAvailableExams, retry: false, enabled: access.canTake, refetchInterval: 60_000 });
  const results = useQuery({ queryKey: ["cbt", "student", "results", access.studentId], queryFn: () => listMyResults(access.studentId!), retry: false, enabled: access.canTake });
  const start = useMutation({
    mutationFn: startOrResumeAttempt,
    onSuccess: (attemptId) => void navigate({ to: "/cbt/take/$attemptId", params: { attemptId } }),
  });

  if (access.loading) return <StudentShell title="My exams"><p className="text-sm text-muted-foreground">Checking your access…</p></StudentShell>;
  if (!access.canTake) {
    return (
      <StudentShell title="My exams">
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">This page is for students taking exams. Your account is not set up as a student in this organisation.</CardContent></Card>
      </StudentShell>
    );
  }

  const now = Date.now();
  return (
    <StudentShell title="My exams" subtitle="Exams you are eligible to sit. Your time starts when you press Start.">
      {start.error && <StudentError error={start.error} />}
      {exams.error && <StudentError error={exams.error} />}
      {exams.isLoading && <p className="text-sm text-muted-foreground">Loading exams…</p>}
      {exams.data?.length === 0 && <Card><CardContent className="pt-6 text-sm text-muted-foreground">No exams are open to you right now.</CardContent></Card>}
      {exams.data?.map((x) => {
        const notOpen = Date.parse(x.opens_at) > now;
        const left = x.attempts_allowed - x.attempts_used;
        return (
          <Card key={x.exam_id}>
            <CardHeader><CardTitle>{x.title}</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <div className="space-y-1 text-muted-foreground">
                <p>{x.subject_name ?? "—"} · {x.duration_min} minutes · {x.kind}</p>
                <p>Open {new Date(x.opens_at).toLocaleString()} – {new Date(x.closes_at).toLocaleString()}</p>
                <p>Attempts used {x.attempts_used} of {x.attempts_allowed}</p>
              </div>
              {x.open_attempt_id ? (
                <Button onClick={() => void navigate({ to: "/cbt/take/$attemptId", params: { attemptId: x.open_attempt_id! } })}>Resume</Button>
              ) : (
                <Button disabled={notOpen || left <= 0 || start.isPending} onClick={() => start.mutate(x.exam_id)}>
                  {notOpen ? "Not open yet" : left <= 0 ? "No attempts left" : start.isPending ? "Starting…" : "Start"}
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader><CardTitle>My results</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {results.error && <StudentError error={results.error} />}
          {results.data?.length === 0 && <p className="text-muted-foreground">No results have been released yet.</p>}
          {results.data?.map((r) => (
            <div key={`${r.exam_id}-${r.attempt_no}`} className="flex flex-wrap justify-between gap-2 rounded-md border border-border p-3">
              <span className="font-medium">{r.exam_title}</span>
              <span>{Number(r.score)} / {Number(r.total_marks)} ({Number(r.percentage)}%){r.grade ? ` · Grade ${r.grade}` : ""}{r.passed === null ? "" : r.passed ? " · Passed" : " · Not passed"}</span>
              <Link to="/cbt/review/$examId" params={{ examId: r.exam_id }} className="text-primary underline underline-offset-4">Review answers</Link>
            </div>
          ))}
        </CardContent>
      </Card>
    </StudentShell>
  );
}
