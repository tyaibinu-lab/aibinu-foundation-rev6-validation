// UNIT-LEVEL CONTRACT TESTS with a mocked Supabase client. They prove the student
// layer uses only Rev6 tables under RLS, never writes tenant/login fields on update,
// and validates input. Database enforcement (RLS, composite FKs) is the authority.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { kind: string; table?: string; fn?: string; args?: unknown; payload?: unknown; filters: unknown[][] };
const calls: Call[] = [];
const results: Record<string, { data: unknown; error: unknown; count?: number }> = {};
const empty = { data: null, error: null };

function builder(call: Call) {
  const b: Record<string, unknown> = {};
  const chain = (name: string) => (...a: unknown[]) => {
    if (name === "insert" || name === "update" || name === "delete") { call.kind = name; call.payload = a[0]; }
    else if (name !== "select" && name !== "single") call.filters.push([name, ...a]);
    return b;
  };
  for (const m of ["select", "insert", "update", "delete", "eq", "is", "or", "order", "range", "single"]) b[m] = chain(m);
  b["then"] = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(results[`${call.kind}:${call.table}`] ?? results[call.table ?? ""] ?? empty).then(res, rej);
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => { const c: Call = { kind: "select", table, filters: [] }; calls.push(c); return builder(c); },
    rpc: (fn: string, args?: unknown) => { calls.push({ kind: "rpc", fn, args, filters: [] }); return Promise.resolve(results[`rpc:${fn}`] ?? empty); },
  },
}));

const api = await import("@/lib/students/api");
const p = await import("@/lib/students/permissions");
const { routeTree } = await import("@/routeTree.gen");

const valid = { admissionNo: "AF/2026/001", fullName: "Ada Obi", dateOfBirth: "2012-03-04", gender: "female" as const, phone: "+234 801 234 5678", email: "ada@example.com", status: "active" as const };

beforeEach(() => { calls.length = 0; for (const k of Object.keys(results)) delete results[k]; });

describe("Student routes", () => {
  it.each(["/students", "/students/classes", "/students/abc"])("matches %s", (path) => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes(path).at(-1)?.routeId).not.toBe(rootRouteId);
  });
});

describe("Student permissions (UX mirror of RLS)", () => {
  const w = (...g: (keyof typeof p.EMPTY_STUDENT_PERMISSIONS)[]) => { const m = { ...p.EMPTY_STUDENT_PERMISSIONS }; g.forEach((x) => (m[x] = true)); return m; };
  it("uses exactly the Rev6 codes", () => expect([...p.STUDENT_PERMISSIONS]).toEqual(["student.read", "student.manage", "parent.manage", "class.manage"]));
  it("no permissions grants nothing", () => expect(Object.values(p.studentCapabilities(w())).some(Boolean)).toBe(false));
  it("student.read can read only", () => expect(p.studentCapabilities(w("student.read"))).toEqual({ canRead: true, canManageStudents: false, canManageGuardians: false, canManageClasses: false }));
  it("class assignment needs class.manage, not student.manage", () => {
    expect(p.studentCapabilities(w("student.manage")).canManageClasses).toBe(false);
    expect(p.studentCapabilities(w("class.manage")).canManageClasses).toBe(true);
  });
  it("guardian linking needs student.manage", () => expect(p.studentCapabilities(w("parent.manage")).canManageGuardians).toBe(false));
  it("checks each code via has_permission", async () => {
    results["rpc:has_permission"] = { data: true, error: null };
    await api.fetchStudentPermissions();
    expect(calls.filter((c) => c.fn === "has_permission").map((c) => (c.args as { perm: string }).perm).sort()).toEqual([...p.STUDENT_PERMISSIONS].sort());
  });
});

describe("Validation", () => {
  it("accepts a valid student", () => expect(p.validateStudent(valid, new Date("2026-10-10"))).toEqual([]));
  it("rejects a short name", () => expect(p.validateStudent({ ...valid, fullName: "A" })).toHaveLength(1));
  it("rejects a future date of birth", () => expect(p.validateStudent({ ...valid, dateOfBirth: "2030-01-01" }, new Date("2026-10-10"))[0]).toMatch(/future/));
  it("rejects bad email and admission number", () => expect(p.validateStudent({ ...valid, email: "x@", admissionNo: "A B" })).toHaveLength(2));
  it("guardian needs a phone or email", () =>
    expect(p.validateGuardian({ fullName: "Mr Obi", phone: "", email: "", whatsapp: "", relationship: "father", isPrimary: false })[0]).toMatch(/phone number or email/));
  it("search input cannot inject PostgREST filter syntax", () => expect(p.sanitizeSearch("a,b),id.eq.(x")).not.toMatch(/[,()]/));
  it("maps duplicate constraints to friendly messages", () => {
    expect(p.describeStudentError({ code: "23505", message: "duplicate key value violates unique constraint students_organisation_id_admission_no_key" })).toMatch(/admission number/);
    expect(p.describeStudentError({ code: "23505", message: "uq_one_active_enrolment" })).toMatch(/active class/);
    expect(p.describeStudentError({ code: "42501", message: "new row violates row-level security policy" })).toMatch(/permission/);
  });
});

describe("Tenant-safe data contract", () => {
  it("create sends organisation_id from current org; RLS WITH CHECK enforces it", async () => {
    results["insert:students"] = { data: { id: "s1" }, error: null };
    await api.createStudent("org-a", valid);
    const c = calls.find((x) => x.kind === "insert" && x.table === "students")!;
    expect((c.payload as { organisation_id: string }).organisation_id).toBe("org-a");
    expect(c.payload).not.toHaveProperty("user_id");
  });
  it("update never sends organisation_id or user_id", async () => {
    results["update:students"] = { data: { id: "s1" }, error: null };
    await api.updateStudent("s1", valid);
    const c = calls.find((x) => x.kind === "update")!;
    expect(c.payload).not.toHaveProperty("organisation_id");
    expect(c.payload).not.toHaveProperty("user_id");
  });
  it("directory excludes soft-deleted students and paginates", async () => {
    results["students"] = { data: [], error: null, count: 0 };
    await api.listStudents({ page: 2 });
    const c = calls.find((x) => x.table === "students")!;
    expect(c.filters).toContainEqual(["is", "deleted_at", null]);
    expect(c.filters).toContainEqual(["range", 40, 59]);
  });
  const directWrites = () =>
    calls.filter((c) => ["insert", "update", "delete"].includes(c.kind) && ["parents", "student_parents", "enrolments"].includes(c.table ?? ""));
  it("assignClass calls assign_student_class exactly once with no direct writes", async () => {
    await api.assignClass("org-a", "s1", { id: "c-new", name: "SS2 A", academic_session_id: "sess", capacity: null });
    const rpcs = calls.filter((c) => c.kind === "rpc");
    expect(rpcs).toEqual([{ kind: "rpc", fn: "assign_student_class", args: { p_student_id: "s1", p_class_id: "c-new" }, filters: [] }]);
    expect(calls.filter((c) => c.table === "enrolments")).toEqual([]);
  });
  it("assignClass propagates the database 'already in this class' error", async () => {
    results["rpc:assign_student_class"] = { data: null, error: { message: "The student is already in this class" } };
    await expect(api.assignClass("org-a", "s1", { id: "c1", name: "x", academic_session_id: "sess", capacity: null })).rejects.toThrow(/already in this class/);
  });
  it("setPrimaryGuardian calls set_primary_guardian exactly once", async () => {
    await api.setPrimaryGuardian("s1", "l2");
    const rpcs = calls.filter((c) => c.kind === "rpc");
    expect(rpcs).toEqual([{ kind: "rpc", fn: "set_primary_guardian", args: { p_student_id: "s1", p_link_id: "l2" }, filters: [] }]);
    expect(directWrites()).toEqual([]);
  });
  it("setPrimaryGuardian propagates RPC errors", async () => {
    results["rpc:set_primary_guardian"] = { data: null, error: { message: "Permission denied: student.manage required" } };
    await expect(api.setPrimaryGuardian("s1", "l2")).rejects.toThrow(/Permission denied/);
  });
  it("addGuardian calls add_student_guardian once with normalized values and no org id", async () => {
    await api.addGuardian("org-a", "s1", { fullName: "  Bola Obi ", phone: " ", email: "b@x.com", whatsapp: "", relationship: "mother", isPrimary: true });
    const rpcs = calls.filter((c) => c.kind === "rpc");
    expect(rpcs).toHaveLength(1);
    expect(rpcs[0].fn).toBe("add_student_guardian");
    expect(rpcs[0].args).toEqual({ p_student_id: "s1", p_full_name: "Bola Obi", p_phone: null, p_email: "b@x.com", p_whatsapp: null, p_relationship: "mother", p_is_primary: true });
    expect(directWrites()).toEqual([]);
  });
  it("addGuardian propagates RPC errors without fallback writes", async () => {
    results["rpc:add_student_guardian"] = { data: null, error: { message: "Permission denied: student.manage and parent.manage required" } };
    await expect(api.addGuardian("org-a", "s1", { fullName: "Bola Obi", phone: "1", email: "", whatsapp: "", relationship: "mother", isPrimary: false })).rejects.toThrow(/Permission denied/);
    expect(directWrites()).toEqual([]);
  });
  it("student module never uses the service-role client or admin keys", () => {
    const files: string[] = [];
    const walk = (d: string) => readdirSync(d).forEach((f) => { const x = join(d, f); statSync(x).isDirectory() ? walk(x) : files.push(x); });
    ["src/lib/students", "src/components/students"].forEach((d) => walk(join(process.cwd(), d)));
    files.push(...readdirSync("src/routes").filter((f) => f.startsWith("students")).map((f) => join("src/routes", f)));
    for (const f of files) expect(readFileSync(f, "utf8")).not.toMatch(/client\.server|SERVICE_ROLE|supabaseAdmin/);
  });
});
