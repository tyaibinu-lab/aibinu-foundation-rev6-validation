import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AccountBar } from "@/components/auth/TenantGate";
import { currentOrgId, fetchStudentPermissions } from "@/lib/students/api";
import { describeStudentError, EMPTY_STUDENT_PERMISSIONS, STATUS_LABEL, studentCapabilities, type PersonStatus } from "@/lib/students/permissions";

export function useStudentAccess() {
  const perms = useQuery({ queryKey: ["students", "perms"], queryFn: fetchStudentPermissions, retry: false });
  const org = useQuery({ queryKey: ["students", "org"], queryFn: currentOrgId, retry: false });
  return {
    caps: studentCapabilities(perms.data ?? EMPTY_STUDENT_PERMISSIONS),
    perms: perms.data ?? EMPTY_STUDENT_PERMISSIONS,
    orgId: org.data ?? null,
    loading: perms.isLoading || org.isLoading,
    error: perms.error ?? org.error,
  };
}

export function PersonStatusBadge({ status }: { status: PersonStatus }) {
  return <Badge variant={status === "active" ? "default" : "outline"}>{STATUS_LABEL[status] ?? status}</Badge>;
}

export function StudentError({ error }: { error: unknown }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Action not completed</AlertTitle>
      <AlertDescription>{describeStudentError(error)}</AlertDescription>
    </Alert>
  );
}

export function FormErrors({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <Alert variant="destructive">
      <AlertTitle>Please fix the following</AlertTitle>
      <AlertDescription><ul className="list-disc pl-4">{errors.map((e) => <li key={e}>{e}</li>)}</ul></AlertDescription>
    </Alert>
  );
}

const active = { className: "underline decoration-accent decoration-2 underline-offset-4" };

export function StudentShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b-4 border-accent bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-sm font-bold text-accent-foreground">AF</span>
            <span className="font-semibold">Aibinu Flexiprep · Students</span>
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link to="/students" activeOptions={{ exact: true }} activeProps={active}>Directory</Link>
            <Link to="/students/classes" activeProps={active}>Class rosters</Link>
          </nav>
          <AccountBar />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        <div className="mt-6 space-y-6">{children}</div>
      </main>
    </div>
  );
}
