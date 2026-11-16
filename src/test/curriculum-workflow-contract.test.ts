// Contract tests for the Curriculum Bank review workflow client: database functions only,
// no direct table writes, no client-supplied organisation id.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const from = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a), from: (...a: unknown[]) => from(...a) } }));
const wf = await import("@/lib/curriculum/workflow");

describe("curriculum workflow client", () => {
  beforeEach(() => { rpc.mockReset(); from.mockReset(); });

  it("submitForReview calls the audited function with only version id and note", async () => {
    rpc.mockResolvedValue({ data: "in_review", error: null });
    await expect(wf.submitForReview("v1", "ready")).resolves.toBe("in_review");
    expect(rpc).toHaveBeenCalledWith("curriculum_submit_for_review", { p_version_id: "v1", p_note: "ready" });
  });

  it("reviewVersion passes the decision through", async () => {
    rpc.mockResolvedValue({ data: "changes_requested", error: null });
    await wf.reviewVersion("v1", "request_changes", "fix");
    expect(rpc).toHaveBeenCalledWith("curriculum_review_version", { p_version_id: "v1", p_decision: "request_changes", p_note: "fix" });
  });

  it("publishVersion returns the published timestamp", async () => {
    rpc.mockResolvedValue({ data: "2026-11-03T00:00:00Z", error: null });
    await expect(wf.publishVersion("v1")).resolves.toBe("2026-11-03T00:00:00Z");
  });

  it("surfaces database errors (e.g. separation of duties) instead of swallowing them", async () => {
    const err = { message: "The submitter cannot review their own submission" };
    rpc.mockResolvedValue({ data: null, error: err });
    await expect(wf.reviewVersion("v1", "approve")).rejects.toBe(err);
  });

  it("never touches tables and never sends an organisation id", async () => {
    rpc.mockResolvedValue({ data: "x", error: null });
    await wf.submitForReview("v1");
    expect(from).not.toHaveBeenCalled();
    const src = readFileSync("src/lib/curriculum/workflow.ts", "utf8");
    expect(src).not.toMatch(/\.from\(|\.(insert|update|upsert|delete)\(|organisation_id|SERVICE_ROLE|client\.server/);
  });
});
