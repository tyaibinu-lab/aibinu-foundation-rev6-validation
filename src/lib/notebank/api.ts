import { supabase } from "@/integrations/supabase/client";
import {
  EMPTY_PERMISSIONS,
  NOTE_PERMISSIONS,
  type ContentStatus,
  type ContentVisibility,
  type PermissionMap,
  type ReviewDecision,
} from "./permissions";

// Generated types are empty until migrations are applied, so the NoteBank
// layer uses an untyped view of the client. All authorization stays in
// PostgreSQL (RLS + SECURITY DEFINER functions); nothing here bypasses it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface NoteRow {
  id: string;
  organisation_id: string;
  topic_id: string;
  title: string;
  status: ContentStatus;
  // Provenance set by the database (migration 008 AI worker sets 'ai'); never written by the client.
  source: "manual" | "ai" | "imported" | "adopted";
  current_version_id: string | null;
  created_by: string | null;
  updated_at: string;
}
export interface NoteVersionRow {
  id: string;
  note_id: string;
  organisation_id: string;
  version_no: number | null;
  status: ContentStatus;
  body: string;
  summary: string | null;
  reading_minutes: number | null;
  created_by: string | null;
  created_at: string;
}
export interface NoteReviewRow {
  id: string;
  note_version_id: string;
  reviewer_id: string;
  decision: ReviewDecision;
  comments: string | null;
  reviewed_at: string;
}
export interface TopicRow {
  id: string;
  organisation_id: string;
  title?: string;
  name?: string;
}

function unwrap<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

export async function fetchPermissions(): Promise<PermissionMap> {
  const out: PermissionMap = { ...EMPTY_PERMISSIONS };
  await Promise.all(
    NOTE_PERMISSIONS.map(async (perm) => {
      const res = await db.rpc("has_permission", { perm });
      if (res.error) throw res.error;
      out[perm] = res.data === true;
    }),
  );
  return out;
}

export async function currentContext(): Promise<{ userId: string | null; orgId: string | null }> {
  const [u, o] = await Promise.all([db.rpc("current_user_id"), db.rpc("current_org_id")]);
  if (u.error) throw u.error;
  if (o.error) throw o.error;
  return { userId: u.data ?? null, orgId: o.data ?? null };
}

export async function listNotes(status?: ContentStatus): Promise<NoteRow[]> {
  let q = db.from("notes").select("*").is("deleted_at", null).order("updated_at", { ascending: false });
  if (status) q = q.eq("status", status);
  return unwrap(await q) ?? [];
}

export async function listVersionsByStatus(status: ContentStatus): Promise<(NoteVersionRow & { notes: { title: string } | null })[]> {
  return (
    unwrap(
      await db
        .from("note_versions")
        .select("*, notes(title)")
        .eq("status", status)
        .order("created_at", { ascending: false }),
    ) ?? []
  );
}

export async function getNote(noteId: string) {
  const note: NoteRow = unwrap(await db.from("notes").select("*").eq("id", noteId).single());
  const versions: NoteVersionRow[] =
    unwrap(await db.from("note_versions").select("*").eq("note_id", noteId).order("version_no", { ascending: false })) ?? [];
  const ids = versions.map((v) => v.id);
  const reviews: NoteReviewRow[] = ids.length
    ? unwrap(await db.from("note_reviews").select("*").in("note_version_id", ids).order("reviewed_at", { ascending: false })) ?? []
    : [];
  return { note, versions, reviews };
}

export async function listTopics(): Promise<TopicRow[]> {
  return unwrap(await db.from("curriculum_topics").select("*").limit(500)) ?? [];
}

export async function createNote(input: { orgId: string; userId: string; topicId: string; title: string; body: string; summary?: string | undefined }) {
  const note: NoteRow = unwrap(
    await db
      .from("notes")
      .insert({ organisation_id: input.orgId, topic_id: input.topicId, title: input.title, created_by: input.userId })
      .select()
      .single(),
  );
  await createVersion({ orgId: input.orgId, userId: input.userId, noteId: note.id, body: input.body, summary: input.summary });
  return note;
}

export async function createVersion(input: { orgId: string; userId: string; noteId: string; body: string; summary?: string | undefined }) {
  return unwrap(
    await db
      .from("note_versions")
      .insert({
        organisation_id: input.orgId,
        note_id: input.noteId,
        body: input.body,
        summary: input.summary || null,
        created_by: input.userId,
      })
      .select()
      .single(),
  ) as NoteVersionRow;
}

export async function updateDraft(versionId: string, patch: { body: string; summary?: string | undefined }) {
  unwrap(await db.from("note_versions").update({ body: patch.body, summary: patch.summary || null }).eq("id", versionId).select().single());
}

export async function submitVersion(versionId: string) {
  unwrap(await db.rpc("submit_note_version", { p_version_id: versionId }));
}

export async function reviewVersion(input: { orgId: string; reviewerId: string; versionId: string; decision: ReviewDecision; comments: string }) {
  unwrap(
    await db.from("note_reviews").insert({
      organisation_id: input.orgId,
      note_version_id: input.versionId,
      reviewer_id: input.reviewerId,
      decision: input.decision,
      comments: input.comments || null,
    }),
  );
}

export async function publishVersion(versionId: string, visibility: ContentVisibility) {
  unwrap(await db.rpc("publish_note_version", { p_version_id: versionId, p_visibility: visibility }));
}

export async function unpublishNote(noteId: string) {
  unwrap(await db.rpc("unpublish_note", { p_note_id: noteId }));
}
