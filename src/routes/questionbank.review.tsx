import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QError, QSourceBadge, QStatusBadge, QuestionBankShell, useQuestionAccess } from "@/components/questionbank/shared";
import { listQuestionVersionsByStatus } from "@/lib/questionbank/api";
import { QUESTION_TYPE_LABEL, questionCapabilities } from "@/lib/questionbank/permissions";

export const Route = createFileRoute("/questionbank/review")({
  head: () => ({
    meta: [
      { title: "Question Review Queue — Aibinu Flexiprep" },
      { name: "description", content: "Review submitted questions, approve them and publish approved versions." },
      { property: "og:title", content: "Question Review Queue — Aibinu Flexiprep" },
      { property: "og:description", content: "Review submitted questions, approve them and publish approved versions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReviewQueue,
});

function Queue({ status, title, enabled }: { status: "in_review" | "approved"; title: string; enabled: boolean }) {
  const q = useQuery({ queryKey: ["questionbank", "queue", status], queryFn: () => listQuestionVersionsByStatus(status), retry: false, enabled });
  if (!enabled) return null;
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        {q.error ? <QError error={q.error} /> : q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (q.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing waiting.</p>
        ) : (
          <ul className="divide-y divide-border">
            {q.data!.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0 flex-1">
                  <Link to="/questionbank/$questionId" params={{ questionId: v.question_id }} className="line-clamp-2 font-medium text-primary hover:underline">{v.stem}</Link>
                  <p className="text-xs text-muted-foreground">{v.questions ? QUESTION_TYPE_LABEL[v.questions.type] : ""} · v{v.version_no ?? "?"}</p>
                </div>
                <div className="flex gap-2">{v.questions && <QSourceBadge source={v.questions.source} />}<QStatusBadge status={v.status} /></div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewQueue() {
  const { perms, loading, error } = useQuestionAccess();
  const cap = questionCapabilities(perms);
  return (
    <QuestionBankShell title="Review queue" subtitle="You cannot review questions you wrote. The database enforces this as well.">
      {loading && <p className="text-sm text-muted-foreground">Checking your permissions…</p>}
      {error && <QError error={error} />}
      {!loading && !error && !cap.canReview && !cap.canPublish && (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">Your account does not have review or publish permission.</CardContent></Card>
      )}
      <Queue status="in_review" title="Waiting for review" enabled={cap.canReview} />
      <Queue status="approved" title="Approved — ready to publish" enabled={cap.canPublish} />
    </QuestionBankShell>
  );
}
