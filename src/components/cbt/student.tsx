import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AccountBar } from "@/components/auth/TenantGate";
import { describeStudentError, fetchStudentAccess } from "@/lib/cbt/student";

/** exam.take + linked student record, read from the DB. UX only — every RPC re-checks. */
export function useStudentAccess() {
  const q = useQuery({ queryKey: ["cbt", "student", "access"], queryFn: fetchStudentAccess, retry: false });
  return { canTake: q.data?.canTake === true && !!q.data?.studentId, studentId: q.data?.studentId ?? null, loading: q.isLoading, error: q.error };
}

export function StudentError({ error }: { error: unknown }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Something went wrong</AlertTitle>
      <AlertDescription>{describeStudentError(error)}</AlertDescription>
    </Alert>
  );
}

/** Candidate-facing shell: no staff/admin navigation or controls. */
export function StudentShell({ title, subtitle, aside, children }: { title: string; subtitle?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b-4 border-accent bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link to="/cbt/my" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-sm font-bold text-accent-foreground">AF</span>
            <span className="font-semibold">Aibinu Flexiprep · My Exams</span>
          </Link>
          <AccountBar />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {aside}
        </div>
        <div className="mt-6 space-y-6">{children}</div>
      </main>
    </div>
  );
}
