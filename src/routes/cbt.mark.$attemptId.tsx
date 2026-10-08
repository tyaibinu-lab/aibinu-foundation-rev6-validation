import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CbtShell, fmtDate } from "@/components/cbt/shared";
import { answerText, selectedKeys } from "@/lib/cbt/results";
import { canMark, describeMarkingError, listAttemptResponses, markResponse, validateMarks, type MarkingItem } from "@/lib/cbt/marking";

export const Route = createFileRoute("/cbt/mark/$attemptId")({
  head: () => ({
    meta: [
      { title: "Mark Answers — CBT — Aibinu Flexiprep" },
      { name: "description", content: "Mark written answers for a submitted exam attempt." },
      { property: "og:title", content: "Mark Answers — CBT — Aibinu Flexiprep" },
      { property: "og:description", content: "Mark written answers for a submitted exam attempt." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MarkAttempt,
});

function MarkAttempt() {
  const { attemptId } = Route.useParams();
  const perm = useQuery({ queryKey: ["cbt", "perm", "result.mark"], queryFn: canMark, retry: false });
  const items = useQuery({ queryKey: ["cbt", "marking", attemptId], queryFn: () => listAttemptResponses(attemptId), retry: false, enabled: perm.data === true });

  if (perm.isLoading) return <CbtShell title="Marking" subtitle="Checking access…"><span /></CbtShell>;
  if (perm.data !== true) return <CbtShell title="Marking" subtitle=""><div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">Marking is available to staff with marking access in this organisation.</div></CbtShell>;

  const list = items.data ?? [];
  const pending = list.filter((i) => i.markingStatus === "pending").length;
  return (
    <CbtShell title="Mark answers" subtitle={`${pending} answer(s) awaiting marking. Totals and grades are recalculated by the exam system after each mark.`}>
      <Button variant="outline" size="sm" onClick={() => history.back()}>← Back to results</Button>
      {items.error && <Alert variant="destructive"><AlertTitle>Could not load</AlertTitle><AlertDescription>{describeMarkingError(items.error)}</AlertDescription></Alert>}
      {items.data && list.length === 0 && <p className="text-sm text-muted-foreground">No answers you can see for this attempt.</p>}
      {list.map((i) => <MarkCard key={i.responseId} item={i} attemptId={attemptId} />)}
    </CbtShell>
  );
}

function MarkCard({ item, attemptId }: { item: MarkingItem; attemptId: string }) {
  const qc = useQueryClient();
  const manual = item.markingStatus !== "auto";
  const [marks, setMarks] = useState(item.marksAwarded === null ? "" : String(item.marksAwarded));
  const [feedback, setFeedback] = useState(item.feedback ?? "");
  const invalid = marks === "" ? "Enter a number of marks." : validateMarks(Number(marks), item.maxMarks);
  const save = useMutation({
    mutationFn: () => markResponse(item.responseId, Number(marks), feedback),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["cbt"] }),
  });
  const text = answerText(item.studentAnswer);
  const sel = selectedKeys(item.studentAnswer);
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{item.position}. {item.stem}</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="rounded-md bg-muted p-3 whitespace-pre-wrap">{text ?? (sel.length ? `Selected: ${sel.join(", ")}` : "Not answered")}</div>
        <p className="text-muted-foreground">
          {item.markingStatus === "auto" ? "Marked automatically" : item.markingStatus === "marked" ? `Marked${item.markedAt ? ` ${fmtDate(item.markedAt)}` : ""}` : "Awaiting marking"}
          {item.marksAwarded !== null ? ` · ${item.marksAwarded} / ${item.maxMarks}` : ` · out of ${item.maxMarks}`}
        </p>
        {manual && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input aria-label="Marks" type="number" min={0} max={item.maxMarks} step="0.5" value={marks} onChange={(e) => setMarks(e.target.value)} className="w-28" />
              <span className="text-muted-foreground">/ {item.maxMarks}</span>
            </div>
            <Textarea aria-label="Feedback" placeholder="Feedback for the student (optional)" value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={2} />
            {invalid && marks !== "" && <p className="text-destructive">{invalid}</p>}
            {save.error && <p className="text-destructive">{describeMarkingError(save.error)}</p>}
            {save.isSuccess && !save.isPending && <p className="text-muted-foreground">Saved.</p>}
            <Button disabled={!!invalid || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : item.markingStatus === "marked" ? "Update mark" : "Save mark"}</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
