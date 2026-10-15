import { supabase } from "@/integrations/supabase/client";

// READ-ONLY Curriculum Bank data access. Uses the browser client (publishable key)
// only; organisation scope comes from the x-organisation-id header owned by
// AuthProvider and is enforced by RLS (curricula*_read: organisation_id =
// current_org_id() AND is_org_member()). This module never writes and never
// filters by a client-supplied organisation id.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type VersionStatus = "draft" | "published" | "archived";

export interface CurriculumRow { id: string; name: string; exam_body: string; level: string | null; description: string | null; subjects: { name: string } | null }
export interface VersionRow { id: string; curriculum_id: string; version_label: string; status: VersionStatus; effective_from: string | null; published_at: string | null }
export interface UnitRow { id: string; version_id: string; title: string; position: number }
export interface TopicRow { id: string; version_id: string; unit_id: string; code: string; title: string; position: number; class_level: string | null; term: string; topic_key: string }

export const CURRICULUM_COLS = "id,name,exam_body,level,description,subjects(name)";
export const VERSION_COLS = "id,curriculum_id,version_label,status,effective_from,published_at";
export const UNIT_COLS = "id,version_id,title,position";
export const TOPIC_COLS = "id,version_id,unit_id,code,title,position,class_level,term,topic_key";

function unwrap<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

export async function listCurricula(): Promise<CurriculumRow[]> {
  return unwrap<CurriculumRow[] | null>(
    await db.from("curricula").select(CURRICULUM_COLS).is("deleted_at", null).order("name"),
  ) ?? [];
}

export async function listVersions(curriculumId: string): Promise<VersionRow[]> {
  return unwrap<VersionRow[] | null>(
    await db.from("curriculum_versions").select(VERSION_COLS).eq("curriculum_id", curriculumId).order("created_at", { ascending: false }),
  ) ?? [];
}

export interface VersionTree { units: (UnitRow & { topics: TopicRow[] })[]; unassigned: TopicRow[] }

export async function getVersionTree(versionId: string): Promise<VersionTree> {
  const [units, topics] = await Promise.all([
    db.from("curriculum_units").select(UNIT_COLS).eq("version_id", versionId).order("position"),
    db.from("curriculum_topics").select(TOPIC_COLS).eq("version_id", versionId).order("position"),
  ]);
  return buildTree(unwrap<UnitRow[] | null>(units) ?? [], unwrap<TopicRow[] | null>(topics) ?? []);
}

export function buildTree(units: UnitRow[], topics: TopicRow[]): VersionTree {
  const byUnit = new Map(units.map((u) => [u.id, { ...u, topics: [] as TopicRow[] }]));
  const unassigned: TopicRow[] = [];
  for (const t of topics) (byUnit.get(t.unit_id)?.topics ?? unassigned).push(t);
  return { units: [...byUnit.values()], unassigned };
}

/** Default selection: the published version if one exists, otherwise none. */
export function defaultVersion(versions: VersionRow[]): VersionRow | null {
  return versions.find((v) => v.status === "published") ?? null;
}

/** Versions the user can currently see. */
export function visibleVersions(versions: VersionRow[], showAll: boolean): VersionRow[] {
  return versions.filter((v) => showAll || v.status === "published");
}

/**
 * The selected version, derived at render time: the user's choice only if it is
 * one of the visible versions of the current curriculum, else the visible default.
 * A hidden or foreign version id can never be selected.
 */
export function selectVersion(versions: VersionRow[], showAll: boolean, chosenId: string | null): VersionRow | null {
  const visible = visibleVersions(versions, showAll);
  return visible.find((v) => v.id === chosenId) ?? defaultVersion(visible);
}
