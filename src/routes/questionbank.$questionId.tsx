import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QError, QSourceBadge, QStatusBadge, QuestionBankShell, useQuestionAccess } from "@/components/questionbank/shared";
import { QuestionFields, draftFromVersion } from "@/components/questionbank/QuestionForm";
import {
  createQuestionVersion,
  getQuestion,
  listTopicOptions,
  publishQuestionVersion,
  reviewQuestionVersion,
  submitQuestionVersion,
  unpublishQuestion,
  updateQuestionDraft,
  type QuestionRow,
  type QuestionVersionRow,
} from "@/lib/questionbank/api";
import {
  QUESTION_TYPE_LABEL,
  questionCapabilities,
  toVersionPayload,
  usesAnswerKey,
  usesOptions,
  validateDraft,
  type ContentVisibility,
  type ReviewDecision,
} from "@/lib/questionbank/permissions";

export const Route = createFileRoute("/questionbank/$questionId")({
  head: () => ({
    meta: [
      { title: "Question — Aibinu Flexiprep Question Bank" },
      { name: "description", content: "Edit, review and publish a Question Bank question." },
      { property: "og:title", content: "Question — Aibinu Flexiprep Question Bank" },
      { property: "og:description", content: "Edit, review and publish a Question Bank question." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: QuestionPage,
});

function QuestionPage() {
  const { questionId } = Route.useParams();
  const qc = useQueryClient();
  const { perms, ctx } = useQuestionAccess();
  const cap = questionCapabilities(perms);
  const q = useQuery({ queryKey: ["questionbank", "question", questionId], queryFn: () => getQuestion(questionId), retry: false });
  const topics = useQuery({ queryKey: ["questionbank", "topics"], queryFn: listTopicOptions, retry: false });
  const refresh = () => qc.invalidateQueries({ queryKey: ["questionbank"] });

  if (q.error) return <QuestionBankShell title="Question" subtitle=""><QError error={q.error} /></QuestionBankShell>;
  if (!q.data) return <QuestionBankShell title="Question" subtitle="Loading…">{null}</QuestionBankShell>;
  const { question, versions, reviews, publications } = q.data;
  const latest = versions[0];
  const isAuthor = !!latest && !!ctx.userId && latest.created_by === ctx.userId;
  const topic = topics.data?.find((t) => t.id === question.topic_id);

  return (
    <QuestionBankShell title={QUESTION_TYPE_LABEL[question.type]} subtitle="Draft → in review → approved → published. Every step is checked by the database.">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Question status:</span>
        <QStatusBadge status={question.status} />
        <QSourceBadge source={question.source} />
        <span className="text-muted-foreground">· {topic ? `${topic.subjectName} · ${topic.code} ${topic.title}` : "Topic"}</span>
      </div>
      {question.source === "ai" && question.status !== "published" && (
        <p className="text-sm text-muted-foreground">This question was drafted by AI. Check and edit it before submitting. It cannot be published until another person approves it.</p>
      )}

      {latest && (
        <VersionCard
          key={latest.id + latest.status}
          question={question}
          version={latest}
          canWrite={cap.canAuthor}
          showAnswers={cap.canSeeAnswers}
          orgId={ctx.orgId}
          userId={ctx.userId}
          onDone={refresh}
        />
      )}

      {latest?.status === "in_review" && cap.canReview && isAuthor && (
        <p className="text-sm text-muted-foreground">You wrote this version, so another reviewer must review it.</p>
      )}
      {latest?.status === "in_review" && cap.canReview && !isAuthor && ctx.orgId && ctx.userId && (
        <ReviewPanel version={latest} orgId={ctx.orgId} reviewerId={ctx.userId} canApprove={cap.canApprove} onDone={refresh} />
      )}
      {latest?.status === "approved" && cap.canPublish && <PublishAction version={latest} onDone={refresh} />}
      {question.status === "published" && cap.canPublish && <UnpublishAction questionId={question.id} onDone={refresh} />}

      <Card>
        <CardHeader><CardTitle>Version history</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">v{v.version_no ?? "?"}</span>
                <QStatusBadge status={v.status} />
                <span className="text-muted-foreground">{new Date(v.created_at).toLocaleString()}{v.created_by === ctx.userId ? " · by you" : ""}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Review history</CardTitle></CardHeader>
        <CardContent>
          {reviews.length === 0 ? <p className="text-sm text-muted-foreground">No reviews yet.</p> : (
            <ul className="space-y-3">
              {reviews.map((r) => {
                const v = versions.find((x) => x.id === r.question_version_id);
                return (
                  <li key={r.id} className="rounded-md border border-border p-3 text-sm">
                    <p className="font-medium capitalize">{r.decision.replace("_", " ")} · v{v?.version_no ?? "?"} · {new Date(r.reviewed_at).toLocaleString()}</p>
                    {r.comments && <p className="mt-1 text-muted-foreground">{r.comments}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Publication history</CardTitle></CardHeader>
        <CardContent>
          {publications.length === 0 ? <p className="text-sm text-muted-foreground">Never published.</p> : (
            <ul className="space-y-2 text-sm">
              {publications.map((p) => {
                const v = versions.find((x) => x.id === p.question_version_id);
                return (
                  <li key={p.id}>
                    v{v?.version_no ?? "?"} · {p.visibility} · published {new Date(p.published_at).toLocaleString()}
                    {p.unpublished_at ? ` · taken offline ${new Date(p.unpublished_at).toLocaleString()}` : " · live"}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </QuestionBankShell>
  );
}

function VersionCard({ question, version, canWrite, showAnswers, orgId, userId, onDone }: {
  question: QuestionRow; version: QuestionVersionRow; canWrite: boolean; showAnswers: boolean; orgId: string | null; userId: string | null; onDone: () => void;
}) {
  const [draft, setDraft] = useState(() => draftFromVersion(question.type, version));
  const isDraft = version.status === "draft";
  const editable = canWrite && isDraft;
  const issues = validateDraft(draft);

  const save = useMutation({ mutationFn: () => updateQuestionDraft(version.id, toVersionPayload(draft)), onSuccess: () => { toast.success("Draft saved"); onDone(); } });
  const submit = useMutation({
    mutationFn: async () => { await updateQuestionDraft(version.id, toVersionPayload(draft)); await submitQuestionVersion(version.id); },
    onSuccess: () => { toast.success("Submitted for review"); onDone(); },
  });
  const revise = useMutation({
    mutationFn: () => createQuestionVersion({ orgId: orgId!, userId: userId!, questionId: question.id, version: toVersionPayload(draft) }),
    onSuccess: () => { toast.success("New draft version created"); onDone(); },
  });
  const err = save.error ?? submit.error ?? revise.error;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Version {version.version_no ?? "?"}</CardTitle>
        <QStatusBadge status={version.status} />
      </CardHeader>
      <CardContent className="space-y-4">
        {editable ? (
          <QuestionFields value={draft} onChange={setDraft} />
        ) : (
          <ReadOnlyVersion type={question.type} version={version} showAnswers={showAnswers} />
        )}
        {editable && issues.length > 0 && <ul className="list-disc pl-5 text-sm text-muted-foreground">{issues.map((i) => <li key={i}>{i}</li>)}</ul>}
        {err && <QError error={err} />}
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            {isDraft ? (
              <>
                <Button variant="outline" disabled={save.isPending || issues.length > 0} onClick={() => save.mutate()}>Save draft</Button>
                <Button disabled={submit.isPending || issues.length > 0} onClick={() => submit.mutate()}>Submit for review</Button>
              </>
            ) : version.status !== "in_review" && orgId && userId ? (
              <Button variant="outline" disabled={revise.isPending} onClick={() => revise.mutate()}>Start new version</Button>
            ) : null}
          </div>
        )}
        {!isDraft && canWrite && version.status !== "in_review" && (
          <p className="text-xs text-muted-foreground">This version is locked. A new version starts as a copy you can edit; past exams keep using the version they were built with.</p>
        )}
      </CardContent>
    </Card>
  );
}

function ReadOnlyVersion({ type, version, showAnswers }: { type: QuestionRow["type"]; version: QuestionVersionRow; showAnswers: boolean }) {
  const key = version.answer_key as { accepted?: string[] } | string[] | string | null;
  const accepted = Array.isArray(key) ? key : typeof key === "string" ? [key] : key?.accepted ?? [];
  return (
    <div className="space-y-3 text-sm">
      <p className="whitespace-pre-wrap text-base text-foreground">{version.stem}</p>
      {usesOptions(type) && version.options && (
        <ol className="space-y-1">
          {version.options.map((o) => (
            <li key={o.key} className={`rounded-md border p-2 ${showAnswers && o.is_correct ? "border-primary bg-primary/5 font-medium" : "border-border"}`}>
              {o.key.toUpperCase()}. {o.text}{showAnswers && o.is_correct ? " — correct" : ""}
            </li>
          ))}
        </ol>
      )}
      {showAnswers && usesAnswerKey(type) && <p><span className="font-medium">Accepted answers:</span> {accepted.join(", ") || "—"}</p>}
      {showAnswers && version.explanation && <p><span className="font-medium">Explanation:</span> {version.explanation}</p>}
      <p className="text-muted-foreground">{version.marks} mark(s) · {version.difficulty} · {version.cognitive_level}</p>
    </div>
  );
}

function ReviewPanel({ version, orgId, reviewerId, canApprove, onDone }: { version: QuestionVersionRow; orgId: string; reviewerId: string; canApprove: boolean; onDone: () => void }) {
  const [comments, setComments] = useState("");
  const m = useMutation({
    mutationFn: (decision: ReviewDecision) => reviewQuestionVersion({ orgId, reviewerId, versionId: version.id, decision, comments }),
    onSuccess: () => { toast.success("Review recorded"); setComments(""); onDone(); },
  });
  return (
    <Card className="border-accent">
      <CardHeader><CardTitle>Review this version</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Label htmlFor="rv-comments">Comments for the author</Label>
        <Textarea id="rv-comments" rows={4} value={comments} onChange={(e) => setComments(e.target.value)} maxLength={4000} />
        {m.error && <QError error={m.error} />}
        <div className="flex flex-wrap gap-2">
          {canApprove && <Button disabled={m.isPending} onClick={() => m.mutate("approved")}>Approve</Button>}
          <Button variant="outline" disabled={m.isPending || !comments.trim()} onClick={() => m.mutate("changes_requested")}>Request changes</Button>
          <Button variant="destructive" disabled={m.isPending || !comments.trim()} onClick={() => m.mutate("rejected")}>Reject</Button>
        </div>
        {!canApprove && <p className="text-xs text-muted-foreground">Approval needs separate approve permission.</p>}
      </CardContent>
    </Card>
  );
}

function PublishAction({ version, onDone }: { version: QuestionVersionRow; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [visibility, setVisibility] = useState<ContentVisibility>("organisation");
  const m = useMutation({ mutationFn: () => publishQuestionVersion(version.id, visibility), onSuccess: () => { toast.success("Published"); setOpen(false); onDone(); } });
  return (
    <>
      <Button className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => setOpen(true)}>Publish approved version</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish version {version.version_no ?? "?"}</DialogTitle>
            <DialogDescription>Any previously published version is archived. Exams already built keep their original version.</DialogDescription>
          </DialogHeader>
          <RadioGroup value={visibility} onValueChange={(v) => setVisibility(v as ContentVisibility)}>
            {(["private", "organisation", "shared"] as const).map((v) => (
              <div key={v} className="flex items-center gap-2"><RadioGroupItem id={`qvis-${v}`} value={v} /><Label htmlFor={`qvis-${v}`} className="capitalize">{v}</Label></div>
            ))}
          </RadioGroup>
          {m.error && <QError error={m.error} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={m.isPending} onClick={() => m.mutate()}>{m.isPending ? "Publishing…" : "Publish"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function UnpublishAction({ questionId, onDone }: { questionId: string; onDone: () => void }) {
  const m = useMutation({ mutationFn: () => unpublishQuestion(questionId), onSuccess: () => { toast.success("Question taken offline"); onDone(); } });
  return (
    <div className="space-y-2">
      <Button variant="outline" disabled={m.isPending} onClick={() => m.mutate()}>{m.isPending ? "Unpublishing…" : "Unpublish question"}</Button>
      {m.error && <QError error={m.error} />}
    </div>
  );
}
