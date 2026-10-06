import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QError, QStatusBadge, QuestionBankShell, useQuestionAccess } from "@/components/questionbank/shared";
import { listQuestions, listTopicOptions } from "@/lib/questionbank/api";
import {
  DIFFICULTIES,
  QUESTION_TYPE_LABEL,
  QUESTION_TYPES,
  STATUS_LABEL,
  questionCapabilities,
  type ContentStatus,
  type Difficulty,
  type QuestionType,
} from "@/lib/questionbank/permissions";

export const Route = createFileRoute("/questionbank/")({
  head: () => ({
    meta: [
      { title: "Question Bank — Aibinu Flexiprep" },
      { name: "description", content: "Browse, filter and manage curriculum-aligned questions through review and publication." },
      { property: "og:title", content: "Question Bank — Aibinu Flexiprep" },
      { property: "og:description", content: "Browse, filter and manage curriculum-aligned questions through review and publication." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: QuestionBankHome,
});

const ALL = "all";
const STATUSES: ContentStatus[] = ["draft", "in_review", "approved", "published", "archived"];

function QuestionBankHome() {
  const { perms, loading, error } = useQuestionAccess();
  const cap = questionCapabilities(perms);
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState(ALL);
  const [topic, setTopic] = useState(ALL);
  const [type, setType] = useState(ALL);
  const [difficulty, setDifficulty] = useState(ALL);
  const [status, setStatus] = useState(ALL);

  const topics = useQuery({ queryKey: ["questionbank", "topics"], queryFn: listTopicOptions, retry: false, enabled: cap.canRead });
  const subjects = useMemo(() => {
    const m = new Map<string, string>();
    (topics.data ?? []).forEach((t) => t.subjectId && m.set(t.subjectId, t.subjectName));
    return [...m.entries()];
  }, [topics.data]);
  const topicChoices = (topics.data ?? []).filter((t) => subject === ALL || t.subjectId === subject);
  const topicIds = topic !== ALL ? [topic] : subject !== ALL ? topicChoices.map((t) => t.id) : undefined;

  const all = useQuery({ queryKey: ["questionbank", "list", "all"], queryFn: () => listQuestions(), retry: false, enabled: cap.canRead });
  const filters = {
    search,
    topicIds,
    type: type === ALL ? undefined : (type as QuestionType),
    difficulty: difficulty === ALL ? undefined : (difficulty as Difficulty),
    status: status === ALL ? undefined : (status as ContentStatus),
  };
  const list = useQuery({ queryKey: ["questionbank", "list", filters], queryFn: () => listQuestions(filters), retry: false, enabled: cap.canRead });
  const topicName = (id: string) => topics.data?.find((t) => t.id === id)?.title ?? "—";

  const counts = STATUSES.slice(0, 4).map((s) => ({ s, n: (all.data ?? []).filter((q) => q.version_status === s).length }));

  return (
    <QuestionBankShell
      title="Question Bank"
      subtitle="Every question is checked by a reviewer and approved before it can be published or used in an exam."
      actions={cap.canAuthor ? <Button asChild><Link to="/questionbank/new">New question</Link></Button> : undefined}
    >
      {loading && <p className="text-sm text-muted-foreground">Checking your permissions…</p>}
      {error && <QError error={error} />}
      {!loading && !error && !cap.canRead && (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">Your account does not have access to the Question Bank.</CardContent></Card>
      )}

      {cap.canRead && (
        <>
          <section aria-label="Summary" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">All questions</p><p className="text-2xl font-bold">{all.data?.length ?? "–"}</p></CardContent></Card>
            {counts.map(({ s, n }) => (
              <Card key={s}><CardContent className="pt-6"><p className="text-xs text-muted-foreground">{STATUS_LABEL[s]}</p><p className="text-2xl font-bold">{all.data ? n : "–"}</p></CardContent></Card>
            ))}
          </section>

          <Card>
            <CardHeader><CardTitle>Find questions</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2 lg:col-span-3">
                <Label htmlFor="qb-search">Search question text</Label>
                <Input id="qb-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. quadratic" />
              </div>
              <FilterSelect label="Subject" value={subject} onChange={(v) => { setSubject(v); setTopic(ALL); }} options={subjects.map(([id, name]) => [id, name])} />
              <FilterSelect label="Topic" value={topic} onChange={setTopic} options={topicChoices.map((t) => [t.id, `${t.code} · ${t.title}`])} />
              <FilterSelect label="Question type" value={type} onChange={setType} options={QUESTION_TYPES.map((t) => [t, QUESTION_TYPE_LABEL[t]])} />
              <FilterSelect label="Difficulty" value={difficulty} onChange={setDifficulty} options={DIFFICULTIES.map((d) => [d, d])} />
              <FilterSelect label="Status" value={status} onChange={setStatus} options={STATUSES.map((s) => [s, STATUS_LABEL[s]])} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Questions</CardTitle></CardHeader>
            <CardContent>
              {list.error ? <QError error={list.error} /> : list.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (list.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No questions match.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {list.data!.map((q) => (
                    <li key={q.question_id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <div className="min-w-0 flex-1">
                        <Link to="/questionbank/$questionId" params={{ questionId: q.question_id }} className="line-clamp-2 font-medium text-primary hover:underline">
                          {q.stem ?? "Untitled question"}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {QUESTION_TYPE_LABEL[q.type]} · {topicName(q.topic_id)} · {q.difficulty ?? "—"} · v{q.version_no ?? "?"}
                        </p>
                      </div>
                      {q.version_status && <QStatusBadge status={q.version_status} />}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </QuestionBankShell>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All</SelectItem>
          {options.map(([v, l]) => <SelectItem key={v} value={v} className="capitalize">{l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
