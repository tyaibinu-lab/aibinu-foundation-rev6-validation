import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QError, QuestionBankShell, useQuestionAccess } from "@/components/questionbank/shared";
import { QuestionFields, emptyDraft, defaultOptions } from "@/components/questionbank/QuestionForm";
import { createQuestion, listTopicOptions } from "@/lib/questionbank/api";
import {
  QUESTION_TYPE_LABEL,
  QUESTION_TYPES,
  questionCapabilities,
  toVersionPayload,
  validateDraft,
  type QuestionType,
} from "@/lib/questionbank/permissions";

export const Route = createFileRoute("/questionbank/new")({
  head: () => ({
    meta: [
      { title: "New Question — Aibinu Flexiprep Question Bank" },
      { name: "description", content: "Write a curriculum-aligned question and save it as a draft for review." },
      { property: "og:title", content: "New Question — Aibinu Flexiprep Question Bank" },
      { property: "og:description", content: "Write a curriculum-aligned question and save it as a draft for review." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewQuestion,
});

function NewQuestion() {
  const { perms, ctx, loading, error } = useQuestionAccess();
  const cap = questionCapabilities(perms);
  const navigate = useNavigate();
  const topics = useQuery({ queryKey: ["questionbank", "topics"], queryFn: listTopicOptions, retry: false, enabled: cap.canAuthor });
  const [subject, setSubject] = useState("");
  const [topicId, setTopicId] = useState("");
  const [draft, setDraft] = useState(emptyDraft("mcq"));
  const [formKey, setFormKey] = useState(0);
  const issues = validateDraft(draft);

  const subjects = useMemo(() => {
    const m = new Map<string, string>();
    (topics.data ?? []).forEach((t) => t.subjectId && m.set(t.subjectId, t.subjectName));
    return [...m.entries()];
  }, [topics.data]);
  const topicChoices = (topics.data ?? []).filter((t) => !subject || t.subjectId === subject);

  const create = useMutation({
    mutationFn: () => createQuestion({ orgId: ctx.orgId!, userId: ctx.userId!, topicId, type: draft.type, version: toVersionPayload(draft) }),
    onSuccess: (q) => { toast.success("Draft saved"); navigate({ to: "/questionbank/$questionId", params: { questionId: q.id } }); },
  });

  return (
    <QuestionBankShell title="New question" subtitle="Saved as a draft. You can edit it and then submit it for review.">
      {loading && <p className="text-sm text-muted-foreground">Checking your permissions…</p>}
      {error && <QError error={error} />}
      {!loading && !error && !cap.canAuthor && (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">Your account cannot write questions.</CardContent></Card>
      )}
      {cap.canAuthor && (
        <Card>
          <CardHeader><CardTitle>Question details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label>Subject</Label>
                <Select value={subject} onValueChange={(v) => { setSubject(v); setTopicId(""); }}>
                  <SelectTrigger aria-label="Subject"><SelectValue placeholder="Choose a subject" /></SelectTrigger>
                  <SelectContent>{subjects.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Curriculum topic</Label>
                <Select value={topicId} onValueChange={setTopicId}>
                  <SelectTrigger aria-label="Curriculum topic"><SelectValue placeholder="Choose a topic" /></SelectTrigger>
                  <SelectContent>{topicChoices.map((t) => <SelectItem key={t.id} value={t.id}>{t.code} · {t.title}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Question type</Label>
                <Select
                  value={draft.type}
                  onValueChange={(v) => { const t = v as QuestionType; setDraft({ ...draft, type: t, options: defaultOptions(t) }); setFormKey((k) => k + 1); }}
                >
                  <SelectTrigger aria-label="Question type"><SelectValue /></SelectTrigger>
                  <SelectContent>{QUESTION_TYPES.map((t) => <SelectItem key={t} value={t}>{QUESTION_TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <QuestionFields key={formKey} value={draft} onChange={setDraft} />
            {issues.length > 0 && (
              <ul className="list-disc pl-5 text-sm text-muted-foreground">{issues.map((i) => <li key={i}>{i}</li>)}</ul>
            )}
            {create.error && <QError error={create.error} />}
            <Button disabled={!topicId || issues.length > 0 || !ctx.orgId || !ctx.userId || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? "Saving…" : "Save draft"}
            </Button>
          </CardContent>
        </Card>
      )}
    </QuestionBankShell>
  );
}
