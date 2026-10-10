import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormErrors, PersonStatusBadge, StudentError, StudentShell, useStudentAccess } from "@/components/students/shared";
import { StudentForm } from "@/components/students/StudentForm";
import {
  addGuardian, assignClass, getStudent, listClasses, listEnrolments, listGuardians, listSessions,
  setPrimaryGuardian, unlinkGuardian, updateStudent, withdrawEnrolment, type StudentRow,
} from "@/lib/students/api";
import {
  describeStudentError, GENDER_LABEL, RELATIONSHIP_LABEL, RELATIONSHIPS, validateGuardian,
  type GuardianInput, type StudentInput,
} from "@/lib/students/permissions";

export const Route = createFileRoute("/students/$studentId")({
  head: () => ({
    meta: [
      { title: "Student Profile — Aibinu Flexiprep" },
      { name: "description", content: "Student profile, class enrolment and guardians." },
      { property: "og:title", content: "Student Profile — Aibinu Flexiprep" },
      { property: "og:description", content: "Student profile, class enrolment and guardians." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Profile,
});

const toInput = (s: StudentRow): StudentInput => ({
  admissionNo: s.admission_no ?? "", fullName: s.full_name, dateOfBirth: s.date_of_birth ?? "",
  gender: s.gender, phone: s.phone ?? "", email: s.email ?? "", status: s.status,
});

function Profile() {
  const { studentId } = Route.useParams();
  const { caps, perms, orgId } = useStudentAccess();
  const qc = useQueryClient();
  const student = useQuery({ queryKey: ["students", "one", studentId], queryFn: () => getStudent(studentId), retry: false });
  const [editing, setEditing] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["students"] });

  const update = useMutation({
    mutationFn: (v: StudentInput) => updateStudent(studentId, v),
    onSuccess: () => { toast.success("Profile updated"); setEditing(false); refresh(); },
    onError: (e) => toast.error(describeStudentError(e)),
  });

  return (
    <StudentShell title={student.data?.full_name ?? "Student profile"} subtitle="Profile, class enrolment and guardians.">
      <Link to="/students" className="text-sm text-primary hover:underline">← Back to directory</Link>
      {student.isLoading && <p className="text-sm text-muted-foreground">Loading student…</p>}
      {student.error && <StudentError error={student.error} />}
      {student.data && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Profile</CardTitle>
              {caps.canManageStudents && !editing && <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit</Button>}
            </CardHeader>
            <CardContent>
              {editing ? (
                <StudentForm initial={toInput(student.data)} submitLabel="Save changes" pending={update.isPending} onSubmit={(v) => update.mutate(v)} onCancel={() => setEditing(false)} />
              ) : (
                <dl className="grid gap-3 text-sm sm:grid-cols-3">
                  <Field label="Admission no." value={student.data.admission_no} />
                  <Field label="Date of birth" value={student.data.date_of_birth} />
                  <Field label="Gender" value={GENDER_LABEL[student.data.gender]} />
                  <Field label="Phone" value={student.data.phone} />
                  <Field label="Email" value={student.data.email} />
                  <div><dt className="text-muted-foreground">Status</dt><dd className="mt-1"><PersonStatusBadge status={student.data.status} /></dd></div>
                </dl>
              )}
            </CardContent>
          </Card>
          <EnrolmentCard studentId={studentId} orgId={orgId} canManage={caps.canManageClasses} />
          <GuardianCard studentId={studentId} orgId={orgId} canManage={caps.canManageGuardians} canCreateParent={perms["parent.manage"]} />
        </>
      )}
    </StudentShell>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return <div><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{value || "—"}</dd></div>;
}

function EnrolmentCard({ studentId, orgId, canManage }: { studentId: string; orgId: string | null; canManage: boolean }) {
  const qc = useQueryClient();
  const enrolments = useQuery({ queryKey: ["students", "enrolments", studentId], queryFn: () => listEnrolments(studentId), retry: false });
  const sessions = useQuery({ queryKey: ["students", "sessions"], queryFn: listSessions, retry: false, enabled: canManage });
  const classes = useQuery({ queryKey: ["students", "classes", "all"], queryFn: () => listClasses(), retry: false, enabled: canManage });
  const [classId, setClassId] = useState("");
  const done = (msg: string) => { toast.success(msg); setClassId(""); qc.invalidateQueries({ queryKey: ["students"] }); };

  const assign = useMutation({
    mutationFn: () => { const c = classes.data!.find((x) => x.id === classId)!; return assignClass(orgId!, studentId, c); },
    onSuccess: () => done("Class assigned"),
    onError: (e) => toast.error(describeStudentError(e)),
  });
  const withdraw = useMutation({ mutationFn: withdrawEnrolment, onSuccess: () => done("Enrolment withdrawn"), onError: (e) => toast.error(describeStudentError(e)) });

  const sessionName = (id: string) => { const s = sessions.data?.find((x) => x.id === id); return s ? `${s.name} · ${s.term}` : ""; };
  const active = (enrolments.data ?? []).filter((e) => e.status === "active");
  const history = (enrolments.data ?? []).filter((e) => e.status !== "active");

  return (
    <Card>
      <CardHeader><CardTitle>Class & academic session</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        {enrolments.isLoading && <p className="text-muted-foreground">Loading enrolments…</p>}
        {enrolments.error && <StudentError error={enrolments.error} />}
        {enrolments.data && active.length === 0 && <p className="text-muted-foreground">Not currently assigned to a class.</p>}
        {active.map((e) => (
          <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3">
            <div>
              <p className="font-medium">{e.classes?.name ?? "Class"}</p>
              <p className="text-muted-foreground">{e.academic_sessions ? `${e.academic_sessions.name} · ${e.academic_sessions.term}` : ""} · since {e.enrolled_on}</p>
            </div>
            {canManage && <Button variant="outline" size="sm" disabled={withdraw.isPending} onClick={() => withdraw.mutate(e.id)}>Withdraw</Button>}
          </div>
        ))}
        {canManage && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-60 flex-1">
              <Label>Assign or transfer to class</Label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger><SelectValue placeholder={classes.data?.length === 0 ? "No classes exist yet" : "Choose a class"} /></SelectTrigger>
                <SelectContent>{(classes.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name} {sessionName(c.academic_session_id) && `(${sessionName(c.academic_session_id)})`}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button disabled={!classId || !orgId || assign.isPending} onClick={() => assign.mutate()}>{assign.isPending ? "Assigning…" : "Assign"}</Button>
          </div>
        )}
        {history.length > 0 && (
          <div>
            <p className="mb-1 font-medium">History</p>
            <ul className="space-y-1 text-muted-foreground">
              {history.map((e) => <li key={e.id}>{e.classes?.name} · {e.academic_sessions?.name} {e.academic_sessions?.term} · {e.status} ({e.enrolled_on} – {e.ended_on ?? "…"})</li>)}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const EMPTY_GUARDIAN: GuardianInput = { fullName: "", phone: "", email: "", whatsapp: "", relationship: "guardian", isPrimary: false };

function GuardianCard({ studentId, orgId, canManage, canCreateParent }: { studentId: string; orgId: string | null; canManage: boolean; canCreateParent: boolean }) {
  const qc = useQueryClient();
  const guardians = useQuery({ queryKey: ["students", "guardians", studentId], queryFn: () => listGuardians(studentId), retry: false });
  const [g, setG] = useState<GuardianInput>(EMPTY_GUARDIAN);
  const [errors, setErrors] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const done = (msg: string) => { toast.success(msg); qc.invalidateQueries({ queryKey: ["students", "guardians", studentId] }); };
  const fail = (e: unknown) => toast.error(describeStudentError(e));

  const add = useMutation({ mutationFn: () => addGuardian(orgId!, studentId, g), onSuccess: () => { done("Guardian linked"); setG(EMPTY_GUARDIAN); setOpen(false); }, onError: fail });
  const primary = useMutation({ mutationFn: (id: string) => setPrimaryGuardian(studentId, id), onSuccess: () => done("Primary guardian updated"), onError: fail });
  const unlink = useMutation({ mutationFn: unlinkGuardian, onSuccess: () => done("Guardian unlinked"), onError: fail });
  const set = (k: keyof GuardianInput) => (e: React.ChangeEvent<HTMLInputElement>) => setG({ ...g, [k]: e.target.value });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Guardians</CardTitle>
        {canManage && canCreateParent && !open && <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Add guardian</Button>}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {guardians.isLoading && <p className="text-muted-foreground">Loading guardians…</p>}
        {guardians.error && <StudentError error={guardians.error} />}
        {guardians.data?.length === 0 && <p className="text-muted-foreground">No guardians linked.</p>}
        {guardians.data?.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3">
            <div>
              <p className="font-medium">{l.parents?.full_name ?? "Guardian"} <span className="text-muted-foreground">· {RELATIONSHIP_LABEL[l.relationship] ?? l.relationship}</span> {l.is_primary && <Badge className="ml-1">Primary</Badge>}</p>
              <p className="text-muted-foreground">{[l.parents?.phone, l.parents?.email, l.parents?.whatsapp && `WhatsApp ${l.parents.whatsapp}`].filter(Boolean).join(" · ") || "No contact details"}</p>
            </div>
            {canManage && (
              <div className="flex gap-2">
                {!l.is_primary && <Button variant="outline" size="sm" disabled={primary.isPending} onClick={() => primary.mutate(l.id)}>Make primary</Button>}
                <Button variant="outline" size="sm" disabled={unlink.isPending} onClick={() => { if (confirm("Unlink this guardian from the student?")) unlink.mutate(l.id); }}>Unlink</Button>
              </div>
            )}
          </div>
        ))}
        {canManage && !canCreateParent && <p className="text-muted-foreground">Adding new guardians requires the parent.manage permission.</p>}
        {open && (
          <form className="space-y-3 rounded-md border border-border p-3" onSubmit={(e) => { e.preventDefault(); const errs = validateGuardian(g); setErrors(errs); if (!errs.length) add.mutate(); }}>
            <FormErrors errors={errors} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor="gn">Full name *</Label><Input id="gn" value={g.fullName} onChange={set("fullName")} maxLength={150} /></div>
              <div>
                <Label>Relationship</Label>
                <Select value={g.relationship} onValueChange={(v) => setG({ ...g, relationship: v as GuardianInput["relationship"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RELATIONSHIPS.map((r) => <SelectItem key={r} value={r}>{RELATIONSHIP_LABEL[r]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label htmlFor="gp">Phone</Label><Input id="gp" value={g.phone} onChange={set("phone")} maxLength={20} /></div>
              <div><Label htmlFor="ge">Email</Label><Input id="ge" type="email" value={g.email} onChange={set("email")} maxLength={200} /></div>
              <div><Label htmlFor="gw">WhatsApp</Label><Input id="gw" value={g.whatsapp} onChange={set("whatsapp")} maxLength={20} /></div>
              <label className="flex items-center gap-2 pt-6"><Checkbox checked={g.isPrimary} onCheckedChange={(c) => setG({ ...g, isPrimary: c === true })} /> Primary contact</label>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={add.isPending || !orgId}>{add.isPending ? "Saving…" : "Link guardian"}</Button>
              <Button type="button" variant="outline" onClick={() => { setOpen(false); setErrors([]); }}>Cancel</Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
