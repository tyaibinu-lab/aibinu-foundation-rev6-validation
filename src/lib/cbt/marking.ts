import { supabase } from "@/integrations/supabase/client";

// CBT Manual Marking layer (Gate 8E) over the Rev6 contract.
// - Responses are read through RLS (responses_read → current_org_id() + staff_can_view_results).
// - Marks are written ONLY through mark_response(p_response_id, p_marks, p_feedback), which checks
//   result.mark, tenant, staff_can_view_results, attempt not in progress, and 0..max marks, then
//   re-scores the attempt server-side. This module never writes responses/results,
//   never sets correctness, marker or marking status, and never computes scores or totals.
// - Answer keys are never selected; markers see the stem, the student's answer and max marks.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap<T = any>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

export async function canMark(): Promise<boolean> {
  return unwrap(await db.rpc("has_permission", { perm: "result.mark" })) === true;
}

export interface MarkingItem {
  responseId: string; examQuestionId: string; position: number; maxMarks: number; stem: string; type: string;
  studentAnswer: unknown; markingStatus: string; marksAwarded: number | null; feedback: string | null; markedAt: string | null;
}

export async function listAttemptResponses(attemptId: string): Promise<MarkingItem[]> {
  const rows = (unwrap(await db.from("responses").select("id,exam_question_id,answer,marking_status,marks_awarded,feedback,marked_at").eq("attempt_id", attemptId)) ?? []) as
    { id: string; exam_question_id: string; answer: unknown; marking_status: string; marks_awarded: number | null; feedback: string | null; marked_at: string | null }[];
  if (!rows.length) return [];
  const eqs = (unwrap(await db.from("exam_questions").select("id,position,marks,question_version_id").in("id", rows.map((r) => r.exam_question_id))) ?? []) as { id: string; position: number; marks: number; question_version_id: string }[];
  const vs = eqs.length ? ((unwrap(await db.from("question_versions").select("id,stem,question_id").in("id", eqs.map((e) => e.question_version_id))) ?? []) as { id: string; stem: string; question_id: string }[]) : [];
  const qs = vs.length ? ((unwrap(await db.from("questions").select("id,type").in("id", vs.map((v) => v.question_id))) ?? []) as { id: string; type: string }[]) : [];
  return rows
    .map((r) => {
      const eq = eqs.find((e) => e.id === r.exam_question_id);
      const v = vs.find((x) => x.id === eq?.question_version_id);
      return {
        responseId: r.id, examQuestionId: r.exam_question_id, position: eq?.position ?? 0, maxMarks: Number(eq?.marks ?? 0),
        stem: v?.stem ?? "", type: qs.find((q) => q.id === v?.question_id)?.type ?? "",
        studentAnswer: r.answer, markingStatus: r.marking_status, marksAwarded: r.marks_awarded === null ? null : Number(r.marks_awarded),
        feedback: r.feedback, markedAt: r.marked_at,
      };
    })
    .sort((a, b) => a.position - b.position);
}

/** UX validation only; mark_response re-checks the range against exam_questions.marks. */
export function validateMarks(marks: number, max: number): string | null {
  if (!Number.isFinite(marks)) return "Enter a number of marks.";
  if (marks < 0 || marks > max) return `Marks must be between 0 and ${max}.`;
  return null;
}

export async function markResponse(responseId: string, marks: number, feedback: string): Promise<void> {
  unwrap(await db.rpc("mark_response", { p_response_id: responseId, p_marks: marks, p_feedback: feedback.trim() || null }));
}

export function describeMarkingError(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  if (/row-level security|permission denied/i.test(m)) return "You do not have permission to mark this in the active organisation.";
  return m;
}
