import { supabase } from "@/integrations/supabase/client";
import { isUuid, writeOrgPreference } from "@/lib/auth/org-context";

// Onboarding & membership layer over the Rev6 migration 009 contract.
// - create_organisation: the ONLY way to create an organisation (no INSERT policy); the caller
//   becomes its owner; the database rate-limits and audits it.
// - invite_member: membership.manage, role ceiling and owner-only-invites-owner are enforced in
//   the database. It returns a one-time token that is never stored (only its hash is); the UI
//   shows it once as a join link for the inviter to share.
// - accept_invitation: the signed-in account's e-mail must match the invited e-mail.
// - Reads (members, roles, invitations) go through RLS only; token hashes are not even
//   selectable. Nothing here writes a table directly or touches auth/session code: after joining
//   or creating, the active-organisation preference is set and the page reloads so the existing
//   AuthProvider resolves organisations exactly as it does at sign-in.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap<T = any>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

// ---------- create organisation ----------

export interface NewOrganisation { name: string; slug: string; type: "school" | "individual" }

export function slugify(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").slice(0, 48).replace(/^-+|-+$/g, "");
}
export function validateOrganisation(o: NewOrganisation): string[] {
  const e: string[] = [];
  if (o.name.trim().length < 2) e.push("Enter the school's name.");
  if (!/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/.test(o.slug)) e.push("Short name: 3–48 lowercase letters, numbers or dashes.");
  if (o.type !== "school" && o.type !== "individual") e.push("Choose school or individual tutor.");
  return e;
}
export async function createOrganisation(o: NewOrganisation): Promise<string> {
  return unwrap(await db.rpc("create_organisation", { p_name: o.name.trim(), p_slug: o.slug, p_type: o.type, p_country: "NG" })) as string;
}

// ---------- invitations ----------

const TOKEN_RE = /^[0-9a-f]{64}$/i;
/** Accepts a raw token or a full join link (…/welcome?token=…). Returns null if neither. */
export function extractToken(input: string): string | null {
  const s = input.trim();
  if (TOKEN_RE.test(s)) return s;
  try {
    const t = new URL(s).searchParams.get("token");
    return t && TOKEN_RE.test(t) ? t : null;
  } catch {
    return null;
  }
}
export function joinLink(token: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/welcome?token=${encodeURIComponent(token)}`;
}
export async function acceptInvitation(token: string): Promise<string> {
  return unwrap(await db.rpc("accept_invitation", { p_token: token })) as string;
}

/** Make the new organisation active, then reload so AuthProvider re-reads memberships. */
export function enterOrganisation(orgId: string, go: (href: string) => void = (h) => window.location.assign(h)) {
  if (isUuid(orgId)) writeOrgPreference(orgId);
  go("/");
}

// ---------- members (current organisation) ----------

export interface RoleRow { id: string; code: string; name: string; description: string | null }
export interface MemberRow { id: string; user_id: string; role_id: string; status: string; created_at: string; fullName: string | null; roleName: string | null }
export interface InvitationRow { id: string; email: string; role_id: string; expires_at: string; accepted_at: string | null; revoked_at: string | null; created_at: string; roleName?: string | null }

export async function canManageMembers(): Promise<boolean> {
  return unwrap(await db.rpc("has_permission", { perm: "membership.manage" })) === true;
}
/** Organisation roles visible to the caller (system roles + this organisation's own). */
export async function listRoles(): Promise<RoleRow[]> {
  return unwrap(await db.from("roles").select("id,code,name,description").eq("scope", "organisation").order("name")) ?? [];
}
export async function listMembers(): Promise<MemberRow[]> {
  const rows = (unwrap(await db.from("organisation_memberships").select("id,user_id,role_id,status,created_at").order("created_at")) ?? []) as Omit<MemberRow, "fullName" | "roleName">[];
  if (!rows.length) return [];
  const [u, r] = await Promise.all([
    db.from("users").select("id,full_name").in("id", [...new Set(rows.map((x) => x.user_id))]),
    db.from("roles").select("id,name").in("id", [...new Set(rows.map((x) => x.role_id))]),
  ]);
  const users = (unwrap(u) ?? []) as { id: string; full_name: string }[];
  const roles = (unwrap(r) ?? []) as { id: string; name: string }[];
  return rows.map((x) => ({ ...x, fullName: users.find((y) => y.id === x.user_id)?.full_name ?? null, roleName: roles.find((y) => y.id === x.role_id)?.name ?? null }));
}
/** RLS: membership.manage only. token_hash is not granted to clients and is never selected. */
export async function listInvitations(): Promise<InvitationRow[]> {
  return unwrap(await db.from("membership_invitations").select("id,email,role_id,expires_at,accepted_at,revoked_at,created_at").order("created_at", { ascending: false }).limit(200)) ?? [];
}
export function validateInvite(email: string, roleCode: string): string[] {
  const e: string[] = [];
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) e.push("Enter a valid e-mail address.");
  if (!roleCode) e.push("Choose a role.");
  return e;
}
/** Returns the one-time token. It cannot be recovered later — show it once. */
export async function inviteMember(email: string, roleCode: string): Promise<string> {
  return unwrap(await db.rpc("invite_member", { p_email: email.trim().toLowerCase(), p_role_code: roleCode })) as string;
}

export function invitationState(i: InvitationRow, now = new Date()): "accepted" | "revoked" | "expired" | "open" {
  if (i.accepted_at) return "accepted";
  if (i.revoked_at) return "revoked";
  if (new Date(i.expires_at) <= now) return "expired";
  return "open";
}

export function describeOnboardingError(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  if (/duplicate key.*slug/i.test(m)) return "That short name is already taken. Try another.";
  if (/row-level security|permission denied for (table|view|function)/i.test(m)) return "You do not have permission to do this in the active organisation.";
  if (/invalid or has expired/i.test(m)) return "This invitation is invalid or has expired, or it was sent to a different e-mail address than the one you signed in with.";
  return m.replace(/^Permission denied: /, "Permission needed: ");
}
