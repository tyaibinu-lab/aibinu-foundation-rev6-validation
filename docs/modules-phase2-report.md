# Modules Phase 2: build report (2026-11-17)

Branch `feature/modules-phase2`, based on `c8ee0e1`. Front-end only, built on database functions and views that already exist in the Rev6 migration chain. **No migration, RLS, grant, auth/session, environment or deployment change.**

## CHANGED

| Area | New / changed files | Database contract used |
|---|---|---|
| Finance Phase 2 | `src/lib/finance/live.ts`, `src/components/finance/live.tsx`, routes `finance.catalogue`, `finance.invoices.index`, `finance.invoices.new`, `finance.invoices.$invoiceId`, `finance.payments`, `finance.refunds`, `finance.accounts`, `finance.my`. `FinanceShell.tsx` now links the live sections (still no data calls). | 006: `create_invoice`, `issue_invoice`, `void_invoice`, `write_off_balance`, `apply_wallet_to_invoice`, `record_manual_payment`, `request_refund`, `approve_refund`, `reject_refund`, `complete_refund`. Views `invoice_summary`, `fee_collection_summary`, `outstanding_balances`, `wallet_balances`, `account_statement`. Direct writes only on `tenant_products` / `tenant_prices` (finance.manage) and DELETE of draft invoices (as granted). |
| Learning Progress (CAS) | `src/lib/cas/api.ts`, `src/components/cas/shared.tsx`, routes `learning`, `learning.index`, `learning.student.$studentId`, `learning.reports` | 007: `learning_dashboard`, `assign_intervention`, `add_intervention`, `set_intervention_status`, `mark_intervention_done`, `dismiss_diagnosis`, `draft_parent_reports_for_class`, `draft_parent_report`, `approve_parent_report`, `mark_report_sent`. Views `class_mastery_summary`, `intervention_board`, `class_roster`. |
| AI drafting | `src/lib/ai/api.ts`, `src/components/ai/shared.tsx`, routes `ai`, `ai.index`, `ai.admin` | 008 + M1–M6b: `request_ai_note`, `request_ai_questions`, `request_ai_student_review`, `request_ai_diagnosis_explanation`, `request_ai_report_comment`, `cancel_ai_job(uuid,text)`, `approve_ai_job`, `review_ai_diagnostic`, `review_ai_diagnosis_narrative`. Reads `ai_jobs`, `ai_content`, `ai_diagnostics`, `my_ai_drafts`, `ai_credit_balance`, `ai_usage_this_month`. |
| Onboarding | `src/lib/onboarding/api.ts`, routes `welcome` (outside TenantGate), `members`, `members.index` | 009: `create_organisation`, `invite_member`, `accept_invitation`. Reads `organisation_memberships`, `users`, `roles`, `membership_invitations` (the token hash is never selected). |
| Home | `src/routes/index.tsx`: links to the new modules, honest status labels, removed the stale "no database connected" text. | none |
| Tests | `src/test/finance-live-contract.test.ts`, `cas-contract.test.ts`, `ai-drafting-contract.test.ts`, `onboarding-contract.test.ts` | mocked client |
| Docs | `AGENTS.md` (4 rules), `roadmap.md` (Phase 2 section), this report | none |

## WHY

The database already holds the business logic for these four modules: invoicing, the ledger, mastery, AI governance and invitations. Building the screens on those functions delivers the modules without new schema. The database stays the only authority.

## PRESERVED

- **Finance Phase 1:** `/finance` overview, `api.ts`, `mock-data.ts` and `permissions.ts` are unchanged, and the existing Phase 1 tests still apply. `FinanceShell` still makes no data calls.
- **Auth and sessions:** `AuthProvider`, `TenantGate`, `org-context`, `login` and the Supabase client are not modified. Onboarding switches organisation only by writing the existing preference key and reloading.
- **No database writes outside the granted surface:**
  - CBT, NoteBank, Question Bank, Students and Curriculum code is untouched.
  - The browser never computes money, mastery or scores.
  - No RPC carries `organisation_id`.
- **AI stays draft-only:**
  - The browser never calls a provider or worker function and never reads prompt templates.
  - No publish RPC is called.
  - Notes and questions still pass through the existing review workflow.

## TESTED (here, outside the project)

- **Contract check, functions:** all 34 database functions called exist in the migration chain with matching argument names, and every one is granted to `authenticated`.
- **Contract check, columns:** every selected table column exists, and view columns were checked by hand against their SQL.
- **Executed logic:** 19 checks ran under tsx against a stub client. They covered money parsing, RPC arguments, the absence of `unit_price`, draft-only delete, report comment-only edits, idempotency keys, draft linking, token parsing, slugs and membership joins. All 19 passed.
- **Strict TypeScript:** `tsc --strict` with no unused locals/params: 0 errors on the four data-layer files.
- **Syntax and imports:** all 31 changed or new TS/TSX files parse, and none has unused imports.
- **Not executed:** the project's vitest suite, ESLint, the full typecheck and the build. These need the project's packages, which could not be installed in this environment.

## REMAINING

1. Apply in Lovable, then let the router plugin regenerate `src/routeTree.gen.ts`. The new route tests depend on it.
2. Run `npm test`, `npm run lint` and the build. Fix only what fails, and keep the security assertions.
3. Run live UAT on the validation project with these roles: bursar, approver (`finance.approve`), teacher (`cas.manage` + `ai.use`), parent and student.
4. The AI global switch is off by default and can only be turned on by a platform admin (`ai_set_kill_switch`). Until then, AI requests show "switched off". Even when it is on, jobs stay queued until a worker exists.
5. Separate gates, not built:
   - online payments (`initiate_payment`, provider checkout, webhook into `ingest_payment_event`, provider secret)
   - the AI worker (server-side `claim_ai_job` / `complete_ai_job` with the provider key)
   - self-service sign-up (an auth-area change)
   - discounts and scholarships management screens
   - schema design for Virtual Lab and Communication

## DEPLOYMENT

None performed. Nothing is pushed. The patch or zip is applied through Lovable by the project owner.
