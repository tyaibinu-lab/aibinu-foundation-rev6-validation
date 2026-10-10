// Authoritative Rev6 student-management permission codes (migration 001 catalogue).
// PostgreSQL RLS (students_*, parents_*, student_parents_*, enrolments_*) decides
// every action; everything here is UX only.
export const STUDENT_PERMISSIONS = ["student.read", "student.manage", "parent.manage", "class.manage"] as const;
export type StudentPermission = (typeof STUDENT_PERMISSIONS)[number];
export type StudentPermissionMap = Record<StudentPermission, boolean>;

export const EMPTY_STUDENT_PERMISSIONS: StudentPermissionMap = {
  "student.read": false,
  "student.manage": false,
  "parent.manage": false,
  "class.manage": false,
};

export const GENDERS = ["female", "male", "other", "undisclosed"] as const;
export type Gender = (typeof GENDERS)[number];
export const PERSON_STATUSES = ["active", "inactive", "graduated", "withdrawn"] as const;
export type PersonStatus = (typeof PERSON_STATUSES)[number];
export const RELATIONSHIPS = ["mother", "father", "guardian", "sponsor"] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

export interface StudentCapabilities {
  canRead: boolean;
  canManageStudents: boolean;
  canManageGuardians: boolean;
  canManageClasses: boolean;
}

/** Mirrors the RLS policies: linking needs student.manage; creating a parent row also needs parent.manage. */
export function studentCapabilities(p: StudentPermissionMap): StudentCapabilities {
  return {
    canRead: p["student.read"] || p["student.manage"],
    canManageStudents: p["student.manage"],
    canManageGuardians: p["student.manage"],
    canManageClasses: p["class.manage"],
  };
}

export interface StudentInput {
  admissionNo: string;
  fullName: string;
  dateOfBirth: string;
  gender: Gender;
  phone: string;
  email: string;
  status: PersonStatus;
}

export interface GuardianInput {
  fullName: string;
  phone: string;
  email: string;
  whatsapp: string;
  relationship: Relationship;
  isPrimary: boolean;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9 ()-]{7,20}$/;

/** Client-side validation for fast feedback only; the database constraints remain authoritative. */
export function validateStudent(i: StudentInput, today = new Date()): string[] {
  const e: string[] = [];
  const name = i.fullName.trim();
  if (name.length < 2) e.push("Full name must have at least 2 characters.");
  if (name.length > 150) e.push("Full name must be 150 characters or fewer.");
  if (i.admissionNo.trim().length > 40) e.push("Admission number must be 40 characters or fewer.");
  if (i.admissionNo.trim() && !/^[A-Za-z0-9/_.-]+$/.test(i.admissionNo.trim()))
    e.push("Admission number may only contain letters, numbers and / _ . -");
  if (i.email.trim() && !EMAIL.test(i.email.trim())) e.push("Email address is not valid.");
  if (i.phone.trim() && !PHONE.test(i.phone.trim())) e.push("Phone number is not valid.");
  if (i.dateOfBirth) {
    const d = new Date(i.dateOfBirth);
    if (Number.isNaN(d.getTime())) e.push("Date of birth is not valid.");
    else if (d > today) e.push("Date of birth cannot be in the future.");
  }
  if (!GENDERS.includes(i.gender)) e.push("Choose a valid gender option.");
  if (!PERSON_STATUSES.includes(i.status)) e.push("Choose a valid status.");
  return e;
}

export function validateGuardian(i: GuardianInput): string[] {
  const e: string[] = [];
  if (i.fullName.trim().length < 2) e.push("Guardian name must have at least 2 characters.");
  if (i.fullName.trim().length > 150) e.push("Guardian name must be 150 characters or fewer.");
  if (!i.phone.trim() && !i.email.trim()) e.push("Provide a phone number or email for the guardian.");
  if (i.email.trim() && !EMAIL.test(i.email.trim())) e.push("Guardian email is not valid.");
  if (i.phone.trim() && !PHONE.test(i.phone.trim())) e.push("Guardian phone number is not valid.");
  if (i.whatsapp.trim() && !PHONE.test(i.whatsapp.trim())) e.push("WhatsApp number is not valid.");
  if (!RELATIONSHIPS.includes(i.relationship)) e.push("Choose a valid relationship.");
  return e;
}

/** Strip characters that would alter a PostgREST or() filter expression. */
export function sanitizeSearch(s: string): string {
  return s.replace(/[,()*%\\:"']/g, " ").trim().slice(0, 80);
}

export function describeStudentError(err: unknown): string {
  const raw =
    err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : String(err ?? "Unknown error");
  const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
  if (code === "23505" || /duplicate key/i.test(raw)) {
    if (/admission_no/.test(raw)) return "Another student in this organisation already has that admission number.";
    if (/uq_one_primary_parent/.test(raw)) return "This student already has a primary guardian.";
    if (/student_parents_student_id_parent_id/.test(raw)) return "This guardian is already linked to the student.";
    if (/uq_one_active_enrolment/.test(raw)) return "The student already has an active class for this academic session.";
    return "This record already exists.";
  }
  if (code === "23503") return "A linked record (class, session or guardian) was not found in your organisation.";
  if (code === "23514") return "One of the values is not allowed.";
  if (code === "22P02" || code === "22007" || code === "22008") return "One of the values has an invalid format.";
  if (code === "42501" || /row-level security|permission denied/i.test(raw))
    return "You don't have permission for this action in the current organisation.";
  if (code === "PGRST116") return "Record not found in your organisation.";
  if (/JWT|not authenticated/i.test(raw)) return "Please sign in to continue.";
  return raw;
}

export const GENDER_LABEL: Record<Gender, string> = { female: "Female", male: "Male", other: "Other", undisclosed: "Not stated" };
export const STATUS_LABEL: Record<PersonStatus, string> = { active: "Active", inactive: "Inactive", graduated: "Graduated", withdrawn: "Withdrawn" };
export const RELATIONSHIP_LABEL: Record<Relationship, string> = { mother: "Mother", father: "Father", guardian: "Guardian", sponsor: "Sponsor" };
