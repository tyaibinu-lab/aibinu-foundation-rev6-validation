// UNIT TESTS (no database). These check the client permission model and UI
// gating only. Database/RLS enforcement is proven by the Rev6 SQL suites
// (e.g. 30_rls_cross_tenant.sql, 50_reviewer_workflow.sql), not here.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { routeTree } from "@/routeTree.gen";
import { describeDbError, EMPTY_PERMISSIONS, NOTE_PERMISSIONS, noteCapabilities, type PermissionMap } from "@/lib/notebank/permissions";

const withPerms = (...granted: (keyof PermissionMap)[]): PermissionMap => {
  const p = { ...EMPTY_PERMISSIONS };
  for (const g of granted) p[g] = true;
  return p;
};

describe("NoteBank Rev6 permission contract (unit)", () => {
  it("uses exactly the authoritative Rev6 codes", () => {
    expect([...NOTE_PERMISSIONS]).toEqual([
      "academic.notes.read",
      "academic.notes.write",
      "academic.notes.review",
      "academic.notes.approve",
      "academic.notes.publish",
    ]);
  });

  it("A: teacher with academic.notes.write can author", () => {
    const c = noteCapabilities(withPerms("academic.notes.read", "academic.notes.write"));
    expect(c).toEqual({ canAuthor: true, canReview: false, canApprove: false, canPublish: false });
  });

  it("B/C: reviewer with review but without approve can review, not approve", () => {
    const c = noteCapabilities(withPerms("academic.notes.review"));
    expect(c.canReview).toBe(true);
    expect(c.canApprove).toBe(false);
  });

  it("D: approver with academic.notes.approve can approve (and sees the review queue)", () => {
    const c = noteCapabilities(withPerms("academic.notes.approve"));
    expect(c.canApprove).toBe(true);
    expect(c.canReview).toBe(true);
  });

  it("approval is never inferred from review or publish", () => {
    expect(noteCapabilities(withPerms("academic.notes.review", "academic.notes.publish")).canApprove).toBe(false);
  });

  it("E/F: publish/unpublish gated only by academic.notes.publish", () => {
    expect(noteCapabilities(withPerms("academic.notes.write", "academic.notes.review", "academic.notes.approve")).canPublish).toBe(false);
    expect(noteCapabilities(withPerms("academic.notes.publish")).canPublish).toBe(true);
  });

  it("maps Rev6 database errors", () => {
    for (const p of ["write", "review", "approve", "publish"]) {
      expect(describeDbError({ message: `Permission denied: academic.notes.${p} required` })).toContain(`academic.notes.${p}`);
    }
    expect(describeDbError({ message: "Only approved versions can be published (status: draft)" })).toMatch(/approved/);
    expect(describeDbError({ message: "Version not found or not a draft" })).toMatch(/no longer a draft/);
    expect(describeDbError({ code: "42501", message: "new row violates row-level security policy" })).toMatch(/refused/);
    expect(describeDbError({ code: "PGRST205", message: "Could not find the table" })).toMatch(/migrations/);
  });

  it("H: no legacy permission strings in NoteBank application code", () => {
    const legacy = /\b(note|question)\.(read|write|review|publish)\b|notebank\.manage|questions\.manage/;
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f) && !p.includes(`${join("src", "test")}`) && !f.endsWith("routeTree.gen.ts")) files.push(p);
      }
    };
    walk(join(process.cwd(), "src"));
    const hits = files.filter((f) => legacy.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });

  it("routes the NoteBank pages", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    for (const p of ["/notebank", "/notebank/review", "/notebank/abc"]) {
      expect(router.matchRoutes(p).at(-1)?.routeId).not.toBe(rootRouteId);
    }
  });
});
