import { supabase } from "@/integrations/supabase/client";
import {
  EMPTY_QUESTION_PERMISSIONS,
  QUESTION_PERMISSIONS,
  type CognitiveLevel,
  type ContentSource,
  type ContentStatus,
  type ContentVisibility,
  type Difficulty,
  type QuestionOption,
  type QuestionPermissionMap,
  type QuestionType,
  type ReviewDecision,
} from "./permissions";

// Question Bank data layer over the Rev6 contract. All authorization stays in
// PostgreSQL (RLS, has_permission, SECURITY DEFINER functions, triggers).
// The client never writes status, current_version_id, version_no or publications.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Explicit FK for question_versions -> questions. Required: there are two relationships (PGRST201). */
export const QV_TO_QUESTION_FK = "questions!question_versions_question_id_organisation_id_fkey";

export interface QuestionRow {
  id: string;
  organisation_id: string;
  topic_id: string;
  type: QuestionType;
  status: ContentStatus;
  source: ContentSource;
  current_version_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
export interface QuestionVersionRow {
  id: string;
  organisation_id: string;
  question_id: string;
  version_no: number | null;
  status: ContentStatus;
  stem: string;
  options: QuestionOption[] | null;
  answer_key: unknown;
  explanation: string | null;
  marks: number;
  difficulty: Difficulty;
  cognitive_level: CognitiveLevel;
  created_by: string | null;
  created_at: string;
}
export interface QuestionReviewRow {
  id: string;
  question_version_id: string;
  reviewer_id: string;
  decision: ReviewDecision;
  comments: string | null;
  reviewed_at: string;
}
export interface QuestionPublicationRow {
  id: string;
  question_version_id: string;
  visibility: ContentVisibility;
  published_by: string | null;
  published_at: string;
  unpublished_at: string | null;
}
/** Row of the security_invoker view question_current (RLS of the base tables applies). */
export interface QuestionCurrentRow {
  organisation_id: string;
  question_id: string;
  topic_id: string;
  type: QuestionType;
  question_status: ContentStatus;
  version_id: string | null;
  version_no: number | null;
  version_status: ContentStatus | null;
  stem: string | null;
  marks: number | null;
  difficulty: Difficulty | null;
  cognitive_level: CognitiveLevel | null;
}
export interface TopicOption {
  id: string;
  title: string;
  code: string;
  subjectId: string | null;
  subjectName: string;
}

function unwrap<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

export async function fetchQuestionPermissions(): Promise<QuestionPermissionMap> {
  const out: QuestionPermissionMap = { ...EMPTY_QUESTION_PERMISSIONS };
  await Promise.all(
    QUESTION_PERMISSIONS.map(async (perm) => {
      out[perm] = unwrap(await db.rpc("has_permission", { perm })) === true;
    }),
  );
  return out;
}

export async function currentContext(): Promise<{ userId: string | null; orgId: string | null }> {
  const [u, o] = await Promise.all([db.rpc("current_user_id"), db.rpc("current_org_id")]);
  return { userId: unwrap(u) ?? null, orgId: unwrap(o) ?? null };
}

export interface QuestionFilters {
  search?: string;
  topicIds?: string[];
  type?: QuestionType;
  difficulty?: Difficulty;
  status?: ContentStatus;
}

/** Latest/current version per question via question_current (no answer keys in this view). */
export async function listQuestions(f: QuestionFilters = {}): Promise<QuestionCurrentRow[]> {
  let q = db.from("question_current").select("*");
  if (f.search?.trim()) q = q.ilike("stem", `%${f.search.trim().replace(/[%_]/g, "")}%`);
  if (f.topicIds) q = q.in("topic_id", f.topicIds);
  if (f.type) q = q.eq("type", f.type);
  if (f.difficulty) q = q.eq("difficulty", f.difficulty);
  if (f.status) q = q.eq("version_status", f.status);
  return unwrap(await q.limit(500)) ?? [];
}

/** Topics with their subject, resolved through the curriculum chain (all RLS-scoped). */
export async function listTopicOptions(): Promise<TopicOption[]> {
  const [topics, versions, curricula, subjects] = await Promise.all([
    db.from("curriculum_topics").select("id,title,code,version_id").order("position").limit(1000),
    db.from("curriculum_versions").select("id,curriculum_id").limit(1000),
    db.from("curricula").select("id,subject_id").limit(1000),
    db.from("subjects").select("id,name").limit(1000),
  ]);
  const vMap = new Map<string, string>((unwrap(versions) ?? []).map((v: { id: string; curriculum_id: string }) => [v.id, v.curriculum_id]));
  const cMap = new Map<string, string>((unwrap(curricula) ?? []).map((c: { id: string; subject_id: string }) => [c.id, c.subject_id]));
  const sMap = new Map<string, string>((unwrap(subjects) ?? []).map((s: { id: string; name: string }) => [s.id, s.name]));
  return (unwrap(topics) ?? []).map((t: { id: string; title: string; code: string; version_id: string }) => {
    const subjectId = cMap.get(vMap.get(t.version_id) ?? "") ?? null;
    return { id: t.id, title: t.title, code: t.code, subjectId, subjectName: (subjectId && sMap.get(subjectId)) || "Unknown subject" };
  });
}

/** Review / publish queues. Uses the explicit FK name to avoid PGRST201. */
export async function listQuestionVersionsByStatus(
  status: ContentStatus,
): Promise<(QuestionVersionRow & { questions: Pick<QuestionRow, "id" | "type" | "topic_id" | "source"> | null })[]> {
  return (
    unwrap(
      await db
        .from("question_versions")
        .select(`*, ${QV_TO_QUESTION_FK}(id,type,topic_id,source)`)
        .eq("status", status)
        .order("created_at", { ascending: false }),
    ) ?? []
  );
}

export async function getQuestion(questionId: string) {
  const question: QuestionRow = unwrap(await db.from("questions").select("*").eq("id", questionId).single());
  const versions: QuestionVersionRow[] =
    unwrap(await db.from("question_versions").select("*").eq("question_id", questionId).order("version_no", { ascending: false })) ?? [];
  const ids = versions.map((v) => v.id);
  const [reviews, publications] = ids.length
    ? await Promise.all([
        db.from("question_reviews").select("*").in("question_version_id", ids).order("reviewed_at", { ascending: false }),
        db.from("question_publications").select("*").eq("question_id", questionId).order("published_at", { ascending: false }),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  return {
    question,
    versions,
    reviews: (unwrap(reviews) ?? []) as QuestionReviewRow[],
    publications: (unwrap(publications) ?? []) as QuestionPublicationRow[],
  };
}

export type VersionPayload = {
  stem: string;
  options: QuestionOption[] | null;
  answer_key: unknown;
  explanation: string | null;
  marks: number;
  difficulty: Difficulty;
  cognitive_level: CognitiveLevel;
};

/**
 * Manual authoring path. Provenance is fixed by the pathway ('manual'), never chosen
 * by the teacher. AI drafts are created only by the server-side AI pathway (source 'ai').
 */
export async function createQuestion(input: { orgId: string; userId: string; topicId: string; type: QuestionType; version: VersionPayload }) {
  const question: QuestionRow = unwrap(
    await db
      .from("questions")
      .insert({ organisation_id: input.orgId, topic_id: input.topicId, type: input.type, source: "manual", created_by: input.userId })
      .select()
      .single(),
  );
  await createQuestionVersion({ orgId: input.orgId, userId: input.userId, questionId: question.id, version: input.version });
  return question;
}

/** New draft version (used after changes are requested on a locked version, or to revise a published one). */
export async function createQuestionVersion(input: { orgId: string; userId: string; questionId: string; version: VersionPayload }) {
  return unwrap(
    await db
      .from("question_versions")
      .insert({ organisation_id: input.orgId, question_id: input.questionId, created_by: input.userId, ...input.version })
      .select()
      .single(),
  ) as QuestionVersionRow;
}

/** Edit a draft. RLS allows drafts only and trg_qv_lock blocks content edits on non-drafts. */
export async function updateQuestionDraft(versionId: string, version: VersionPayload) {
  unwrap(await db.from("question_versions").update(version).eq("id", versionId).select().single());
}

export async function submitQuestionVersion(versionId: string) {
  unwrap(await db.rpc("submit_question_version", { p_version_id: versionId }));
}

/** Review decision. Status changes are applied by the trg_qr_validate / trg_qr_apply triggers. */
export async function reviewQuestionVersion(input: { orgId: string; reviewerId: string; versionId: string; decision: ReviewDecision; comments: string }) {
  unwrap(
    await db.from("question_reviews").insert({
      organisation_id: input.orgId,
      question_version_id: input.versionId,
      reviewer_id: input.reviewerId,
      decision: input.decision,
      comments: input.comments.trim() || null,
    }),
  );
}

export async function publishQuestionVersion(versionId: string, visibility: ContentVisibility) {
  unwrap(await db.rpc("publish_question_version", { p_version_id: versionId, p_visibility: visibility }));
}

export async function unpublishQuestion(questionId: string) {
  unwrap(await db.rpc("unpublish_question", { p_question_id: questionId }));
}
