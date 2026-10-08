// Gate 8G-5 — audit.read stays Owner-only (Revision 6 canonical model, decision: keep).
// Live behaviour is proven by the Gate 8G-5 validation run; this locks the contract.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dir = "supabase/migrations";
const all = readdirSync(dir).map((f) => readFileSync(`${dir}/${f}`, "utf8").replace(/\s+/g, " "));
const base = all.find((s) => s.includes("Role -> permission mapping")) ?? "";

describe("Gate 8G-5 audit read RBAC", () => {
  it("School Administrator mapping excludes audit.read", () => {
    expect(base).toContain("WHERE code NOT IN ('role.manage', 'settings.manage', 'audit.read')");
  });
  it("audit_events is readable only through can_read_audit(organisation_id)", () => {
    expect(base).toMatch(/CREATE POLICY audit_read ON public\.audit_events FOR SELECT TO authenticated/);
    expect(base).toContain("p_org_id = public.current_org_id() AND public.has_permission('audit.read')");
  });
  it("no later migration grants audit.read to another role", () => {
    const later = all.filter((s) => s !== base);
    expect(later.some((s) => /audit\.read/.test(s) && /role_permissions/i.test(s))).toBe(false);
  });
});
