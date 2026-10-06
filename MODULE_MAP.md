# Aibinu Flexiprep — Module Map

> Status: BASELINE. Describes the ten platform modules, their provenance, and
> what must be preserved during migration. No module is implemented by this
> task.

## 1. Student Management

- **Source:** existing student-management application (proven).
- **Scope:** student enrolment, profiles, class/arm assignment, guardian
  links, status lifecycle.
- **Preserve:** enrolment workflows, student identity integrity, class
  structures.

## 2. Academic / NoteBank

- **Source:** staging NoteBank + AI Note Creator + AI Question Generator.
- **Scope:** curriculum-aligned notes, questions, worked examples; AI-assisted
  drafting of notes and questions.
- **Preserve:** the teacher/reviewer workflow — AI content is always a draft
  until approved. WAEC/NECO/UTME alignment.

## 3. Reviewer

- **Scope:** submission → review → approval → publishing pipeline for all
  academic content (human- or AI-authored).
- **Preserve:** no path to publication that skips review. Review actions are
  audited.

## 4. CBT (Computer-Based Testing)

- **Scope:** examination infrastructure — attempt creation, question
  delivery, answer tracking, timing, submission, scoring, results, history.
- **Preserve:** the full trace
  `START → ATTEMPT → DELIVERY → ANSWERS → SCORING → RESULT → HISTORY`.
  Attempts are never mixed between students. Scoring is server-side only;
  scoring changes require regression testing.

## 5. Virtual Laboratory

- **Source:** existing lab application (proven).
- **Scope:** first-class module with a **reusable experiment engine** shared
  across subjects, plus subject-specific experiment content.
- **Preserve:** the reusable engine — do not fork per-subject engines.

## 6. AICAS (Academic Intelligence Layer)

- **Scope:** the unified AI layer — prompt/model/job/version/audit metadata,
  AI explanations, generation pipelines feeding NoteBank and Question
  Generator.
- **Preserve:** AI output is always a draft pending reviewer approval; every
  AI job is traceable (prompt, model, version, actor, timestamp).

## 7. Finance

- **Scope:** fees, payments, subscriptions, financial records.
- **Preserve:** financial history is immutable — corrections are new records,
  never rewrites.

## 8. Analytics

- **Scope:** reporting and insight over canonical data (performance,
  engagement, coverage).
- **Preserve:** read-only over transactional tables; no write paths.

## 9. Communication

- **Scope:** notices, announcements, messaging between roles.
- **Preserve:** tenancy scoping and role-appropriate visibility.

## 10. Offline

- **Scope:** cached learning resources and offline-tolerant reading; sync on
  reconnect.
- **Preserve:** offline never creates a divergent write path that bypasses
  server authority (scoring, publishing, finance stay server-side).

## Cross-module invariants

- All modules resolve identity, tenancy, and roles through the platform
  services layer — never independently.
- All modules honour the academic model:
  `Curriculum → Subject → Topic → Learning Objective → Learning Resource`.
- All modules honour the review gate before content is visible to students.
