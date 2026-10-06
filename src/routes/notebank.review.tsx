import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DbError, NoteBankShell, StatusBadge, useNoteAccess } from "@/components/notebank/shared";
import { listVersionsByStatus } from "@/lib/notebank/api";
import { noteCapabilities } from "@/lib/notebank/permissions";

export const Route = createFileRoute("/notebank/review")({
  head: () => ({
    meta: [
      { title: "Reviewer Workspace — Aibinu Flexiprep NoteBank" },
      { name: "description", content: "Review submitted notes and publish approved versions." },
      { property: "og:title", content: "Reviewer Workspace — Aibinu Flexiprep NoteBank" },
      { property: "og:description", content: "Review submitted notes and publish approved versions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReviewerWorkspace,
});

function Queue({ status, title, enabled }: { status: "in_review" | "approved"; title: string; enabled: boolean }) {
  const q = useQuery({ queryKey: ["notebank", "queue", status], queryFn: () => listVersionsByStatus(status), retry: false, enabled });
  if (!enabled) return null;
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        {q.error ? <DbError error={q.error} /> : q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (q.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing waiting.</p>
        ) : (
          <ul className="divide-y divide-border">
            {q.data!.map((v) => (
              <li key={v.id} className="flex items-center justify-between py-3">
                <Link to="/notebank/$noteId" params={{ noteId: v.note_id }} className="font-medium text-primary hover:underline">
                  {v.notes?.title ?? "Untitled"} <span className="text-xs text-muted-foreground">v{v.version_no ?? "?"}</span>
                </Link>
                <StatusBadge status={v.status} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewerWorkspace() {
  const { perms, loading, error } = useNoteAccess();
  const cap = noteCapabilities(perms);
  return (
    <NoteBankShell title="Reviewer workspace" subtitle="Review submitted versions. Approval requires academic.notes.approve; publishing requires academic.notes.publish.">
      {loading && <p className="text-sm text-muted-foreground">Checking your permissions…</p>}
      {error && <DbError error={error} />}
      {!loading && !error && !cap.canReview && !cap.canPublish && (
        <p className="text-sm text-muted-foreground">Your role does not include academic.notes.review, academic.notes.approve or academic.notes.publish.</p>
      )}
      {!loading && !error && cap.canReview && !cap.canApprove && (
        <p className="text-sm text-muted-foreground">You can comment, request changes or reject. Approving needs academic.notes.approve.</p>
      )}
      <Queue status="in_review" title="Awaiting review" enabled={cap.canReview} />
      <Queue status="approved" title="Approved — ready to publish" enabled={cap.canPublish} />
    </NoteBankShell>
  );
}
