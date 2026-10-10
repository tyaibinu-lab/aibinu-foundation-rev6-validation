import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PersonStatusBadge, StudentError, StudentShell, useStudentAccess } from "@/components/students/shared";
import { EMPTY_STUDENT, StudentForm } from "@/components/students/StudentForm";
import { createStudent, listClasses, listStudents, PAGE_SIZE } from "@/lib/students/api";
import { describeStudentError, PERSON_STATUSES, STATUS_LABEL, type PersonStatus } from "@/lib/students/permissions";

export const Route = createFileRoute("/students/")({
  head: () => ({
    meta: [
      { title: "Student Directory — Aibinu Flexiprep" },
      { name: "description", content: "Search, register and manage students in your organisation." },
      { property: "og:title", content: "Student Directory — Aibinu Flexiprep" },
      { property: "og:description", content: "Search, register and manage students in your organisation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Directory,
});

function Directory() {
  const { caps, orgId, loading, error } = useStudentAccess();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<PersonStatus | "all">("all");
  const [classId, setClassId] = useState("all");
  const [page, setPage] = useState(0);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const classes = useQuery({ queryKey: ["students", "classes", "all"], queryFn: () => listClasses(), retry: false, enabled: caps.canRead });
  const students = useQuery({
    queryKey: ["students", "list", search, status, classId, page],
    queryFn: () => listStudents({ search, status, classId: classId === "all" ? undefined : classId, page }),
    retry: false,
    enabled: caps.canRead,
    placeholderData: keepPreviousData,
  });

  const create = useMutation({
    mutationFn: (v: Parameters<typeof createStudent>[1]) => createStudent(orgId!, v),
    onSuccess: (s) => {
      toast.success(`${s.full_name} registered`);
      qc.invalidateQueries({ queryKey: ["students", "list"] });
      navigate({ to: "/students/$studentId", params: { studentId: s.id } });
    },
    onError: (e) => toast.error(describeStudentError(e)),
  });

  const total = students.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <StudentShell title="Student directory" subtitle="Students in your current organisation. Access is enforced by the database.">
      {loading && <p className="text-sm text-muted-foreground">Checking your permissions…</p>}
      {error && <StudentError error={error} />}
      {!loading && !error && !caps.canRead && (
        <p className="rounded-md border border-border p-4 text-sm text-muted-foreground">You don't have permission to view the student directory (requires student.read).</p>
      )}

      {caps.canManageStudents && (
        showForm ? (
          <Card>
            <CardHeader><CardTitle>Register a student</CardTitle></CardHeader>
            <CardContent>
              <StudentForm initial={EMPTY_STUDENT} submitLabel="Register student" pending={create.isPending} onSubmit={(v) => create.mutate(v)} onCancel={() => setShowForm(false)} />
            </CardContent>
          </Card>
        ) : (
          <Button onClick={() => setShowForm(true)} disabled={!orgId}>Register student</Button>
        )
      )}

      {caps.canRead && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <Input placeholder="Search name or admission no." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} aria-label="Search students" />
              <Select value={status} onValueChange={(v) => { setStatus(v as PersonStatus | "all"); setPage(0); }}>
                <SelectTrigger aria-label="Status filter"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {PERSON_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={classId} onValueChange={(v) => { setClassId(v); setPage(0); }}>
                <SelectTrigger aria-label="Class filter"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All classes</SelectItem>
                  {(classes.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {students.error && <StudentError error={students.error} />}
            {students.isLoading && <p className="text-sm text-muted-foreground">Loading students…</p>}
            {students.data && students.data.rows.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No students match these filters.</p>
            )}
            {students.data && students.data.rows.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Name</TableHead><TableHead>Admission no.</TableHead><TableHead>Status</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {students.data.rows.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell><Link to="/students/$studentId" params={{ studentId: s.id }} className="font-medium text-primary underline-offset-4 hover:underline">{s.full_name}</Link></TableCell>
                      <TableCell>{s.admission_no ?? "—"}</TableCell>
                      <TableCell><PersonStatusBadge status={s.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{total} student{total === 1 ? "" : "s"} · page {page + 1} of {pages}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </StudentShell>
  );
}
