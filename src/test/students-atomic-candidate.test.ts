// Source-contract checks only: NOT execution of PostgreSQL/RLS/concurrency.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("docs/migration-candidates/20261029010400_student_unlink_withdraw.sql", "utf8").replace(/\r\n/g, "\n");
function body(name: string) {
  const match = sql.match(new RegExp(`CREATE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`));
  if (!match) throw new Error(`Missing candidate function ${name}`);
  return match[0];
}
const unlink = body("unlink_student_guardian");
const withdraw = body("withdraw_enrolment");

describe("Unapplied student atomic SQL contracts", () => {
  it("rejects primary unlink while other links remain", () => {
    expect(unlink).toMatch(/IF v_primary AND EXISTS[\s\S]*sp\.id <> p_link_id[\s\S]*Make another guardian primary[\s\S]*ERRCODE = '22023'/);
    expect(unlink.indexOf("IF v_primary AND EXISTS")).toBeLessThan(unlink.indexOf("DELETE FROM public.student_parents"));
  });
  it("allows last-link removal without deleting parents or auto-promoting", () => {
    expect(unlink).toContain("DELETE FROM public.student_parents");
    expect(unlink).not.toMatch(/DELETE FROM public\.parents\b|UPDATE public\.student_parents|count\(\*\)\s*[<=>]/i);
  });
  it("uses server current date and rejects future starts", () => {
    expect(withdraw).toContain("ended_on = CURRENT_DATE");
    expect(withdraw).toMatch(/IF v_enrolled_on > CURRENT_DATE THEN[\s\S]*ERRCODE = '22023'/);
    expect(withdraw).not.toMatch(/p_ended_on|GREATEST|clock_timestamp/);
  });
  it("rejects stale withdrawal and only updates active enrolments", () => {
    expect(withdraw).toMatch(/IF v_status <> 'active' THEN[\s\S]*ERRCODE = '22023'/);
    expect(withdraw).toMatch(/UPDATE public\.enrolments[\s\S]*AND status = 'active';/);
  });
  it.each([
    [unlink, "student.manage", "guardian"],
    [withdraw, "class.manage", "class"],
  ])("keeps invoker, tenant/permission checks and existing lock (%s)", (fn, permission, lock) => {
    expect(fn).toContain("SECURITY INVOKER");
    expect(fn).toContain("public.current_org_id()");
    expect(fn).toContain(`public.has_permission('${permission}')`);
    const lockCall = `PERFORM public.lock_student_for_${lock}_op(v_student);`;
    expect(fn).toContain(lockCall);
    expect(fn.indexOf(`public.has_permission('${permission}')`)).toBeLessThan(fn.indexOf(lockCall));
    expect(fn.indexOf(lockCall)).toBeLessThan(fn.indexOf("FOR UPDATE"));
    expect(fn).toMatch(/IF NOT FOUND THEN[\s\S]*ERRCODE = '42501'/);
  });
  it("adds only two functions with authenticated-only execution and no schema/security redesign", () => {
    expect(sql.match(/^CREATE FUNCTION /gm)).toHaveLength(2);
    for (const name of ["unlink_student_guardian", "withdraw_enrolment"]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${name}(uuid) FROM PUBLIC, anon;`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${name}(uuid) TO authenticated;`);
    }
    expect(sql).not.toMatch(/CREATE OR REPLACE|SECURITY DEFINER|CREATE TABLE|CREATE POLICY|ALTER TABLE|TO service_role/i);
    expect(sql).toContain("BEGIN;\nSET LOCAL lock_timeout");
    expect(sql).toContain("COMMIT;");
  });
});