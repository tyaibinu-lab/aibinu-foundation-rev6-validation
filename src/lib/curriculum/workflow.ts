import { supabase } from "@/integrations/supabase/client";

// Curriculum Bank review workflow. Writes happen ONLY through audited database
// functions (curriculum_submit_for_review / curriculum_review_version /
// curriculum_publish_version). Permission checks, organisation scope, separation
// of duties and the publish gate are enforced in the database, not here; this
// module never passes an organisation id and never writes tables directly.
// api.ts stays strictly read-only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type ReviewState = "not_submitted" | "in_review" | "changes_requested" | "approved";
export type ReviewDecision = "approve" | "request_changes";

function unwrap<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

export async function submitForReview(versionId: string, note?: string): Promise<ReviewState> {
  return unwrap<ReviewState>(await db.rpc("curriculum_submit_for_review", { p_version_id: versionId, p_note: note ?? null }));
}

export async function reviewVersion(versionId: string, decision: ReviewDecision, note?: string): Promise<ReviewState> {
  return unwrap<ReviewState>(
    await db.rpc("curriculum_review_version", { p_version_id: versionId, p_decision: decision, p_note: note ?? null }),
  );
}

export async function publishVersion(versionId: string): Promise<string> {
  return unwrap<string>(await db.rpc("curriculum_publish_version", { p_version_id: versionId }));
}
