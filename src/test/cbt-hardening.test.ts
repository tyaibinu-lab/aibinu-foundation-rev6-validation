// Gate 8F — CBT security/RBAC hardening regression tests (static + mocked).
// Lock in the application-side guarantees found in the audit; database-side
// behaviour is proven by the live Gate 8F validation run.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({}), rpc: () => Promise.resolve({ data: null, error: null }) } }));
const api = await import("@/lib/cbt/api");

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const CBT = [...walk("src/lib/cbt"), ...walk("src/components/cbt"), ...walk("src/routes").filter((f) => /routes\/cbt/.test(f))];
const src = (f: string) => readFileSync(f, "utf8");

describe("provenance (created_by is DB-writable by clients — app must never send it)", () => {
  it.each(CBT)("%s never sends created_by / marked_by / published_by", (f) => {
    expect(src(f)).not.toMatch(/created_by\s*:|marked_by\s*:|published_by\s*:|reviewer_id\s*:/);
  });
  it("exam insert payload has no actor field", () => {
    const p = api.toExamInsert({ title: "t", kind: "test", subjectId: null, academicSessionId: null, instructions: "", opensAt: "2026-10-09T00:00:00Z", closesAt: "2026-10-10T00:00:00Z", durationMin: 10, hardClose: true, attemptsAllowed: 1, attemptPolicy: "best", shuffleQuestions: false, shuffleOptions: false, passMarkPct: 50, releasePolicy: "manual", allowReview: false, requiresFeesCleared: false }, "org");
    expect(Object.keys(p)).not.toContain("created_by");
  });
});

describe("duplicate eligibility is enforced by the DB unique index", () => {
  it("maps uq_eligibility_class violation to a clear message", () => {
    expect(api.describeCbtError({ message: 'duplicate key value violates unique constraint "uq_eligibility_class"' })).toMatch(/already eligible/);
  });
});

describe("no bypass of lifecycle / release / scoring internals anywhere in CBT", () => {
  it.each(CBT)("%s", (f) => {
    const s = src(f);
    expect(s).not.toMatch(/release_results_internal|score_attempt|finalize_attempt|run_cbt_maintenance/);
    expect(s).not.toMatch(/\.from\("(results|attempts|responses)"\)\s*\.(insert|update|upsert|delete)/);
    expect(s).not.toMatch(/status:\s*"(published|closed|draft)"\s*[,}]/);
    expect(s).not.toMatch(/SERVICE_ROLE|supabaseAdmin|client\.server|process\.env/);
  });
});

describe("tenant context is never built per page", () => {
  it.each(CBT)("%s does not set x-organisation-id or pass organisation from the UI", (f) => {
    expect(src(f)).not.toMatch(/x-organisation-id|activeOrg\.id/);
  });
});

describe("staff release/marking controls are permission-gated (UX; DB re-checks)", () => {
  it("release card requires result.release, marking page requires result.mark", () => {
    expect(src("src/routes/cbt.results.$examId.tsx")).toMatch(/access\.data\?\.release && \(/);
    expect(src("src/routes/cbt.mark.$attemptId.tsx")).toMatch(/perm\.data !== true\) return/);
  });
});
