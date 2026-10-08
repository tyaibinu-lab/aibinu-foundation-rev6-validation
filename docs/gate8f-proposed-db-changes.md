# Gate 8F — Proposed DB security-contract changes (P1 applied Gate 8G-1, P3 applied Gate 8G-2, P2(b) applied Gate 8G-3, P4 applied Gate 8G-4)

Status: PROPOSAL ONLY. Requires explicit approval. Validation project only; apply one at a time, verify after each.

## P1 — Scope `release_results` to the caller's result visibility (HIGH)
Current: checks only `has_permission('result.release')` + exam in `current_org_id()`. Teacher (has result.release, no class assignment) released exam 7b083255… (returned 0; nothing was pending).

```sql
CREATE OR REPLACE FUNCTION public.release_results(p_exam_id uuid, p_force boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','pg_temp' AS $$
BEGIN
  IF NOT has_permission('result.release') THEN
    RAISE EXCEPTION 'Permission denied: result.release required';
  END IF;
  PERFORM 1 FROM exams WHERE id = p_exam_id AND organisation_id = current_org_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam not found'; END IF;
  -- NEW: non-read_all releasers must be able to see every result they release
  IF NOT has_permission('result.read_all') AND EXISTS (
       SELECT 1 FROM results r WHERE r.exam_id = p_exam_id AND NOT staff_can_view_results(r.student_id)) THEN
    RAISE EXCEPTION 'Permission denied: results outside your classes';
  END IF;
  RETURN release_results_internal(p_exam_id, p_force);
END $$;
```
Admin/Owner (read_all) unchanged. Tests: teacher w/o assignment → denied; assigned form teacher → allowed; admin → allowed; forged org → denied.

## P2 — Teacher exam lifecycle scope (MEDIUM, RBAC decision)
Teacher holds `exam.create` organisation-wide: can edit/publish/close ANY exam (live: teacher `close_exam` succeeded on the Gate 8E exam). Options (choose one):
- (a) RBAC: keep as designed (teachers trusted org-wide) — document as accepted risk.
- (b) Add ownership: `publish_exam`/`close_exam`/`exams_update`/`exam_eligibility_write` require `has_permission('result.read_all') OR created_by = current_user_id()` — depends on P3.

## P3 — Server-stamped provenance on `exams` and `exam_eligibility` (MEDIUM)
Current: `created_by` is NULL by default and clients hold column INSERT privilege on it; live test stored the Reviewer's UUID on an exam inserted by the Publisher (spoof).
```sql
CREATE OR REPLACE FUNCTION public.stamp_created_by() RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'pg_catalog','public','pg_temp' AS $$
BEGIN
  IF current_user IN ('anon','authenticated') THEN NEW.created_by := current_user_id(); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_exams_stamp_created_by BEFORE INSERT ON public.exams FOR EACH ROW EXECUTE FUNCTION public.stamp_created_by();
CREATE TRIGGER trg_elig_stamp_created_by BEFORE INSERT ON public.exam_eligibility FOR EACH ROW EXECUTE FUNCTION public.stamp_created_by();
```
Existing NULL rows stay NULL (no reliable source to backfill).

## P4 — Audit trail for CBT governance actions (MEDIUM)
`audit_events` has no exam publish/close, result release or marking entries. Proposal: attach the existing `audit_row_change()` trigger to `exams` (UPDATE OF status), `results` (UPDATE OF released_at) and `responses` (UPDATE OF marks_awarded), after confirming its signature/redaction against Rev6 `audit_redact`.

## Confirmed already enforced (no change)
Duplicate eligibility: unique indexes `uq_eligibility_class (exam_id, class_id)` and `uq_eligibility_student (exam_id, student_id)` — live duplicate insert rejected.
