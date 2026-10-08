import { supabase } from "@/integrations/supabase/client";

// CBT Results & Release layer (Gate 8D) over the Rev6 contract.
// - Staff read results through RLS (results_read → staff_can_view_results: result.read_all or
//   result.read_class for the student's class teacher). Read-only: this module never writes
//   results/attempts/responses and never computes scores — score, grade, passed, position and
//   released_at are displayed exactly as the database stored them.
// - Release goes ONLY through release_results(p_exam_id, p_force) (result.release, current_org_id()).
// - Students see released results only, and answer review only through my_attempt_review,
//   which itself requires allow_review and a released result. Answer data is shown only from
//   that RPC's response after release; it is never fetched anywhere else.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap<T = any>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

export interface ResultAccess { readAll: boolean; readClass: boolean; release: boolean }

/** UX only — RLS and release_results re-check every permission in the database. */
export async function fetchResultAccess(): Promise<ResultAccess> {
  const [a, c, r] = await Promise.all(
    ["result.read_all", "result.read_class", "result.release"].map((perm) => db.rpc("has_permission", { perm })),
  );
  return { readAll: unwrap(a) === true, readClass: unwrap(c) === true, release: unwrap(r) === true };
}

export interface StaffResultRow {
  id: string; attempt_id: string; exam_id: string; student_id: string; class_id: string | null;
  score: number; total_marks: number; percentage: number; grade: string | null; passed: boolean | null;
  marking_complete: boolean; position_in_class: number | null; released_at: string | null; computed_at: string | null;
  studentName: string | null; attemptNo: number | null; attemptStatus: string | null; submittedAt: string | null;
}

const RESULT_COLS = "id,attempt_id,exam_id,student_id,class_id,score,total_marks,percentage,grade,passed,marking_complete,position_in_class,released_at,computed_at";

export interface ExamResultSummary {
  examId: string; title: string; status: string; releasePolicy: string; allowReview: boolean;
  total: number; released: number; pendingMarking: number;
}

/** Exams with results visible to the caller under RLS. Counts only — no scoring. */
export async function listResultSummaries(): Promise<ExamResultSummary[]> {
  const rows = (unwrap(await db.from("results").select("exam_id,marking_complete,released_at")) ?? []) as { exam_id: string; marking_complete: boolean; released_at: string | null }[];
  const ids = [...new Set(rows.map((r) => r.exam_id))];
  if (!ids.length) return [];
  const exams = (unwrap(await db.from("exams").select("id,title,status,release_policy,allow_review").in("id", ids)) ?? []) as { id: string; title: string; status: string; release_policy: string; allow_review: boolean }[];
  return ids.map((id) => {
    const e = exams.find((x) => x.id === id);
    const rs = rows.filter((r) => r.exam_id === id);
    return {
      examId: id, title: e?.title ?? "Exam", status: e?.status ?? "", releasePolicy: e?.release_policy ?? "", allowReview: !!e?.allow_review,
      total: rs.length, released: rs.filter((r) => r.released_at).length, pendingMarking: rs.filter((r) => !r.marking_complete).length,
    };
  });
}

export async function listExamResults(examId: string): Promise<StaffResultRow[]> {
  const rows = (unwrap(await db.from("results").select(RESULT_COLS).eq("exam_id", examId).order("computed_at", { ascending: true })) ?? []) as Omit<StaffResultRow, "studentName" | "attemptNo" | "attemptStatus" | "submittedAt">[];
  if (!rows.length) return [];
  const [st, at] = await Promise.all([
    db.from("students").select("id,full_name").in("id", [...new Set(rows.map((r) => r.student_id))]),
    db.from("attempts").select("id,attempt_no,status,submitted_at").in("id", rows.map((r) => r.attempt_id)),
  ]);
  const students = (unwrap(st) ?? []) as { id: string; full_name: string }[];
  const attempts = (unwrap(at) ?? []) as { id: string; attempt_no: number; status: string; submitted_at: string | null }[];
  return rows.map((r) => {
    const a = attempts.find((x) => x.id === r.attempt_id);
    return {
      ...r,
      studentName: students.find((s) => s.id === r.student_id)?.full_name ?? null,
      attemptNo: a?.attempt_no ?? null, attemptStatus: a?.status ?? null, submittedAt: a?.submitted_at ?? null,
    };
  });
}

/** Releases through the Rev6 function only. Returns the number of results the DB released. */
export async function releaseResults(examId: string, force = false): Promise<number> {
  return Number(unwrap(await db.rpc("release_results", { p_exam_id: examId, p_force: force })) ?? 0);
}

// ---------- Student review ----------

export interface MyAttempt { id: string; attempt_no: number; status: string; submitted_at: string | null }

/** The signed-in student's own attempts for one exam; RLS limits rows to current_student_id(). */
export async function listMyAttemptsForExam(examId: string, studentId: string): Promise<MyAttempt[]> {
  return ((unwrap(await db.from("attempts").select("id,attempt_no,status,submitted_at").eq("exam_id", examId).eq("student_id", studentId).order("attempt_no")) ?? []) as MyAttempt[]);
}

export interface ReviewItem {
  position: number; type: string; stem: string; stem_media: unknown;
  options: { key: string; text: string }[] | null; your_answer: unknown; is_correct: boolean | null;
  marks_awarded: number | null; marks: number; explanation: string | null; feedback: string | null;
}

/** DB enforces: own attempt, current org, allow_review, and a released result. */
export async function getMyAttemptReview(attemptId: string): Promise<ReviewItem[]> {
  return ((unwrap(await db.rpc("my_attempt_review", { p_attempt_id: attemptId })) ?? []) as ReviewItem[]);
}

export function selectedKeys(answer: unknown): string[] {
  const a = answer as { selected?: unknown } | null;
  return Array.isArray(a?.selected) ? (a!.selected as unknown[]).map(String) : [];
}
export function answerText(answer: unknown): string | null {
  const a = answer as { text?: unknown } | null;
  return typeof a?.text === "string" ? a.text : null;
}

export function describeResultError(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  if (/row-level security|permission denied/i.test(m)) return "You do not have permission to do this in the active organisation.";
  if (/still need marking/i.test(m)) return `${m}.`;
  return m;
}
