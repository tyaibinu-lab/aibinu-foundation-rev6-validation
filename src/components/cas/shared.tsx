import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AccountBar } from "@/components/auth/TenantGate";
import { describeCasError, fetchCasAccess } from "@/lib/cas/api";

const navActive = { className: "underline underline-offset-4 font-semibold" };

/** UX only — learning_dashboard, RLS and every CAS function re-check access in the database. */
export function useCasAccess() {
  const q = useQuery({ queryKey: ["cas", "access"], queryFn: fetchCasAccess, retry: false });
  return { loading: q.isLoading, error: q.error, staff: !!q.data?.staff, manage: !!q.data?.manage, readAll: !!q.data?.readAll };
}

export function CasError({ error, title = "Action not completed" }: { error: unknown; title?: string }) {
  return <Alert variant="destructive"><AlertTitle>{title}</AlertTitle><AlertDescription>{describeCasError(error)}</AlertDescription></Alert>;
}

export const fmtDay = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-NG") : "—");
export const label = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export function LearningShell({ title, subtitle, actions, children }: { title: string; subtitle: string; actions?: ReactNode; children: ReactNode }) {
  const { staff } = useCasAccess();
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b-4 border-accent bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-sm font-bold text-accent-foreground">AF</span>
            <span className="font-semibold">Aibinu Flexiprep · Learning Progress</span>
          </Link>
          <nav className="flex flex-wrap gap-4 text-sm" aria-label="Learning">
            <Link to="/learning" activeOptions={{ exact: true }} activeProps={navActive}>{staff ? "Classes & support" : "Progress"}</Link>
            <Link to="/learning/reports" activeProps={navActive}>Reports</Link>
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

/** Horizontal bar for a 0–1 mastery value. Purely visual; the value comes from the database. */
export function MasteryBar({ value }: { value: number | null | undefined }) {
  const v = value === null || value === undefined ? null : Math.max(0, Math.min(1, Number(value)));
  return (
    <div className="flex items-center gap-2" aria-label={v === null ? "No data" : `${Math.round(v * 100)} percent`}>
      <div className="h-2 w-28 overflow-hidden rounded bg-muted">
        {v !== null && <div className={`h-full ${v < 0.5 ? "bg-destructive" : v < 0.65 ? "bg-accent" : "bg-primary"}`} style={{ width: `${v * 100}%` }} />}
      </div>
      <span className="w-10 text-right text-xs tabular-nums">{v === null ? "—" : `${Math.round(v * 100)}%`}</span>
    </div>
  );
}
