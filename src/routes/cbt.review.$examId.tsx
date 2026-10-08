import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StudentShell, useStudentAccess } from "@/components/cbt/student";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { answerText, describeResultError, getMyAttemptReview, listMyAttemptsForExam, selectedKeys } from "@/lib/cbt/results";

export const Route = createFileRoute("/cbt/review/$examId")({
  head: () => ({
    meta: [
      { title: "Review My Answers — Aibinu Flexiprep" },
      { name: "description", content: "Review your answers for a released exam result." },
      { property: "og:title", content: "Review My Answers — Aibinu Flexiprep" },
      { property: "og:description", content: "Review your answers for a released exam result." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReviewPage,
});

function ReviewPage() {
  const { examId } = Route.useParams();
  const access = useStudentAccess();
  const attempts = useQuery({ queryKey: ["cbt", "student", "attempts", examId], queryFn: () => listMyAttemptsForExam(examId, access.studentId!), enabled: access.canTake, retry: false });
  const done = (attempts.data ?? []).filter((a) => a.status !== "in_progress");
  const [picked, setPicked] = useState<string | null>(null);
  const attemptId = picked ?? done.at(-1)?.id ?? null;
  const review = useQuery({ queryKey: ["cbt", "student", "review", attemptId], queryFn: () => getMyAttemptReview(attemptId!), enabled: !!attemptId, retry: false });

  const back = <Button variant="outline" size="sm" asChild><Link to="/cbt/my">← My exams</Link></Button>;
  if (access.loading) return <StudentShell title="Review answers"><p className="text-sm text-muted-foreground">Loading…</p></StudentShell>;
  if (!access.canTake) return <StudentShell title="Review answers">{back}<p className="text-sm text-muted-foreground">This page is for students.</p></StudentShell>;

  return (
    <StudentShell title="Review answers" subtitle="Available only when your school has released the result and allowed review.">
      {back}
      {done.length > 1 && (
        <div className="flex gap-2">{done.map((a) => <Button key={a.id} size="sm" variant={a.id === attemptId ? "default" : "outline"} onClick={() => setPicked(a.id)}>Attempt {a.attempt_no}</Button>)}</div>
      )}
      {attempts.data && done.length === 0 && <p className="text-sm text-muted-foreground">You have no finished attempts for this exam.</p>}
      {review.error && <Alert><AlertTitle>Review not available</AlertTitle><AlertDescription>{describeResultError(review.error)}</AlertDescription></Alert>}
      {review.data?.map((q) => {
        const mine = selectedKeys(q.your_answer);
        const text = answerText(q.your_answer);
        return (
          <Card key={q.position}>
            <CardHeader><CardTitle className="text-base">{q.position}. {q.stem}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {q.options?.map((o) => (
                <p key={o.key} className={mine.includes(o.key) ? "font-semibold text-foreground" : "text-muted-foreground"}>{o.key}. {o.text}{mine.includes(o.key) ? " — your answer" : ""}</p>
              ))}
              {text !== null && <p>Your answer: {text}</p>}
              {!q.options?.length && text === null && mine.length === 0 && <p className="text-muted-foreground">Not answered.</p>}
              <p className="font-medium">{q.is_correct === null ? "Awaiting marking" : q.is_correct ? "Correct" : "Incorrect"} · {q.marks_awarded ?? 0} / {Number(q.marks)} mark(s)</p>
              {q.explanation && <p className="rounded-md bg-muted p-2">{q.explanation}</p>}
              {q.feedback && <p className="text-muted-foreground">Teacher feedback: {q.feedback}</p>}
            </CardContent>
          </Card>
        );
      })}
    </StudentShell>
  );
}
