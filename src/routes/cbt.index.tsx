import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CbtError, CbtShell, ExamStatusBadge, fmtDate, useExamAccess, StaffOnly } from "@/components/cbt/shared";
import { listExams, listSubjects } from "@/lib/cbt/api";

export const Route = createFileRoute("/cbt/")({
  head: () => ({
    meta: [
      { title: "CBT Exam Administration — Aibinu Flexiprep" },
      { name: "description", content: "Create, assemble and publish computer-based exams from published Question Bank items." },
      { property: "og:title", content: "CBT Exam Administration — Aibinu Flexiprep" },
      { property: "og:description", content: "Create, assemble and publish computer-based exams from published Question Bank items." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CbtHome,
});

function CbtHome() {
  const access = useExamAccess();
  const exams = useQuery({ queryKey: ["cbt", "exams"], queryFn: listExams, retry: false, enabled: access.canCreate });
  const subjects = useQuery({ queryKey: ["cbt", "subjects"], queryFn: listSubjects, retry: false });
  const subjectName = (id: string | null) => subjects.data?.find((s) => s.id === id)?.name ?? "—";

  return (
    <CbtShell
      title="Exams"
      subtitle="Exams use only published Question Bank versions. Publishing and closing are checked by the database."
      actions={access.canCreate ? <Button asChild><Link to="/cbt/new">New exam</Link></Button> : undefined}
    >
      {!access.loading && !access.canCreate && <StaffOnly />}
      {exams.error && <CbtError error={exams.error} />}
      {exams.isLoading && <p className="text-sm text-muted-foreground">Loading exams…</p>}
      {exams.data && exams.data.length === 0 && (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">No exams you can manage in this organisation yet.</CardContent></Card>
      )}
      {exams.data && exams.data.length > 0 && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead><TableHead>Subject</TableHead><TableHead>Status</TableHead>
                <TableHead>Opens</TableHead><TableHead>Closes</TableHead><TableHead>Duration</TableHead>
                <TableHead>Questions</TableHead><TableHead>Marks</TableHead><TableHead>Eligibility</TableHead><TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {exams.data.map((x) => (
                <TableRow key={x.id}>
                  <TableCell className="font-medium">{x.title}</TableCell>
                  <TableCell>{subjectName(x.subject_id)}</TableCell>
                  <TableCell><ExamStatusBadge status={x.status} /></TableCell>
                  <TableCell>{fmtDate(x.opens_at)}</TableCell>
                  <TableCell>{fmtDate(x.closes_at)}</TableCell>
                  <TableCell>{x.duration_min} min</TableCell>
                  <TableCell>{x.questionCount}</TableCell>
                  <TableCell>{Number(x.total_marks)}</TableCell>
                  <TableCell>{x.eligibilityCount} rule(s)</TableCell>
                  <TableCell><Button size="sm" variant="outline" asChild><Link to="/cbt/$examId" params={{ examId: x.id }}>{x.status === "draft" && access.canCreate ? "Configure" : "View"}</Link></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </CbtShell>
  );
}
