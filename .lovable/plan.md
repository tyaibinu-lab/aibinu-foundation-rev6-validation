# Curriculum Bank read-only slice — post-implementation review

Review only. I made no edits, commits, SQL, database connections or setting changes. Every finding below comes from reading source code and git history. Nothing was checked against a live database.

## Evidence

- Commits: the slice landed in `6517753`, `1aa3e72` and `59b0fca` (test adjustment, AGENTS.md, roadmap.md). It was merged into HEAD `13d42954b4123b33b97c417a588b23ac5e98c36a`.
- Changed files: `src/lib/curriculum/api.ts` (+60), `src/routes/curriculum.tsx` (+8), `src/routes/curriculum.index.tsx` (+149), `src/test/curriculum-contract.test.ts` (+93), `src/routeTree.gen.ts` (generated, +50), `AGENTS.md` (+1), `roadmap.md` (+1).
- Tests and types: the build turn reported 294/294 tests passing and a clean `tsgo`. I did not re-run them in this review.

## BLOCKER

None found.

## SHOULD FIX

**S1. A draft can stay selected but hidden after switching "Show draft and archived" off.** `curriculum.index.tsx:46,54,110-120`
- `versionId` is never checked against `visibleVersions`.
- Example: select a draft, then turn the switch off. The draft's topics stay on screen, but no version button is highlighted, so the page does not show which version you are looking at.

**S2. Switching curriculum can briefly show the previous curriculum's version.** `curriculum.index.tsx:52,81,116-120`
- The reset happens in a `useEffect` after render. For one render, the old `versionId` stays active under the new curriculum.
- If the old tree is cached under `["curriculum","tree",oldId]`, the previous curriculum's units appear for that frame.
- The same effect also resets a user's manual choice whenever `versions.data` changes reference after a background refetch.
- Query keys themselves are correct: every key includes `curriculumId` or `versionId`.

**S3. No link to the page.** `/curriculum` is reachable only by typing the address. Nothing in `src/routes/index.tsx` or the header points to it.

Smallest fix for S1 and S2 together:
- Derive the selection during render: `selected = visibleVersions.find(v => v.id === versionId) ?? defaultVersion(visibleVersions)`.
- Drive the tree query and `aria-pressed` from `selected?.id`.
- In the curriculum click handler, call `setVersionId(null)` and remove the effect.
- Add one test each for: draft deselected when hidden, and no previous-curriculum version after switching.

Fix for S3: add one `<Link to="/curriculum">` next to the existing module links on the home page.

## ACCEPTABLE (with notes)

**A1. Tenant header is really sent with database requests.**
- `applyOrgHeader` (`src/lib/auth/org-context.ts:56-59`) mutates `supabase.rest.headers`.
- In postgrest-js 2.117.2 (`dist/index.mjs:265`), each request builder copies those headers when `from()` is called. So `x-organisation-id` goes with every curriculum request made after `AuthProvider.tsx:66/116` sets it.
- Switching organisation clears the query cache first (`AuthProvider.tsx:113-117`). `TenantGate` renders protected pages only once the organisation is ready.
- The client uses only the publishable key. I did not reproduce it here.
- Not proven: that RLS isolates tenants. The mocked tests only show that the client sends no `organisation_id` filter.

**A2. Schema matches the migration source.** `003_curriculum.sql:33-106`, `004:33`
- `curricula` has `subject_id` and a single composite FK to `subjects`. `types.ts:1420` has only `curricula_subject_id_organisation_id_fkey`, so the `subjects(name)` embed is unambiguous.
- `curriculum_versions.created_at` exists.
- All selected unit and topic columns exist; `topic_key` comes from 004.
- Only `curricula` has `deleted_at`, and the filter applies only there, which is correct.
- Not verified: that the live staging schema and RLS match these files.

**A3. Topics without a unit are built but never shown.** `api.ts:50-55`, `curriculum.index.tsx:119-139`
- The page never renders `tree.unassigned`, and its "no units" empty state ignores it.
- Real-world impact is near zero: `unit_id` is `NOT NULL`, and the composite FK `(unit_id, version_id)` blocks orphans. The only path is RLS hiding a unit while showing its topics, and the policies use the same organisation rule for both.
- Optional: render a "Topics without a unit" group when `unassigned.length > 0`.

**A4. Test validity.**
- The 7 tests correctly check: exact tables, columns and filters; read-only use (no writes or RPCs, plus a source scan for `insert/update/upsert/delete/rpc/client.server/SERVICE_ROLE`); grouping by unit; error propagation; published-by-default selection; and the client-only layout.
- The route test depends on the generated `routeTree.gen.ts`. Other modules' tests use the same pattern, so the dependency is consistent rather than new.
- The source-file regex checks (`ssr: false`, `TenantGate`) are brittle to formatting but harmless.
- Gaps: there are no component-level tests for S1/S2 selection state and no RLS or two-tenant integration tests. The mock checks the client contract only.

**A5. Accessibility and UX.**
- Good: `aria-pressed` on toggle buttons, `<details>/<summary>` for units, a labelled switch, and distinct loading, empty and error states.
- Minor:
  - Loading text is not announced to screen readers (consider `role="status"`).
  - Error boxes show raw database messages.
  - The "AF" logo link has visible text, which is fine.
  - Version buttons have no visible focus style beyond the browser default.

## Proposed fix scope (for separate approval)

1. S1 + S2: derive the selection, drop the effect, reset on curriculum click, and add 2 tests.
2. S3: home-page link.
3. Optional A3: unassigned-topics group.

None of these touch the database, permissions, the tenant header or migrations.
