import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DbError, NoteBankShell, SourceBadge, StatusBadge, useNoteAccess } from "@/components/notebank/shared";
import { createVersion, getNote, publishVersion, reviewVersion, submitVersion, unpublishNote, updateDraft, type NoteVersionRow } from "@/lib/notebank/api";
import { noteCapabilities, type ContentVisibility, type ReviewDecision } from "@/lib/notebank/permissions";

export const Route = createFileRoute("/notebank/$noteId")({
  head: () => ({
    meta: [
      { title: "Note — Aibinu Flexiprep NoteBank" },
      { name: "description", content: "Edit, review and publish a NoteBank note." },
      { property: "og:title", content: "Note — Aibinu Flexiprep NoteBank" },
      { property: "og:description", content: "Edit, review and publish a NoteBank note." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotePage,
});

function NotePage() {
  const { noteId } = Route.useParams();
  const qc = useQueryClient();
  const { perms, ctx } = useNoteAccess();
  const q = useQuery({ queryKey: ["notebank", "note", noteId], queryFn: () => getNote(noteId), retry: false });
  const refresh = () => qc.invalidateQueries({ queryKey: ["notebank"] });

  if (q.error) return <NoteBankShell title="Note" subtitle=""><DbError error={q.error} /></NoteBankShell>;
  if (!q.data) return <NoteBankShell title="Note" subtitle="Loading…">{null}</NoteBankShell>;
  const { note, versions, reviews } = q.data;
  const latest = versions[0];
  const cap = noteCapabilities(perms);
  const isAuthor = !!latest && !!ctx.userId && latest.created_by === ctx.userId;

  return (
    <NoteBankShell title={note.title} subtitle="Server-enforced workflow: draft → in review → approved → published.">
      <div className="flex items-center gap-2"><span className="text-sm text-muted-foreground">Note status:</span><StatusBadge status={note.status} /><SourceBadge source={note.source} /></div>
      {note.source === "ai" && note.status !== "published" && (
        <p className="text-sm text-muted-foreground">This note was drafted by AI. Check and edit it before submitting; it cannot be published until a reviewer approves it.</p>
      )}
      {latest && <Editor key={latest.id} version={latest} canWrite={cap.canAuthor} orgId={ctx.orgId} userId={ctx.userId} noteId={note.id} onDone={refresh} />}
      {latest?.status === "in_review" && cap.canReview && isAuthor && (
        <p className="text-sm text-muted-foreground">You wrote this version, so another reviewer must review it. The database also blocks self-review.</p>
      )}
      {latest?.status === "in_review" && cap.canReview && !isAuthor && ctx.orgId && ctx.userId && (
        <ReviewPanel version={latest} orgId={ctx.orgId} reviewerId={ctx.userId} canApprove={cap.canApprove} onDone={refresh} />
      )}
      {latest?.status === "approved" && cap.canPublish && <PublishAction version={latest} onDone={refresh} />}
      {note.status === "published" && cap.canPublish && <UnpublishAction noteId={note.id} onDone={refresh} />}
      <Card>
        <CardHeader><CardTitle>Review history</CardTitle></CardHeader>
        <CardContent>
          {reviews.length === 0 ? <p className="text-sm text-muted-foreground">No reviews yet.</p> : (
            <ul className="space-y-3">
              {reviews.map((r) => {
                const v = versions.find((x) => x.id === r.note_version_id);
                return (
                  <li key={r.id} className="rounded-md border border-border p-3 text-sm">
                    <p className="font-medium">{r.decision.replace("_", " ")} · v{v?.version_no ?? "?"} · {new Date(r.reviewed_at).toLocaleString()}</p>
                    {r.comments && <p className="mt-1 text-muted-foreground">{r.comments}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </NoteBankShell>
  );
}

function Editor({ version, canWrite, orgId, userId, noteId, onDone }: { version: NoteVersionRow; canWrite: boolean; orgId: string | null; userId: string | null; noteId: string; onDone: () => void }) {
  const [body, setBody] = useState(version.body);
  const [summary, setSummary] = useState(version.summary ?? "");
  useEffect(() => { setBody(version.body); setSummary(version.summary ?? ""); }, [version]);
  const isDraft = version.status === "draft";
  const editable = canWrite && isDraft;

  const save = useMutation({ mutationFn: () => updateDraft(version.id, { body, summary }), onSuccess: () => { toast.success("Draft saved"); onDone(); } });
  const submit = useMutation({ mutationFn: async () => { await updateDraft(version.id, { body, summary }); await submitVersion(version.id); }, onSuccess: () => { toast.success("Submitted for review"); onDone(); } });
  const revise = useMutation({ mutationFn: () => createVersion({ orgId: orgId!, userId: userId!, noteId, body, summary }), onSuccess: () => { toast.success("New draft version created"); onDone(); } });
  const err = save.error ?? submit.error ?? revise.error;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between"><CardTitle>Version {version.version_no ?? "?"}</CardTitle><StatusBadge status={version.status} /></CardHeader>
      <CardContent className="space-y-3">
        <div><Label htmlFor="sum">Summary</Label><Input id="sum" value={summary} disabled={!editable} onChange={(e) => setSummary(e.target.value)} /></div>
        <div><Label htmlFor="body">Body</Label><Textarea id="body" rows={14} value={body} disabled={!editable} onChange={(e) => setBody(e.target.value)} /></div>
        {err && <DbError error={err} />}
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            {isDraft ? (
              <>
                <Button variant="outline" disabled={save.isPending || !body.trim()} onClick={() => save.mutate()}>Save draft</Button>
                <Button disabled={submit.isPending || !body.trim()} onClick={() => submit.mutate()}>Submit for review</Button>
              </>
            ) : version.status !== "in_review" && orgId && userId ? (
              <Button variant="outline" disabled={revise.isPending} onClick={() => revise.mutate()}>Start new revision</Button>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewPanel({ version, orgId, reviewerId, canApprove, onDone }: { version: NoteVersionRow; orgId: string; reviewerId: string; canApprove: boolean; onDone: () => void }) {
  const [comments, setComments] = useState("");
  const m = useMutation({
    mutationFn: (decision: ReviewDecision) => reviewVersion({ orgId, reviewerId, versionId: version.id, decision, comments }),
    onSuccess: () => { toast.success("Review recorded"); setComments(""); onDone(); },
  });
  return (
    <Card className="border-accent">
      <CardHeader><CardTitle>Review this version</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Textarea placeholder="Comments for the author" rows={4} value={comments} onChange={(e) => setComments(e.target.value)} maxLength={4000} />
        {m.error && <DbError error={m.error} />}
        <div className="flex flex-wrap gap-2">
          {canApprove && <Button disabled={m.isPending} onClick={() => m.mutate("approved")}>Approve</Button>}
          <Button variant="outline" disabled={m.isPending || !comments.trim()} onClick={() => m.mutate("changes_requested")}>Request changes</Button>
          <Button variant="destructive" disabled={m.isPending || !comments.trim()} onClick={() => m.mutate("rejected")}>Reject</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PublishAction({ version, onDone }: { version: NoteVersionRow; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [visibility, setVisibility] = useState<ContentVisibility>("organisation");
  const m = useMutation({ mutationFn: () => publishVersion(version.id, visibility), onSuccess: () => { toast.success("Published"); setOpen(false); onDone(); } });
  return (
    <>
      <Button className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => setOpen(true)}>Publish approved version</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish version {version.version_no ?? "?"}</DialogTitle>
            <DialogDescription>Any previously published version will be archived.</DialogDescription>
          </DialogHeader>
          <RadioGroup value={visibility} onValueChange={(v) => setVisibility(v as ContentVisibility)}>
            {(["private", "organisation", "shared"] as const).map((v) => (
              <div key={v} className="flex items-center gap-2"><RadioGroupItem id={`vis-${v}`} value={v} /><Label htmlFor={`vis-${v}`} className="capitalize">{v}</Label></div>
            ))}
          </RadioGroup>
          {m.error && <DbError error={m.error} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={m.isPending} onClick={() => m.mutate()}>{m.isPending ? "Publishing…" : "Publish"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function UnpublishAction({ noteId, onDone }: { noteId: string; onDone: () => void }) {
  const m = useMutation({ mutationFn: () => unpublishNote(noteId), onSuccess: () => { toast.success("Note taken offline"); onDone(); } });
  return (
    <div className="space-y-2">
      <Button variant="outline" disabled={m.isPending} onClick={() => m.mutate()}>{m.isPending ? "Unpublishing…" : "Unpublish note"}</Button>
      {m.error && <DbError error={m.error} />}
    </div>
  );
}
