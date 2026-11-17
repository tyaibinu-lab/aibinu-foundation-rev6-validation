import { supabase } from "@/integrations/supabase/client";

// AI drafting layer over the Rev6 AI governance contract (migration 008 + Gate 11 M1–M6b).
// - Requests ONLY enqueue jobs through the governed request functions (request_ai_note,
//   request_ai_questions, request_ai_student_review, request_ai_diagnosis_explanation,
//   request_ai_report_comment). The database checks ai.use + the authoring permission, the
//   kill switch, plan/agent, model, active prompt, daily and monthly limits, reserves credits,
//   and may hold the job for approval (status 'awaiting_approval').
// - The browser never calls an AI provider and never sees a prompt template or API key.
//   A trusted server worker (service_role only) claims and completes each job;
//   that worker is a separate, not-yet-approved gate, so jobs stay queued until it exists.
// - Outputs are always drafts: notes/questions land as draft versions in the NoteBank /
//   Question Bank review workflow; diagnosis narratives and report comments are suggestions a
//   teacher accepts or discards. Nothing here publishes anything.
// - Each button press sends a fresh idempotency key so a retry can never double-charge.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap<T = any>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

export function newIdempotencyKey(): string {
  return `ui:${globalThis.crypto.randomUUID()}`;
}

// ---------- access (UX only) ----------

export interface AiAccess { use: boolean; manage: boolean; notesWrite: boolean; questionsWrite: boolean; cas: boolean }
export async function fetchAiAccess(): Promise<AiAccess> {
  const perms = ["ai.use", "ai.manage", "academic.notes.write", "academic.questions.write", "cas.manage"];
  const r = await Promise.all(perms.map((perm) => db.rpc("has_permission", { perm })));
  const [use, manage, notesWrite, questionsWrite, cas] = r.map((x) => unwrap(x) === true);
  return { use: !!use, manage: !!manage, notesWrite: !!notesWrite, questionsWrite: !!questionsWrite, cas: !!cas };
}

// ---------- requests ----------

export const NOTE_STYLES = ["exam_focused", "simple_explanation", "revision_summary", "worked_examples"] as const;
export type NoteStyle = (typeof NOTE_STYLES)[number];
export const QUESTION_TYPES = ["mcq", "multi_select", "true_false", "fill_blank", "short_answer", "theory"] as const;
export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export const COGNITIVE = ["recall", "understand", "apply", "analyse", "evaluate"] as const;

export interface NoteRequest { topicId: string; style: NoteStyle; instructions?: string }
export interface QuestionRequest {
  topicId: string; count: number; type: (typeof QUESTION_TYPES)[number];
  difficulty: (typeof DIFFICULTIES)[number]; cognitive: (typeof COGNITIVE)[number]; instructions?: string;
}

export function validateInstructions(text?: string): string[] {
  return (text?.length ?? 0) > 1000 ? ["Instructions are too long (1000 characters max)."] : [];
}
export function validateQuestionRequest(r: QuestionRequest): string[] {
  const e = validateInstructions(r.instructions);
  if (!r.topicId) e.push("Choose a topic.");
  // The database enforces the real per-plan batch cap (ai_max_batch, at most 20).
  if (!Number.isInteger(r.count) || r.count < 1 || r.count > 20) e.push("Ask for between 1 and 20 questions.");
  return e;
}

export async function requestAiNote(r: NoteRequest, key = newIdempotencyKey()): Promise<string> {
  return unwrap(await db.rpc("request_ai_note", {
    p_topic_id: r.topicId, p_style: r.style, p_instructions: r.instructions?.trim() || null, p_idempotency_key: key,
  })) as string;
}
export async function requestAiQuestions(r: QuestionRequest, key = newIdempotencyKey()): Promise<string> {
  return unwrap(await db.rpc("request_ai_questions", {
    p_topic_id: r.topicId, p_count: r.count, p_type: r.type, p_difficulty: r.difficulty, p_cognitive: r.cognitive,
    p_instructions: r.instructions?.trim() || null, p_idempotency_key: key,
  })) as string;
}
export async function requestStudentReview(studentId: string, key = newIdempotencyKey()): Promise<string> {
  return unwrap(await db.rpc("request_ai_student_review", { p_student_id: studentId, p_idempotency_key: key })) as string;
}
/** The database builds its own idempotency key from the diagnosis, so repeated clicks reuse one job. */
export async function requestDiagnosisExplanation(diagnosisId: string): Promise<string> {
  return unwrap(await db.rpc("request_ai_diagnosis_explanation", { p_diagnosis_id: diagnosisId })) as string;
}
export async function requestReportComment(reportId: string): Promise<string> {
  return unwrap(await db.rpc("request_ai_report_comment", { p_report_id: reportId })) as string;
}

// ---------- jobs ----------

export type JobStatus = "awaiting_approval" | "queued" | "running" | "succeeded" | "failed" | "cancelled" | "expired" | "rejected";
export interface JobRow {
  id: string; type: string; status: JobStatus; input: Record<string, unknown>; target_type: string | null; target_id: string | null;
  student_id: string | null; requested_by: string | null; created_at: string; finished_at: string | null; error: string | null;
  result_summary: Record<string, unknown> | null; estimated_credits: number | null; consumed_credits: number | null;
  approval_required: boolean; cancel_reason: string | null;
}
const JOB_COLS = "id,type,status,input,target_type,target_id,student_id,requested_by,created_at,finished_at,error,result_summary,estimated_credits,consumed_credits,approval_required,cancel_reason";

/** RLS: your own jobs, or every job in the organisation with ai.manage. */
export async function listJobs(status?: JobStatus): Promise<JobRow[]> {
  let q = db.from("ai_jobs").select(JOB_COLS);
  if (status) q = q.eq("status", status);
  return unwrap(await q.order("created_at", { ascending: false }).limit(200)) ?? [];
}
export const OPEN_STATUSES: JobStatus[] = ["awaiting_approval", "queued", "running"];
export async function cancelJob(id: string, reason?: string): Promise<void> {
  unwrap(await db.rpc("cancel_ai_job", { p_job_id: id, p_reason: reason?.trim() || null }));
}
/** ai.manage only, and never your own request (the database enforces both). */
export async function decideJob(id: string, approve: boolean, reason?: string): Promise<void> {
  unwrap(await db.rpc("approve_ai_job", { p_job_id: id, p_approve: approve, p_reason: reason?.trim() || null }));
}

// ---------- drafts produced ----------

export interface DraftLink { aiContentId: string; kind: string; createdAt: string; noteId?: string; questionId?: string }
/** Your AI drafts still waiting for review, resolved to NoteBank / Question Bank items. */
export async function listMyDrafts(): Promise<DraftLink[]> {
  const rows = (unwrap(await db.from("my_ai_drafts").select("ai_content_id,kind,target_type,target_id,created_at").order("created_at", { ascending: false }).limit(100)) ?? []) as
    { ai_content_id: string; kind: string; target_type: string | null; target_id: string | null; created_at: string }[];
  const nv = rows.filter((r) => r.target_type === "note_version" && r.target_id).map((r) => r.target_id!);
  const qv = rows.filter((r) => r.target_type === "question_version" && r.target_id).map((r) => r.target_id!);
  const [n, q] = await Promise.all([
    nv.length ? db.from("note_versions").select("id,note_id").in("id", nv) : Promise.resolve({ data: [], error: null }),
    qv.length ? db.from("question_versions").select("id,question_id").in("id", qv) : Promise.resolve({ data: [], error: null }),
  ]);
  const notes = (unwrap(n) ?? []) as { id: string; note_id: string }[];
  const qs = (unwrap(q) ?? []) as { id: string; question_id: string }[];
  return rows.map((r) => ({
    aiContentId: r.ai_content_id, kind: r.kind, createdAt: r.created_at,
    noteId: notes.find((x) => x.id === r.target_id)?.note_id, questionId: qs.find((x) => x.id === r.target_id)?.question_id,
  }));
}

// ---------- suggestions for CAS ----------

export interface Suggestion { id: string; kind: "diagnosis_narrative" | "report_comment"; target_id: string; text: string; created_at: string }
export async function listSuggestions(kind: Suggestion["kind"], targetIds: string[]): Promise<Suggestion[]> {
  if (!targetIds.length) return [];
  const rows = (unwrap(await db.from("ai_content").select("id,kind,target_id,payload,created_at").eq("kind", kind).eq("status", "draft_created").in("target_id", targetIds).order("created_at", { ascending: false })) ?? []) as
    { id: string; kind: Suggestion["kind"]; target_id: string; payload: { narrative?: string; comment?: string }; created_at: string }[];
  return rows.map((r) => ({ id: r.id, kind: r.kind, target_id: r.target_id, created_at: r.created_at, text: (r.payload?.narrative ?? r.payload?.comment ?? "").toString() }));
}
/** Accept (optionally edited) or discard an AI explanation of a diagnosis (M6b F1 review step). */
export async function reviewDiagnosisNarrative(contentId: string, accept: boolean, editedText?: string): Promise<void> {
  unwrap(await db.rpc("review_ai_diagnosis_narrative", { p_content_id: contentId, p_accept: accept, p_edited_text: editedText?.trim() || null }));
}

export interface StudentReview { id: string; student_id: string; summary: string; findings: Record<string, unknown>; review_state: string; created_at: string }
export async function listStudentReviews(studentId: string): Promise<StudentReview[]> {
  return unwrap(await db.from("ai_diagnostics").select("id,student_id,summary,findings,review_state,created_at").eq("student_id", studentId).order("created_at", { ascending: false }).limit(10)) ?? [];
}
export async function reviewStudentReview(id: string, accept: boolean): Promise<void> {
  unwrap(await db.rpc("review_ai_diagnostic", { p_id: id, p_accept: accept }));
}

// ---------- usage ----------

export interface CreditBalance { available: number; consumed: number; held: number }
/**
 * Organisation balance. Only meaningful for ai.manage: for everyone else RLS limits the
 * ledger to their own rows, so callers must not show this to non-managers.
 */
export async function getCreditBalance(): Promise<CreditBalance | null> {
  const r = unwrap(await db.from("ai_credit_balance").select("available,consumed,held").maybeSingle()) as CreditBalance | null;
  return r ? { available: Number(r.available), consumed: Number(r.consumed), held: Number(r.held) } : null;
}
export interface UsageRow { type: string; jobs: number; failed: number; cost_usd: number }
export async function getUsageThisMonth(): Promise<UsageRow[]> {
  return unwrap(await db.from("ai_usage_this_month").select("type,jobs,failed,cost_usd")) ?? [];
}

// ---------- topics ----------

export interface TopicPick { id: string; code: string; title: string; class_level: string | null }
export async function listTopics(): Promise<TopicPick[]> {
  return unwrap(await db.from("curriculum_topics").select("id,code,title,class_level").order("code").limit(1000)) ?? [];
}

// ---------- errors ----------

const AI_ERRORS: Record<string, string> = {
  ai_disabled: "AI drafting is switched off for this school (or platform-wide). An administrator can turn it on.",
  agent_disabled: "This kind of AI request is not included in the school's AI plan.",
  agent_not_found: "This kind of AI request is not set up yet.",
  no_ai_plan: "The school does not have an AI plan yet.",
  batch_cap_exceeded: "That is more items than the school's AI plan allows in one request.",
  model_unavailable: "No approved AI model is available right now.",
  no_active_prompt: "This request type has no approved prompt yet.",
  limit_exceeded: "An AI usage limit has been reached. Try again later or ask an administrator.",
  insufficient_credits: "The school has run out of AI credits.",
  invalid_state: "This job can no longer be changed.",
  job_not_found: "Job not found.",
  permission_denied: "You do not have permission to do this. (You cannot approve your own request.)",
};
export function describeAiError(e: unknown): string {
  const err = e as { message?: string; details?: string };
  const m = err?.message ?? String(e);
  if (AI_ERRORS[m]) return AI_ERRORS[m] + (err.details ? ` (${err.details})` : "");
  if (/row-level security|permission denied for (table|view|function)/i.test(m)) return "You do not have permission to do this in the active organisation.";
  return m.replace(/^Permission denied: /, "Permission needed: ");
}
