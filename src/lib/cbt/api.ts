import { supabase } from "@/integrations/supabase/client";
import { QV_TO_QUESTION_FK } from "@/lib/questionbank/api";

// CBT Exam Administration data layer (Gate 8C Phase 1) over the Rev6 contract.
// PostgreSQL is authoritative: RLS (exam.create + current_org_id()), triggers
// (published-only versions, draft-only edits, total_marks sync, status guard)
// and SECURITY DEFINER lifecycle RPCs publish_exam / close_exam.
// This module never writes status, total_marks, created_by or marks, never
// reads answer keys/options, and never scores, marks or finalises attempts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export { QV_TO_QUESTION_FK };

export type ExamKind = "test" | "exam" | "practice" | "mock";
export type ExamStatus = "draft" | "published" | "closed" | "archived";
export type AttemptPolicy = "best" | "latest" | "first";
export type ReleasePolicy = "manual" | "immediate" | "after_close";

export const EXAM_KINDS: ExamKind[] = ["test", "exam", "practice", "mock"];
export const ATTEMPT_POLICIES: AttemptPolicy[] = ["best", "latest", "first"];
export const RELEASE_POLICIES: ReleasePolicy[] = ["manual", "immediate", "after_close"];

/** Columns the client may set on a draft. Lifecycle/derived columns are excluded on purpose. */
export const EXAM_PROTECTED_FIELDS = ["status", "total_marks", "created_by"] as const;

export interface ExamRow {
  id: string;
  organisation_id: string;
  title: string;
  kind: ExamKind;
  subject_id: string | null;
  academic_session_id: string | null;
  instructions: string | null;
  status: ExamStatus;
  opens_at: string;
  closes_at: string;
  duration_min: number;
  hard_close: boolean;
  attempts_allowed: number;
  attempt_policy: AttemptPolicy;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  pass_mark_pct: number;
  release_policy: ReleasePolicy;
  allow_review: boolean;
  requires_fees_cleared: boolean;
  total_marks: number;
  created_at: string;
}

export interface ExamDraftInput {
  title: string;
  kind: ExamKind;
  subjectId: string | null;
  academicSessionId: string | null;
  instructions: string;
  opensAt: string; // ISO
  closesAt: string; // ISO
  durationMin: number;
  hardClose: boolean;
  attemptsAllowed: number;
  attemptPolicy: AttemptPolicy;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  passMarkPct: number;
  releasePolicy: ReleasePolicy;
  allowReview: boolean;
  requiresFeesCleared: boolean;
}

/** UX validation only; the database re-checks on insert and on publish_exam. */
export function validateExamDraft(i: ExamDraftInput): string[] {
  const e: string[] = [];
  if (!i.title.trim()) e.push("Title is required.");
  if (!EXAM_KINDS.includes(i.kind)) e.push("Choose a valid exam type.");
  const o = Date.parse(i.opensAt), c = Date.parse(i.closesAt);
  if (Number.isNaN(o)) e.push("Opening time is required.");
  if (Number.isNaN(c)) e.push("Closing time is required.");
  if (!Number.isNaN(o) && !Number.isNaN(c) && c <= o) e.push("Closing time must be after opening time.");
  if (!Number.isInteger(i.durationMin) || i.durationMin < 1) e.push("Duration must be at least 1 minute.");
  if (!Number.isInteger(i.attemptsAllowed) || i.attemptsAllowed < 1) e.push("Attempts allowed must be at least 1.");
  if (!(i.passMarkPct >= 0 && i.passMarkPct <= 100)) e.push("Pass mark must be between 0 and 100.");
  return e;
}

/** Insert payload. organisation_id comes from the DB (current_org_id()), never from the caller. */
export function toExamInsert(i: ExamDraftInput, dbOrgId: string) {
  return {
    organisation_id: dbOrgId,
    title: i.title.trim(),
    kind: i.kind,
    subject_id: i.subjectId,
    academic_session_id: i.academicSessionId,
    instructions: i.instructions.trim() || null,
    opens_at: i.opensAt,
    closes_at: i.closesAt,
    duration_min: i.durationMin,
    hard_close: i.hardClose,
    attempts_allowed: i.attemptsAllowed,
    attempt_policy: i.attemptPolicy,
    shuffle_questions: i.shuffleQuestions,
    shuffle_options: i.shuffleOptions,
    pass_mark_pct: i.passMarkPct,
    release_policy: i.releasePolicy,
    allow_review: i.allowReview,
    requires_fees_cleared: i.requiresFeesCleared,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap<T = any>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

/** Active organisation as validated by PostgreSQL. Throws if there is no valid tenant context. */
async function dbOrgId(): Promise<string> {
  const org = unwrap(await db.rpc("current_org_id")) as string | null;
  if (!org) throw new Error("No active organisation context. Please choose an organisation and try again.");
  return org;
}

export async function canCreateExams(): Promise<boolean> {
  return unwrap(await db.rpc("has_permission", { perm: "exam.create" })) === true;
}

const EXAM_COLS =
  "id,organisation_id,title,kind,subject_id,academic_session_id,instructions,status,opens_at,closes_at,duration_min,hard_close,attempts_allowed,attempt_policy,shuffle_questions,shuffle_options,pass_mark_pct,release_policy,allow_review,requires_fees_cleared,total_marks,created_at";

export interface ExamListItem extends ExamRow { questionCount: number; eligibilityCount: number }

export async function listExams(): Promise<ExamListItem[]> {
  const exams = unwrap(await db.from("exams").select(EXAM_COLS).is("deleted_at", null).order("created_at", { ascending: false })) as ExamRow[];
  if (!exams?.length) return [];
  const ids = exams.map((x) => x.id);
  const [eq, el] = await Promise.all([
    db.from("exam_questions").select("exam_id").in("exam_id", ids),
    db.from("exam_eligibility").select("exam_id").in("exam_id", ids),
  ]);
  const qs = (unwrap(eq) ?? []) as { exam_id: string }[];
  const es = (unwrap(el) ?? []) as { exam_id: string }[];
  return exams.map((x) => ({
    ...x,
    questionCount: qs.filter((r) => r.exam_id === x.id).length,
    eligibilityCount: es.filter((r) => r.exam_id === x.id).length,
  }));
}

export async function getExam(id: string): Promise<ExamRow | null> {
  return unwrap(await db.from("exams").select(EXAM_COLS).eq("id", id).maybeSingle()) as ExamRow | null;
}

export async function createExamDraft(input: ExamDraftInput): Promise<{ id: string }> {
  const errors = validateExamDraft(input);
  if (errors.length) throw new Error(errors.join(" "));
  const org = await dbOrgId();
  return unwrap(await db.from("exams").insert(toExamInsert(input, org)).select("id").single());
}

/** Editable draft settings only; the DB rejects status/total_marks changes from clients. */
export async function updateExamDraft(id: string, input: ExamDraftInput): Promise<void> {
  const errors = validateExamDraft(input);
  if (errors.length) throw new Error(errors.join(" "));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { organisation_id, ...rest } = toExamInsert(input, "");
  unwrap(await db.from("exams").update(rest).eq("id", id).eq("status", "draft"));
}

export interface PublishedVersionOption {
  versionId: string;
  questionId: string;
  stem: string;
  marks: number;
  difficulty: string;
  cognitiveLevel: string;
  type: string;
  topicId: string;
}

/** Published question versions only. Answer keys, options and explanations are never selected. */
export async function listPublishedVersions(): Promise<PublishedVersionOption[]> {
  const rows = unwrap(
    await db
      .from("question_versions")
      .select(`id,question_id,stem,marks,difficulty,cognitive_level,status,${QV_TO_QUESTION_FK}(type,topic_id)`)
      .eq("status", "published")
      .order("created_at", { ascending: false }),
  ) as { id: string; question_id: string; stem: string; marks: number; difficulty: string; cognitive_level: string; status: string; questions: { type: string; topic_id: string } | null }[];
  return (rows ?? [])
    .filter((r) => r.status === "published")
    .map((r) => ({
      versionId: r.id,
      questionId: r.question_id,
      stem: r.stem,
      marks: Number(r.marks),
      difficulty: r.difficulty,
      cognitiveLevel: r.cognitive_level,
      type: r.questions?.type ?? "",
      topicId: r.questions?.topic_id ?? "",
    }));
}

export interface ExamQuestionItem { id: string; questionVersionId: string; position: number; marks: number; stem: string; questionId: string | null }

export async function listExamQuestions(examId: string): Promise<ExamQuestionItem[]> {
  const rows = unwrap(await db.from("exam_questions").select("id,question_version_id,position,marks").eq("exam_id", examId).order("position", { ascending: true })) as { id: string; question_version_id: string; position: number; marks: number }[];
  if (!rows?.length) return [];
  const vs = unwrap(await db.from("question_versions").select("id,question_id,stem").in("id", rows.map((r) => r.question_version_id))) as { id: string; question_id: string; stem: string }[];
  return rows.map((r) => {
    const v = (vs ?? []).find((x) => x.id === r.question_version_id);
    return { id: r.id, questionVersionId: r.question_version_id, position: r.position, marks: Number(r.marks ?? 0), stem: v?.stem ?? "", questionId: v?.question_id ?? null };
  });
}

/** Pins the exact published version. Marks/topic are copied by the DB trigger, not the client. */
export async function addExamQuestion(examId: string, questionVersionId: string, position: number): Promise<void> {
  const org = await dbOrgId();
  unwrap(await db.from("exam_questions").insert({ organisation_id: org, exam_id: examId, question_version_id: questionVersionId, position }));
}

export async function removeExamQuestion(examQuestionId: string): Promise<void> {
  unwrap(await db.from("exam_questions").delete().eq("id", examQuestionId));
}

export interface EligibilityItem { id: string; classId: string | null; studentId: string | null; isBlocked: boolean; className: string | null }

export async function listEligibility(examId: string): Promise<EligibilityItem[]> {
  const rows = unwrap(await db.from("exam_eligibility").select("id,class_id,student_id,is_blocked").eq("exam_id", examId)) as { id: string; class_id: string | null; student_id: string | null; is_blocked: boolean }[];
  const classes = await listClasses();
  return (rows ?? []).map((r) => ({ id: r.id, classId: r.class_id, studentId: r.student_id, isBlocked: r.is_blocked, className: classes.find((c) => c.id === r.class_id)?.name ?? null }));
}

/** Class-level eligibility row per the Rev6 contract: class_id set, student_id null. */
export async function addClassEligibility(examId: string, classId: string, existing: EligibilityItem[]): Promise<void> {
  if (existing.some((e) => e.classId === classId && !e.studentId)) throw new Error("This class is already eligible for the exam.");
  const org = await dbOrgId();
  unwrap(await db.from("exam_eligibility").insert({ organisation_id: org, exam_id: examId, class_id: classId, student_id: null }));
}

export async function removeEligibility(id: string): Promise<void> {
  unwrap(await db.from("exam_eligibility").delete().eq("id", id));
}

export async function publishExam(examId: string): Promise<void> {
  unwrap(await db.rpc("publish_exam", { p_exam_id: examId }));
}

export async function closeExam(examId: string): Promise<void> {
  unwrap(await db.rpc("close_exam", { p_exam_id: examId }));
}

export interface NamedOption { id: string; name: string }

export async function listClasses(): Promise<NamedOption[]> {
  return ((unwrap(await db.from("classes").select("id,name").order("name")) ?? []) as NamedOption[]);
}
export async function listSubjects(): Promise<NamedOption[]> {
  return ((unwrap(await db.from("subjects").select("id,name").order("name")) ?? []) as NamedOption[]);
}
export async function listSessions(): Promise<(NamedOption & { term: string | null; is_current: boolean })[]> {
  return (unwrap(await db.from("academic_sessions").select("id,name,term,is_current").order("starts_on", { ascending: false })) ?? []);
}

export function describeCbtError(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  if (/row-level security|permission denied/i.test(m)) return "You do not have permission to do this in the active organisation.";
  if (/uq_eligibility_class|uq_eligibility_student/.test(m)) return "This class or student is already eligible for the exam.";
  return m;
}
