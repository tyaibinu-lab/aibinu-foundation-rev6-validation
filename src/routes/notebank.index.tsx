import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DbError, NoteBankShell, StatusBadge, useNoteAccess } from "@/components/notebank/shared";
import { createNote, listNotes, listTopics } from "@/lib/notebank/api";

export const Route = createFileRoute("/notebank/")({
  head: () => ({
    meta: [
      { title: "Teacher Workspace — Aibinu Flexiprep NoteBank" },
      { name: "description", content: "Draft, revise and submit curriculum-aligned notes for review." },
      { property: "og:title", content: "Teacher Workspace — Aibinu Flexiprep NoteBank" },
      { property: "og:description", content: "Draft, revise and submit curriculum-aligned notes for review." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeacherWorkspace,
});

function TeacherWorkspace() {
  const { perms, ctx, loading, error } = useNoteAccess();
  const notes = useQuery({ queryKey: ["notebank", "notes"], queryFn: () => listNotes(), retry: false });
  const topics = useQuery({ queryKey: ["notebank", "topics"], queryFn: listTopics, retry: false, enabled: perms["academic.notes.write"] });
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: "", topicId: "", summary: "", body: "" });

  const create = useMutation({
    mutationFn: () => createNote({ orgId: ctx.orgId!, userId: ctx.userId!, ...form }),
    onSuccess: (n) => navigate({ to: "/notebank/$noteId", params: { noteId: n.id } }),
  });

  return (
    <NoteBankShell title="Teacher workspace" subtitle="Create drafts and submit them for reviewer approval. Nothing is published without review.">
      {loading && <p className="text-sm text-muted-foreground">Checking your permissions…</p>}
      {error && <DbError error={error} />}

      {perms["academic.notes.write"] && (
        <Card>
          <CardHeader><CardTitle>New note draft</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor="t">Title</Label><Input id="t" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} /></div>
              <div>
                <Label>Curriculum topic</Label>
                <Select value={form.topicId} onValueChange={(v) => setForm({ ...form, topicId: v })}>
                  <SelectTrigger><SelectValue placeholder="Choose a topic" /></SelectTrigger>
                  <SelectContent>
                    {(topics.data ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.title ?? t.name ?? t.id}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label htmlFor="s">Summary</Label><Input id="s" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></div>
            <div><Label htmlFor="b">Body</Label><Textarea id="b" rows={8} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
            {create.error && <DbError error={create.error} />}
            <Button disabled={!form.title.trim() || !form.topicId || !form.body.trim() || !ctx.orgId || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? "Saving…" : "Save draft"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Notes in your organisation</CardTitle></CardHeader>
        <CardContent>
          {notes.error ? <DbError error={notes.error} /> : notes.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (notes.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No notes yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {notes.data!.map((n) => (
                <li key={n.id} className="flex items-center justify-between py-3">
                  <Link to="/notebank/$noteId" params={{ noteId: n.id }} className="font-medium text-primary hover:underline">{n.title}</Link>
                  <StatusBadge status={n.status} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </NoteBankShell>
  );
}
