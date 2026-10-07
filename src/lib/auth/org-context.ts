import { supabase } from "@/integrations/supabase/client";

// Gate 7: application-layer organisation context for the Revision 6 database.
// The x-organisation-id header is a HINT only. PostgreSQL current_org_id()
// re-validates it on every request (active user + active membership), and RLS
// stays the security boundary. Nothing here grants access.

export const ORG_HEADER = "x-organisation-id";
export const ORG_PREFERENCE_KEY = "aibinu.activeOrganisationId";

export interface OrgOption {
  id: string;
  name: string;
  slug: string;
}

export interface MembershipRow {
  organisation_id: string;
  status: string;
  organisations: { id: string; name: string; slug: string; status: string; deleted_at?: string | null } | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

/** Distinct active organisations from active memberships (a user may hold several roles in one org). */
export function toOrgOptions(rows: MembershipRow[]): OrgOption[] {
  const out = new Map<string, OrgOption>();
  for (const r of rows) {
    const o = r.organisations;
    if (r.status !== "active" || !o || o.status !== "active" || o.deleted_at) continue;
    if (!out.has(o.id)) out.set(o.id, { id: o.id, name: o.name, slug: o.slug });
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export type OrgResolution =
  | { kind: "none" }
  | { kind: "selected"; orgId: string }
  | { kind: "choose" };

/**
 * One org -> auto-select. Several -> use the remembered preference only if it is
 * one of the user's own organisations, otherwise ask. None -> no tenant access.
 */
export function resolveActiveOrg(orgs: OrgOption[], preferred: string | null): OrgResolution {
  if (orgs.length === 0) return { kind: "none" };
  if (orgs.length === 1) return { kind: "selected", orgId: orgs[0]!.id };
  if (preferred && orgs.some((o) => o.id === preferred)) return { kind: "selected", orgId: preferred };
  return { kind: "choose" };
}

interface HeaderHolder { rest: { headers: Headers } }

/** Single place that sets/clears the tenant header on the shared Supabase client. */
export function applyOrgHeader(orgId: string | null, client: HeaderHolder = supabase as unknown as HeaderHolder) {
  if (orgId && isUuid(orgId)) client.rest.headers.set(ORG_HEADER, orgId);
  else client.rest.headers.delete(ORG_HEADER);
}

export function readOrgHeader(client: HeaderHolder = supabase as unknown as HeaderHolder): string | null {
  return client.rest.headers.get(ORG_HEADER);
}

/** Memberships of the signed-in user only; user id comes from the verified Auth session. */
export async function loadMyOrganisations(userId: string): Promise<OrgOption[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data, error } = await db
    .from("organisation_memberships")
    .select("organisation_id,status,organisations(id,name,slug,status,deleted_at)")
    .eq("user_id", userId)
    .eq("status", "active");
  if (error) throw error;
  return toOrgOptions((data ?? []) as MembershipRow[]);
}

export function readOrgPreference(): string | null {
  try {
    const v = localStorage.getItem(ORG_PREFERENCE_KEY);
    return isUuid(v) ? v : null;
  } catch {
    return null;
  }
}
export function writeOrgPreference(orgId: string | null) {
  try {
    if (orgId) localStorage.setItem(ORG_PREFERENCE_KEY, orgId);
    else localStorage.removeItem(ORG_PREFERENCE_KEY);
  } catch {
    /* preference only */
  }
}

/** Only same-origin relative paths are accepted as post-login destinations. */
export function safeRedirect(target: unknown): string {
  if (typeof target !== "string" || !target.startsWith("/") || target.startsWith("//") || target.startsWith("/login")) return "/";
  return target;
}
