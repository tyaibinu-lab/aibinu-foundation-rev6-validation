import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StudentError, StudentShell, useStudentAccess } from "@/components/students/shared";
import { getRoster, listClasses, listSessions } from "@/lib/students/api";

export const Route = createFileRoute("/students/classes")({
  head: () => ({
    meta: [
      { title: "Class Rosters — Aibinu Flexiprep" },
      { name: "description", content: "View the active student roster of each class by academic session." },
      { property: "og:title", content: "Class Rosters — Aibinu Flexiprep" },
      { property: "og:description", content: "View the active student roster of each class by academic session." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Rosters,
});

function Rosters() {
  const { caps, loading, error } = useStudentAccess();
  const sessions = useQuery({ queryKey: ["students", "sessions"], queryFn: listSessions, retry: false });
  const [sessionId, setSessionId] = useState("");
  const [classId, setClassId] = useState("");

  useEffect(() => {
    if (!sessionId && sessions.data?.length) setSessionId((sessions.data.find((s) => s.is_current) ?? sessions.data[0]).id);
  }, [sessions.data, sessionId]);

  const classes = useQuery({ queryKey: ["students", "classes", sessionId], queryFn: () => listClasses(sessionId), enabled: !!sessionId, retry: false });
  const roster = useQuery({ queryKey: ["students", "roster", classId], queryFn: () => getRoster(classId), enabled: !!classId && caps.canRead, retry: false });
  const cls = classes.data?.find((c) => c.id === classId);

  return (
    <StudentShell title="Class rosters" subtitle="Active enrolments per class. Assign classes from a student's profile.">
      {(loading || sessions.isLoading) && <p className="text-sm text-muted-foreground">Loading…</p>}
      {(error || sessions.error) && <StudentError error={error ?? sessions.error} />}
      {sessions.data && sessions.data.length === 0 && (
        <p className="rounded-md border border-border p-4 text-sm text-muted-foreground">No academic sessions exist in this organisation yet.</p>
      )}
      {!!sessions.data?.length && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <Select value={sessionId} onValueChange={(v) => { setSessionId(v); setClassId(""); }}>
                <SelectTrigger aria-label="Academic session"><SelectValue placeholder="Academic session" /></SelectTrigger>
                <SelectContent>{sessions.data.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {s.term}{s.is_current ? " (current)" : ""}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger aria-label="Class"><SelectValue placeholder="Choose a class" /></SelectTrigger>
                <SelectContent>{(classes.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {classes.error && <StudentError error={classes.error} />}
            {classes.data?.length === 0 && <p className="text-sm text-muted-foreground">No classes in this session.</p>}
            {classId && !caps.canRead && !loading && <p className="text-sm text-muted-foreground">You don't have permission to view rosters (requires student.read).</p>}
            {roster.isLoading && <p className="text-sm text-muted-foreground">Loading roster…</p>}
            {roster.error && <StudentError error={roster.error} />}
            {roster.data && (
              <>
                <p className="text-sm text-muted-foreground">
                  {roster.data.length} active student{roster.data.length === 1 ? "" : "s"}{cls?.capacity ? ` of ${cls.capacity} capacity` : ""}
                </p>
                {roster.data.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No students are enrolled in this class.</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Admission no.</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {roster.data.map((r) => (
                        <TableRow key={r.student_id}>
                          <TableCell><Link to="/students/$studentId" params={{ studentId: r.student_id }} className="text-primary hover:underline">{r.full_name}</Link></TableCell>
                          <TableCell>{r.admission_no ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </StudentShell>
  );
}
