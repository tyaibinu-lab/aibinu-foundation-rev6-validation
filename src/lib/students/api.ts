import { supabase } from "@/integrations/supabase/client";
import {
  EMPTY_STUDENT_PERMISSIONS,
  sanitizeSearch,
  STUDENT_PERMISSIONS,
  type Gender,
  type GuardianInput,
  type PersonStatus,
  type Relationship,
  type StudentInput,
  type StudentPermissionMap,
} from "./permissions";

// Browser client with the publishable key only. Organisation scope comes from the
// x-organisation-id header owned by AuthProvider and is re-validated by RLS
// (current_org_id() + has_permission). Nothing here bypasses the database.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const PAGE_SIZE = 20;

export interface StudentRow {
  id: string;
  organisation_id: string;
  admission_no: string | null;
  full_name: string;
  date_of_birth: string | null;
  gender: Gender;
  phone: string | null;
  email: string | null;
  status: PersonStatus;
  updated_at: string;
}
export interface GuardianLink {
  id: string;
  relationship: Relationship;
  is_primary: boolean;
  parents: { id: string; full_name: string; phone: string | null; email: string | null; whatsapp: string | null } | null;
}
export interface SessionRow { id: string; name: string; term: string; is_current: boolean; starts_on: string; ends_on: string }
export interface ClassRow { id: string; name: string; academic_session_id: string; capacity: number | null }
export interface EnrolmentRow {
  id: string;
  class_id: string;
  academic_session_id: string;
  status: "active" | "completed" | "withdrawn" | "transferred";
  enrolled_on: string;
  ended_on: string | null;
  classes: { name: string } | null;
  academic_sessions: { name: string; term: string } | null;
}
export interface RosterRow { student_id: string; admission_no: string | null; full_name: string; class_id: string; class_name: string }

const STUDENT_COLS = "id,organisation_id,admission_no,full_name,date_of_birth,gender,phone,email,status,updated_at";

function unwrap<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}
const blank = (s: string) => (s.trim() === "" ? null : s.trim());

export async function fetchStudentPermissions(): Promise<StudentPermissionMap> {
  const out = { ...EMPTY_STUDENT_PERMISSIONS };
  await Promise.all(
    STUDENT_PERMISSIONS.map(async (perm) => {
      const res = await db.rpc("has_permission", { perm });
      if (res.error) throw res.error;
      out[perm] = res.data === true;
    }),
  );
  return out;
}

export async function currentOrgId(): Promise<string | null> {
  return unwrap<string | null>(await db.rpc("current_org_id")) ?? null;
}

export interface StudentFilters { search?: string; status?: PersonStatus | "all"; classId?: string | undefined; page?: number }

export async function listStudents(f: StudentFilters): Promise<{ rows: StudentRow[]; total: number }> {
  const page = Math.max(0, f.page ?? 0);
  const cols = f.classId ? `${STUDENT_COLS},enrolments!inner(class_id,status)` : STUDENT_COLS;
  let q = db.from("students").select(cols, { count: "exact" }).is("deleted_at", null);
  if (f.status && f.status !== "all") q = q.eq("status", f.status);
  if (f.classId) q = q.eq("enrolments.class_id", f.classId).eq("enrolments.status", "active");
  const s = sanitizeSearch(f.search ?? "");
  if (s) q = q.or(`full_name.ilike.*${s}*,admission_no.ilike.*${s}*`);
  const res = await q.order("full_name").range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
  if (res.error) throw res.error;
  return { rows: (res.data ?? []) as StudentRow[], total: res.count ?? 0 };
}

export async function getStudent(id: string): Promise<StudentRow> {
  return unwrap(await db.from("students").select(STUDENT_COLS).eq("id", id).is("deleted_at", null).single());
}

function studentPayload(i: StudentInput) {
  return {
    admission_no: blank(i.admissionNo),
    full_name: i.fullName.trim(),
    date_of_birth: i.dateOfBirth || null,
    gender: i.gender,
    phone: blank(i.phone),
    email: blank(i.email),
    status: i.status,
  };
}

/** organisation_id must equal current_org_id(); the students_write WITH CHECK enforces it. */
export async function createStudent(orgId: string, i: StudentInput): Promise<StudentRow> {
  return unwrap(await db.from("students").insert({ organisation_id: orgId, ...studentPayload(i) }).select(STUDENT_COLS).single());
}

/** Never sends organisation_id or user_id: tenant and login links are not editable here. */
export async function updateStudent(id: string, i: StudentInput): Promise<StudentRow> {
  return unwrap(await db.from("students").update(studentPayload(i)).eq("id", id).select(STUDENT_COLS).single());
}

export async function listGuardians(studentId: string): Promise<GuardianLink[]> {
  return unwrap(
    await db
      .from("student_parents")
      .select("id,relationship,is_primary,parents(id,full_name,phone,email,whatsapp)")
      .eq("student_id", studentId)
      .order("is_primary", { ascending: false }),
  ) ?? [];
}

async function clearPrimary(studentId: string) {
  unwrap(await db.from("student_parents").update({ is_primary: false }).eq("student_id", studentId).eq("is_primary", true));
}

/** Creates a parent (needs parent.manage) then links it (needs student.manage). */
export async function addGuardian(orgId: string, studentId: string, g: GuardianInput): Promise<void> {
  const parent = unwrap<{ id: string }>(
    await db
      .from("parents")
      .insert({ organisation_id: orgId, full_name: g.fullName.trim(), phone: blank(g.phone), email: blank(g.email), whatsapp: blank(g.whatsapp) })
      .select("id")
      .single(),
  );
  if (g.isPrimary) await clearPrimary(studentId);
  unwrap(
    await db
      .from("student_parents")
      .insert({ organisation_id: orgId, student_id: studentId, parent_id: parent.id, relationship: g.relationship, is_primary: g.isPrimary }),
  );
}

export async function setPrimaryGuardian(studentId: string, linkId: string): Promise<void> {
  await clearPrimary(studentId);
  unwrap(await db.from("student_parents").update({ is_primary: true }).eq("id", linkId));
}

/** Removes the link only; the parent record is kept. */
export async function unlinkGuardian(linkId: string): Promise<void> {
  unwrap(await db.from("student_parents").delete().eq("id", linkId));
}

export async function listSessions(): Promise<SessionRow[]> {
  return unwrap(await db.from("academic_sessions").select("id,name,term,is_current,starts_on,ends_on").order("starts_on", { ascending: false })) ?? [];
}

export async function listClasses(sessionId?: string): Promise<ClassRow[]> {
  let q = db.from("classes").select("id,name,academic_session_id,capacity");
  if (sessionId) q = q.eq("academic_session_id", sessionId);
  return unwrap(await q.order("name")) ?? [];
}

export async function listEnrolments(studentId: string): Promise<EnrolmentRow[]> {
  return unwrap(
    await db
      .from("enrolments")
      .select("id,class_id,academic_session_id,status,enrolled_on,ended_on,classes(name),academic_sessions(name,term)")
      .eq("student_id", studentId)
      .order("enrolled_on", { ascending: false }),
  ) ?? [];
}

export async function getRoster(classId: string): Promise<RosterRow[]> {
  return unwrap(
    await db.from("class_roster").select("student_id,admission_no,full_name,class_id,class_name").eq("class_id", classId).order("full_name"),
  ) ?? [];
}

/**
 * Assigns a class for the class's academic session. An existing active enrolment in
 * that session is closed as 'transferred' first, because uq_one_active_enrolment
 * allows only one. Requires class.manage (enrolments_write).
 */
export async function assignClass(orgId: string, studentId: string, cls: ClassRow): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const current = unwrap<{ id: string; class_id: string }[]>(
    await db
      .from("enrolments")
      .select("id,class_id")
      .eq("student_id", studentId)
      .eq("academic_session_id", cls.academic_session_id)
      .eq("status", "active"),
  ) ?? [];
  if (current.some((e) => e.class_id === cls.id)) throw new Error("The student is already in this class.");
  for (const e of current) unwrap(await db.from("enrolments").update({ status: "transferred", ended_on: today }).eq("id", e.id));
  unwrap(
    await db.from("enrolments").insert({
      organisation_id: orgId,
      student_id: studentId,
      class_id: cls.id,
      academic_session_id: cls.academic_session_id,
      status: "active",
      enrolled_on: today,
    }),
  );
}

export async function withdrawEnrolment(enrolmentId: string): Promise<void> {
  unwrap(await db.from("enrolments").update({ status: "withdrawn", ended_on: new Date().toISOString().slice(0, 10) }).eq("id", enrolmentId));
}
