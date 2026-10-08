import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CbtError, CbtShell, NoResultAccess } from "@/components/cbt/shared";
import { fetchResultAccess, listResultSummaries } from "@/lib/cbt/results";

export const Route = createFileRoute("/cbt/results/")({
  head: () => ({
    meta: [
      { title: "Results & Release — CBT — Aibinu Flexiprep" },
      { name: "description", content: "Review computer-based exam results and release them to students." },
      { property: "og:title", content: "Results & Release — CBT — Aibinu Flexiprep" },
      { property: "og:description", content: "Review computer-based exam results and release them to students." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResultsDashboard,
});

function ResultsDashboard() {
  const access = useQuery({ queryKey: ["cbt", "results", "access"], queryFn: fetchResultAccess, retry: false });
  const canRead = !!access.data && (access.data.readAll || access.data.readClass);
  const list = useQuery({ queryKey: ["cbt", "results", "summaries"], queryFn: listResultSummaries, retry: false, enabled: canRead });

  return (
    <CbtShell title="Results & release" subtitle="Scores are calculated by the exam system. Students only see results after you release them.">
      {access.isLoading && <p className="text-sm text-muted-foreground">Checking access…</p>}
      {access.error && <CbtError error={access.error} />}
      {access.data && !canRead && <NoResultAccess />}
      {list.error && <CbtError error={list.error} />}
      {canRead && list.data?.length === 0 && <p className="text-sm text-muted-foreground">No results visible to you yet.</p>}
      {list.data?.map((s) => (
        <Card key={s.examId}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6 text-sm">
            <div className="space-y-1">
              <Link to="/cbt/results/$examId" params={{ examId: s.examId }} className="font-semibold text-primary underline-offset-4 hover:underline">{s.title}</Link>
              <p className="text-muted-foreground">{s.total} result(s) · {s.released} released · {s.pendingMarking} awaiting marking · release policy {s.releasePolicy}</p>
            </div>
            <Badge variant={s.released === s.total ? "default" : "secondary"}>{s.released === s.total ? "All released" : "Not fully released"}</Badge>
          </CardContent>
        </Card>
      ))}
    </CbtShell>
  );
}
