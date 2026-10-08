import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AccountBar } from "@/components/auth/TenantGate";
import { canCreateExams, describeCbtError, type ExamStatus } from "@/lib/cbt/api";

const navActive = { className: "underline underline-offset-4 font-semibold" };

/** exam.create check for UX only — the database enforces it on every write and RPC. */
export function useExamAccess() {
  const q = useQuery({ queryKey: ["cbt", "perm", "exam.create"], queryFn: canCreateExams, retry: false });
  return { canCreate: q.data === true, loading: q.isLoading, error: q.error };
}

export function CbtError({ error }: { error: unknown }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Action not completed</AlertTitle>
      <AlertDescription>{describeCbtError(error)}</AlertDescription>
    </Alert>
  );
}

export function ExamStatusBadge({ status }: { status: ExamStatus }) {
  const v = status === "published" ? "default" : status === "draft" ? "secondary" : "outline";
  return <Badge variant={v}>{status[0]!.toUpperCase() + status.slice(1)}</Badge>;
}

export const fmtDate = (iso: string) => new Date(iso).toLocaleString();

export function CbtShell({ title, subtitle, actions, children }: { title: string; subtitle: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b-4 border-accent bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-sm font-bold text-accent-foreground">AF</span>
            <span className="font-semibold">Aibinu Flexiprep · CBT Exams</span>
          </Link>
          <nav className="flex flex-wrap gap-4 text-sm" aria-label="CBT">
            <Link to="/cbt" activeOptions={{ exact: true }} activeProps={navActive}>Exams</Link>
            <Link to="/cbt/new" activeProps={navActive}>New exam</Link>
            <Link to="/questionbank" activeProps={navActive}>Question Bank</Link>
          </nav>
          <AccountBar />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>
          {actions}
        </div>
        <div className="mt-6 space-y-6">{children}</div>
      </main>
    </div>
  );
}
