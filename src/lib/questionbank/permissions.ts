// Authoritative Question Bank permission codes from the Rev6 catalogue
// (verified in Gate 5). PostgreSQL (RLS + SECURITY DEFINER functions + triggers)
// decides every action; everything here is UX only.
export const QUESTION_PERMISSIONS = [
  "academic.questions.read",
  "academic.questions.write",
  "academic.questions.review",
  "academic.questions.approve",
  "academic.questions.publish",
] as const;
export type QuestionPermission = (typeof QUESTION_PERMISSIONS)[number];
export type QuestionPermissionMap = Record<QuestionPermission, boolean>;

export const EMPTY_QUESTION_PERMISSIONS: QuestionPermissionMap = {
  "academic.questions.read": false,
  "academic.questions.write": false,
  "academic.questions.review": false,
  "academic.questions.approve": false,
  "academic.questions.publish": false,
};

// Only the six types present in the Rev6 `question_type` enum.
export const QUESTION_TYPES = ["mcq", "multi_select", "true_false", "fill_blank", "short_answer", "theory"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  mcq: "Multiple choice (one answer)",
  multi_select: "Multiple choice (several answers)",
  true_false: "True / false",
  fill_blank: "Fill in the blank",
  short_answer: "Short answer",
  theory: "Theory (marked by a teacher)",
};

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const COGNITIVE_LEVELS = ["recall", "understand", "apply", "analyse", "evaluate"] as const;
export type CognitiveLevel = (typeof COGNITIVE_LEVELS)[number];

export type ContentStatus = "draft" | "in_review" | "approved" | "published" | "archived";
export type ContentSource = "manual" | "ai" | "imported" | "adopted";
export type ReviewDecision = "approved" | "changes_requested" | "rejected";
export type ContentVisibility = "private" | "organisation" | "shared";

export const STATUS_LABEL: Record<ContentStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  published: "Published",
  archived: "Archived",
};

export const SOURCE_LABEL: Record<ContentSource, string> = {
  manual: "Written by a teacher",
  ai: "AI draft",
  imported: "Imported",
  adopted: "Adopted",
};

/** Option shape used by the database (validate_question_version, finalize_attempt, get_attempt_paper). */
export interface QuestionOption {
  key: string;
  text: string;
  is_correct: boolean;
}

export function questionCapabilities(p: QuestionPermissionMap) {
  return {
    canRead: QUESTION_PERMISSIONS.some((k) => p[k]),
    canAuthor: p["academic.questions.write"],
    // Request changes / reject: review OR approve (qr_insert policy).
    canReview: p["academic.questions.review"] || p["academic.questions.approve"],
    // Approval is governed ONLY by academic.questions.approve (qr_insert policy).
    canApprove: p["academic.questions.approve"],
    canPublish: p["academic.questions.publish"],
    // Answer keys are shown only to staff holding a question permission beyond plain read.
    canSeeAnswers:
      p["academic.questions.write"] || p["academic.questions.review"] || p["academic.questions.approve"] || p["academic.questions.publish"],
  };
}

export const usesOptions = (t: QuestionType) => t === "mcq" || t === "multi_select" || t === "true_false";
export const usesAnswerKey = (t: QuestionType) => t === "fill_blank" || t === "short_answer";

export interface DraftInput {
  type: QuestionType;
  stem: string;
  options: QuestionOption[];
  acceptedAnswers: string[];
  explanation: string;
  marks: number;
  difficulty: Difficulty;
  cognitiveLevel: CognitiveLevel;
}

/** Mirrors validate_question_version for friendly messages. The database stays authoritative. */
export function validateDraft(d: DraftInput): string[] {
  const errs: string[] = [];
  if (d.stem.trim().length < 3) errs.push("Enter the question text.");
  if (!(d.marks > 0)) errs.push("Marks must be greater than 0.");
  if (usesOptions(d.type)) {
    const opts = d.options.filter((o) => o.text.trim());
    const right = opts.filter((o) => o.is_correct).length;
    if (d.type === "true_false" && opts.length !== 2) errs.push("True/false questions need exactly 2 options.");
    if (d.type !== "true_false" && opts.length < 2) errs.push("Add at least 2 options.");
    if ((d.type === "mcq" || d.type === "true_false") && right !== 1) errs.push("Mark exactly one option as correct.");
    if (d.type === "multi_select" && right < 1) errs.push("Mark at least one option as correct.");
  }
  if (usesAnswerKey(d.type) && d.acceptedAnswers.filter((a) => a.trim()).length === 0) errs.push("Enter at least one accepted answer.");
  return errs;
}

/** Build the database payload for a version from the form. */
export function toVersionPayload(d: DraftInput) {
  const opts = usesOptions(d.type)
    ? d.options.filter((o) => o.text.trim()).map((o, i) => ({ key: String.fromCharCode(97 + i), text: o.text.trim(), is_correct: o.is_correct }))
    : null;
  const accepted = d.acceptedAnswers.map((a) => a.trim()).filter(Boolean);
  return {
    stem: d.stem.trim(),
    options: opts,
    answer_key: usesAnswerKey(d.type) ? { accepted, case_sensitive: false } : null,
    explanation: d.explanation.trim() || null,
    marks: d.marks,
    difficulty: d.difficulty,
    cognitive_level: d.cognitiveLevel,
  };
}

/** Translate a database error into a useful, non-technical message. UX only. */
export function describeQuestionError(err: unknown): string {
  const raw =
    err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : String(err ?? "Unknown error");
  const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
  const perm = raw.match(/Permission denied: (academic\.questions\.\w+) required/);
  if (perm) return `You don't have permission for this action (requires ${perm[1]}).`;
  if (/Authors cannot review their own work/.test(raw)) return "You cannot review your own question. Another reviewer must do it.";
  if (/Only approved versions can be published/.test(raw)) return "Only approved versions can be published.";
  if (/not a draft/.test(raw)) return "This version is no longer a draft and cannot be submitted.";
  if (/cannot be edited; create a new version/.test(raw)) return "This version is locked. Start a new version to make changes.";
  if (/Only versions that are in review can be reviewed/.test(raw)) return "This version is not in review, so it cannot be reviewed.";
  if (/need|Options must be/i.test(raw) && /question|option|answer_key/i.test(raw)) return raw;
  if (/Version not found/.test(raw)) return "This version could not be found in your organisation.";
  if (code === "PGRST201") return "The app sent an ambiguous query. Please report this.";
  if (code === "42501" || /row-level security/i.test(raw)) return "The database refused this action for your account or organisation.";
  if (/JWT|not authenticated/i.test(raw)) return "Please sign in to continue.";
  return raw;
}
