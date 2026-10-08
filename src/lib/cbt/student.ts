import { supabase } from "@/integrations/supabase/client";

// CBT Student Taking layer (Gate 8C Phase 2) over the Rev6 SECURITY DEFINER RPCs.
// The database owns the attempt lifecycle, deadline, layout, answer validation,
// scoring and results. This module only calls RPCs: it never writes the attempts,
// responses or results tables, never reads answer keys, and never scores.
// Student identity and organisation come from current_student_id()/current_org_id()
// in the database (session + organisation header set centrally by AuthProvider) — never from the caller.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap<T = any>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

export interface AvailableExam {
  exam_id: string;
  title: string;
  kind: string;
  subject_name: string | null;
  opens_at: string;
  closes_at: string;
  duration_min: number;
  attempts_allowed: number;
  attempts_used: number;
  open_attempt_id: string | null;
}

export interface PaperOption { key: string; text: string }
export interface PaperQuestion {
  exam_question_id: string;
  position: number;
  type: string;
  stem: string;
  stem_media: unknown;
  marks: number;
  options: PaperOption[] | null;
}
export type Answer = { selected: string[] } | { text: string };
export type Paper =
  | { status: "in_progress"; attempt_id: string; deadline_at: string; server_now: string; exam: { title: string; instructions: string | null; duration_min: number; total_marks: number }; questions: PaperQuestion[]; answers: Record<string, Answer> }
  | { status: "submitted" | "auto_submitted" | "voided" };

export interface StudentResult {
  exam_id: string; exam_title: string; kind: string; attempt_no: number; score: number; total_marks: number;
  percentage: number; grade: string | null; passed: boolean | null; position_in_class: number | null; released_at: string | null; is_official: boolean;
}

export const OBJECTIVE_TYPES = ["mcq", "multi_select", "true_false"] as const;

/** Student CBT access: exam.take and a linked student record, as reported by the DB. UX only. */
export async function fetchStudentAccess(): Promise<{ canTake: boolean; studentId: string | null }> {
  const [p, s] = await Promise.all([db.rpc("has_permission", { perm: "exam.take" }), db.rpc("current_student_id")]);
  return { canTake: unwrap(p) === true, studentId: (unwrap(s) as string | null) ?? null };
}

export async function listAvailableExams(): Promise<AvailableExam[]> {
  return (unwrap(await db.rpc("available_exams")) ?? []) as AvailableExam[];
}

/** Starts or resumes (the DB returns the open attempt if one exists). */
export async function startOrResumeAttempt(examId: string): Promise<string> {
  return unwrap(await db.rpc("start_attempt", { p_exam_id: examId })) as string;
}

export async function getPaper(attemptId: string): Promise<Paper> {
  return unwrap(await db.rpc("get_attempt_paper", { p_attempt_id: attemptId })) as Paper;
}

export type SaveOutcome = "saved" | "expired";
export async function saveAnswer(attemptId: string, examQuestionId: string, answer: Answer | null, flagged = false): Promise<SaveOutcome> {
  return unwrap(await db.rpc("save_response", { p_attempt_id: attemptId, p_exam_question_id: examQuestionId, p_answer: answer, p_flagged: flagged })) as SaveOutcome;
}

export async function submitAttempt(attemptId: string): Promise<{ status: string; result: { score: number; total_marks: number; percentage: number; grade: string | null; passed: boolean | null } | null }> {
  return unwrap(await db.rpc("submit_attempt", { p_attempt_id: attemptId }));
}

/** Only released results; student_id is the DB's current_student_id(), never typed by the user. */
export async function listMyResults(studentId: string): Promise<StudentResult[]> {
  return ((unwrap(await db.rpc("results_for_student", { p_student_id: studentId })) ?? []) as StudentResult[]).filter((r) => r.released_at);
}

/** Answer payload in the shape the DB scorer reads: {selected:[keys]} or {text}. */
export function toAnswer(type: string, value: string[] | string): Answer | null {
  if ((OBJECTIVE_TYPES as readonly string[]).includes(type)) {
    const sel = (Array.isArray(value) ? value : [value]).filter(Boolean);
    return sel.length ? { selected: [...new Set(sel)] } : null;
  }
  const t = Array.isArray(value) ? value.join(" ") : value;
  return t.trim() ? { text: t.slice(0, 10000) } : null;
}

/** Display-only countdown, anchored to the server clock so a wrong device clock cannot extend it. */
export function remainingMs(deadlineAt: string, serverNow: string, clientAtFetch: number, clientNow: number): number {
  const offset = Date.parse(serverNow) - clientAtFetch;
  return Math.max(0, Date.parse(deadlineAt) - (clientNow + offset));
}

export function fmtCountdown(ms: number): string {
  const s = Math.ceil(ms / 1000), m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Retry delays for unsaved answers: 1s, 2s, 4s … capped at 15s. */
export function retryDelay(attempt: number): number {
  return Math.min(15000, 1000 * 2 ** Math.max(0, attempt));
}

const pendingKey = (attemptId: string) => `aibinu.cbt.pending.${attemptId}`;
/** Local backup of answers not yet confirmed by the server (resilience only; the server copy is authoritative). */
export function readPending(attemptId: string): Record<string, Answer | null> {
  try { return JSON.parse(localStorage.getItem(pendingKey(attemptId)) ?? "{}"); } catch { return {}; }
}
export function writePending(attemptId: string, pending: Record<string, Answer | null>) {
  try {
    if (Object.keys(pending).length) localStorage.setItem(pendingKey(attemptId), JSON.stringify(pending));
    else localStorage.removeItem(pendingKey(attemptId));
  } catch { /* backup only */ }
}

export function describeStudentError(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  if (/row-level security|permission denied/i.test(m)) return "You do not have permission to do this.";
  return m;
}
