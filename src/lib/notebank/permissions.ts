// Authoritative NoteBank permission codes from the Rev6 contract
// (migration 001 catalogue, enforced by migration 004 functions and RLS).
// No aliases for retired codes — the database decides every action.
export const NOTE_PERMISSIONS = [
  "academic.notes.read",
  "academic.notes.write",
  "academic.notes.review",
  "academic.notes.approve",
  "academic.notes.publish",
] as const;
export type NotePermission = (typeof NOTE_PERMISSIONS)[number];
export type PermissionMap = Record<NotePermission, boolean>;

export const EMPTY_PERMISSIONS: PermissionMap = {
  "academic.notes.read": false,
  "academic.notes.write": false,
  "academic.notes.review": false,
  "academic.notes.approve": false,
  "academic.notes.publish": false,
};

export type ContentStatus = "draft" | "in_review" | "approved" | "published" | "archived";
export type ReviewDecision = "approved" | "changes_requested" | "rejected";
export type ContentVisibility = "private" | "organisation" | "shared";

/**
 * UI capabilities derived from the permission map. UX only — mirrors the
 * Rev6 policies so controls are shown correctly; PostgreSQL stays authoritative.
 */
export function noteCapabilities(p: PermissionMap) {
  return {
    canAuthor: p["academic.notes.write"],
    // Review queue + comment / request changes / reject.
    canReview: p["academic.notes.review"] || p["academic.notes.approve"],
    // Approval is governed ONLY by academic.notes.approve.
    canApprove: p["academic.notes.approve"],
    // Publish and unpublish.
    canPublish: p["academic.notes.publish"],
  };
}

/** Translate a database error into a useful, non-technical message. UX only. */
export function describeDbError(err: unknown): string {
  const raw =
    err && typeof err === "object" && "message" in err
      ? String((err as { message: unknown }).message)
      : String(err ?? "Unknown error");
  const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";

  const perm = raw.match(/Permission denied: (academic\.notes\.(?:read|write|review|approve|publish)) required/);
  if (perm) return `You don't have permission for this action (requires ${perm[1]}).`;
  if (/Only approved versions can be published/.test(raw)) return "Only approved versions can be published.";
  if (/not a draft/.test(raw)) return "This version is no longer a draft and cannot be submitted.";
  if (/Version not found/.test(raw)) return "This version could not be found in your organisation.";
  if (/Only versions that are in review can be reviewed/.test(raw)) return "This version is not in review, so it cannot be reviewed.";
  if (/own/i.test(raw) && /review/i.test(raw)) return "You cannot review your own note.";
  if (code === "42501" || /row-level security/i.test(raw))
    return "The database refused this action for your account or organisation.";
  if (code === "42P01" || code === "PGRST205" || code === "PGRST202" || /does not exist|schema cache/i.test(raw))
    return "NoteBank is not available yet: the database migrations have not been applied.";
  if (/JWT|not authenticated/i.test(raw)) return "Please sign in to continue.";
  return raw;
}

export const STATUS_LABEL: Record<ContentStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  published: "Published",
  archived: "Archived",
};
