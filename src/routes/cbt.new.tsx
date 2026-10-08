import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { CbtError, CbtShell, useExamAccess } from "@/components/cbt/shared";
import { ExamForm, defaultExamInput } from "@/components/cbt/ExamForm";
import { createExamDraft } from "@/lib/cbt/api";

export const Route = createFileRoute("/cbt/new")({
  head: () => ({
    meta: [
      { title: "New Exam — CBT — Aibinu Flexiprep" },
      { name: "description", content: "Create a draft computer-based exam for your organisation." },
      { property: "og:title", content: "New Exam — CBT — Aibinu Flexiprep" },
      { property: "og:description", content: "Create a draft computer-based exam for your organisation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewExam,
});

function NewExam() {
  const access = useExamAccess();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: createExamDraft,
    onSuccess: ({ id }) => { void qc.invalidateQueries({ queryKey: ["cbt"] }); void navigate({ to: "/cbt/$examId", params: { examId: id } }); },
  });
  return (
    <CbtShell title="New exam" subtitle="The exam is saved as a draft. Add questions and eligible classes next, then publish.">
      {access.loading && <p className="text-sm text-muted-foreground">Checking your permissions…</p>}
      {!access.loading && !access.canCreate && <Card><CardContent className="pt-6 text-sm text-muted-foreground">Your account does not have permission to create exams.</CardContent></Card>}
      {access.canCreate && (
        <>
          {create.error && <CbtError error={create.error} />}
          <ExamForm initial={defaultExamInput()} submitLabel="Create draft exam" pending={create.isPending} onSubmit={(v) => create.mutate(v)} />
        </>
      )}
    </CbtShell>
  );
}
