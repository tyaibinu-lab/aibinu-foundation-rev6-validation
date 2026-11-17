import { supabase } from "@/integrations/supabase/client";

// CAS (Continuous Assessment / Academic Intelligence) layer over the Rev6 migration 007 contract.
// - Mastery, evidence and diagnoses are calculated ONLY by the database (triggers on responses
//   and results). This module never computes mastery, scores or grades; it displays what
//   learning_dashboard() and the security_invoker views return.
// - Staff visibility is staff_can_view_results (result.read_all, or the student's form/subject
//   teacher). Families see released results only, through learning_dashboard(), their own
//   assigned tasks, and reports whose status is 'sent'.
// - Every write is a SECURITY DEFINER function that re-checks cas.manage and student scope:
//   assign_intervention, add_intervention, set_intervention_status, dismiss_diagnosis,
//   draft_parent_report, draft_parent_reports_for_class, approve_parent_report, mark_report_sent.
//   Families tick off reading/practice tasks only through mark_intervention_done.
// - No table is written directly, and organisation_id is never sent.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap<T = any>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

// ---------- access (UX only) ----------

export interface CasAccess { manage: boolean; readAll: boolean; readClass: boolean; staff: boolean }
export async function fetchCasAccess(): Promise<CasAccess> {
  const [m, a, c] = await Promise.all(["cas.manage", "result.read_all", "result.read_class"].map((perm) => db.rpc("has_permission", { perm })));
  const manage = unwrap(m) === true, readAll = unwrap(a) === true, readClass = unwrap(c) === true;
  return { manage, readAll, readClass, staff: readAll || readClass };
}

// ---------- dashboard ----------

export interface DashTopic { topic_key: string; topic: string | null; subject: string | null; mastery: number | null; confidence: number | null; level: string; previous: number | null; change: number | null; last_assessed_at: string | null }
export interface DashSubject { subject: string; average_mastery: number | null; topics: number; weak_topics: number }
export interface DashAssessment { exam: string; kind: string; percentage: number; grade: string | null; marking_complete: boolean; date: string }
export interface DashTask { id: string; type: InterventionType; title: string; status: InterventionStatus; due_on: string | null; note_id: string | null }
export interface DashDiagnosis { id: string; kind: string; severity: "low" | "medium" | "high"; finding: string; raised_at: string }
export interface LearningDashboard {
  student: { id: string; name: string; admission_no: string | null };
  view: "staff" | "family"; generated_at: string;
  subjects: DashSubject[]; topics: DashTopic[]; recent_assessments: DashAssessment[]; tasks: DashTask[]; open_diagnoses: DashDiagnosis[];
}

/** No id = the signed-in student. Staff and linked parents pass a student id; the DB decides the view. */
export async function getLearningDashboard(studentId?: string): Promise<LearningDashboard> {
  return unwrap(await db.rpc("learning_dashboard", { p_student_id: studentId ?? null })) as LearningDashboard;
}

/** Students the caller may open: their own record or linked children for families; RLS decides. */
export interface LearnerPick { id: string; full_name: string; admission_no: string | null }
export async function listMyLearners(): Promise<LearnerPick[]> {
  return unwrap(await db.from("students").select("id,full_name,admission_no").is("deleted_at", null).order("full_name").limit(50)) ?? [];
}

// ---------- class view ----------

export interface ClassPick { id: string; name: string }
export async function listClasses(): Promise<ClassPick[]> {
  return unwrap(await db.from("classes").select("id,name").order("name")) ?? [];
}
export interface ClassTopicRow { topic_key: string; topic_title: string | null; students_assessed: number; avg_mastery: number; students_weak: number }
/** Weakest topics first. Rows exist only for students the caller may see (RLS on topic_mastery). */
export async function getClassMastery(classId: string): Promise<ClassTopicRow[]> {
  return unwrap(await db.from("class_mastery_summary").select("topic_key,topic_title,students_assessed,avg_mastery,students_weak").eq("class_id", classId).order("avg_mastery", { ascending: true }).limit(100)) ?? [];
}
export interface RosterRow { student_id: string; full_name: string; admission_no: string | null }
export async function getClassRoster(classId: string): Promise<RosterRow[]> {
  return unwrap(await db.from("class_roster").select("student_id,full_name,admission_no").eq("class_id", classId).order("full_name")) ?? [];
}

// ---------- interventions ----------

export type InterventionType = "note" | "practice" | "teacher_action" | "parent_message" | "remedial_class";
export const INTERVENTION_TYPES: InterventionType[] = ["note", "practice", "teacher_action", "parent_message", "remedial_class"];
export type InterventionStatus = "suggested" | "assigned" | "in_progress" | "completed" | "cancelled";

export interface BoardRow { intervention_id: string; student_id: string; student_name: string; type: InterventionType; title: string; status: InterventionStatus; due_on: string | null; is_overdue: boolean; diagnosis_kind: string | null; severity: string | null }
export async function listInterventionBoard(): Promise<BoardRow[]> {
  return unwrap(await db.from("intervention_board").select("intervention_id,student_id,student_name,type,title,status,due_on,is_overdue,diagnosis_kind,severity").order("due_on", { ascending: true, nullsFirst: false }).limit(300)) ?? [];
}
export async function assignIntervention(id: string, dueOn?: string): Promise<void> {
  unwrap(await db.rpc("assign_intervention", { p_intervention_id: id, p_due_on: dueOn || null, p_assignee: null }));
}
export async function setInterventionStatus(id: string, status: Exclude<InterventionStatus, "suggested">): Promise<void> {
  unwrap(await db.rpc("set_intervention_status", { p_intervention_id: id, p_status: status }));
}
export interface NewIntervention { studentId: string; topicKey: string; type: InterventionType; title: string; description?: string; dueOn?: string }
export function validateIntervention(i: NewIntervention): string[] {
  const e: string[] = [];
  if (!i.topicKey) e.push("Choose a topic.");
  if (!INTERVENTION_TYPES.includes(i.type)) e.push("Choose a support type.");
  if (i.title.trim().length < 3) e.push("Give the task a short title.");
  return e;
}
export async function addIntervention(i: NewIntervention): Promise<string> {
  return unwrap(await db.rpc("add_intervention", {
    p_student_id: i.studentId, p_topic_key: i.topicKey, p_type: i.type, p_title: i.title.trim(),
    p_description: i.description?.trim() || null, p_note_id: null, p_due_on: i.dueOn || null,
  })) as string;
}
/** Student/parent ticks off a reading or practice task. */
export async function markTaskDone(id: string): Promise<void> {
  unwrap(await db.rpc("mark_intervention_done", { p_intervention_id: id }));
}
export async function dismissDiagnosis(id: string, reason: string): Promise<void> {
  unwrap(await db.rpc("dismiss_diagnosis", { p_diagnosis_id: id, p_reason: reason.trim() }));
}

// ---------- parent reports ----------

export type ReportStatus = "draft" | "approved" | "sent";
export interface ReportContent {
  period: { from: string; to: string };
  assessments: { exam: string; kind: string; percentage: number; grade: string | null; date: string }[];
  average_percentage: number | null;
  strengths: { topic: string; mastery: number }[];
  focus_areas: { topic: string; mastery: number }[];
  support_tasks: { title: string; status: string }[];
  teacher_comment: string | null;
}
export interface ReportRow {
  id: string; student_id: string; period_start: string; period_end: string; title: string; content: ReportContent;
  status: ReportStatus; approved_at: string | null; sent_via: string | null; sent_at: string | null; created_at: string; studentName?: string | null;
}
const REPORT_COLS = "id,student_id,period_start,period_end,title,content,status,approved_at,sent_via,sent_at,created_at";

export async function listReports(status?: ReportStatus): Promise<ReportRow[]> {
  let q = db.from("parent_reports").select(REPORT_COLS);
  if (status) q = q.eq("status", status);
  const rows = (unwrap(await q.order("created_at", { ascending: false }).limit(300)) ?? []) as ReportRow[];
  if (!rows.length) return [];
  const st = (unwrap(await db.from("students").select("id,full_name").in("id", [...new Set(rows.map((r) => r.student_id))])) ?? []) as { id: string; full_name: string }[];
  return rows.map((r) => ({ ...r, studentName: st.find((s) => s.id === r.student_id)?.full_name ?? null }));
}
export function validatePeriod(from: string, to: string): string[] {
  const e: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) e.push("Choose both dates.");
  else if (from > to) e.push("The start date must be on or before the end date.");
  return e;
}
/** Returns null when a report for that student and period already exists. */
export async function draftReport(studentId: string, from: string, to: string, title?: string): Promise<string | null> {
  return unwrap(await db.rpc("draft_parent_report", { p_student_id: studentId, p_from: from, p_to: to, p_title: title?.trim() || null })) as string | null;
}
export async function draftReportsForClass(classId: string, from: string, to: string): Promise<number> {
  return Number(unwrap(await db.rpc("draft_parent_reports_for_class", { p_class_id: classId, p_from: from, p_to: to })) ?? 0);
}
/**
 * Approves a draft. Only the teacher comment is editable here: the rest of the content is
 * passed back exactly as the database built it from released results.
 */
export function withTeacherComment(content: ReportContent, comment: string): ReportContent {
  return { ...content, teacher_comment: comment.trim() || null };
}
export async function approveReport(id: string, content: ReportContent, comment: string): Promise<void> {
  unwrap(await db.rpc("approve_parent_report", { p_report_id: id, p_content: withTeacherComment(content, comment) }));
}
export const REPORT_CHANNELS = ["whatsapp", "sms", "email", "print"] as const;
export type ReportChannel = (typeof REPORT_CHANNELS)[number];
/** Call after the report has actually gone out. */
export async function markReportSent(id: string, channel: ReportChannel): Promise<void> {
  unwrap(await db.rpc("mark_report_sent", { p_report_id: id, p_channel: channel }));
}

// ---------- display helpers (no calculation) ----------

export const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${Math.round(Number(v) * 100)}%`);
/** Badge tone for the database's mastery_level() labels (weak / developing / proficient / mastered / insufficient_data). */
export function levelTone(level: string): "default" | "secondary" | "destructive" | "outline" {
  if (level === "mastered" || level === "proficient") return "default";
  if (level === "weak") return "destructive";
  if (level === "insufficient_data") return "outline";
  return "secondary";
}

export function describeCasError(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  if (/row-level security|permission denied for (table|view|function)/i.test(m)) return "You do not have permission to do this in the active organisation.";
  if (/No student record is linked/i.test(m)) return "Your account is not linked to a student record yet. Ask the school office.";
  if (/^Not allowed$/i.test(m)) return "You cannot view this learner's progress.";
  return m.replace(/^Permission denied: /, "Permission needed: ");
}
