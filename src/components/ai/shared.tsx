import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AccountBar } from "@/components/auth/TenantGate";
import { describeAiError, fetchAiAccess, type JobStatus } from "@/lib/ai/api";

const navActive = { className: "underline underline-offset-4 font-semibold" };

/** UX only — every request function re-checks ai.use, the authoring permission, plan and limits. */
export function useAiAccess() {
  const q = useQuery({ queryKey: ["ai", "access"], queryFn: fetchAiAccess, retry: false });
  return { loading: q.isLoading, error: q.error, ...(q.data ?? { use: false, manage: false, notesWrite: false, questionsWrite: false, cas: false }) };
}

export function AiError({ error, title = "AI request not accepted" }: { error: unknown; title?: string }) {
  return <Alert variant="destructive"><AlertTitle>{title}</AlertTitle><AlertDescription>{describeAiError(error)}</AlertDescription></Alert>;
}

const TONE: Record<JobStatus, "default" | "secondary" | "destructive" | "outline"> = {
  awaiting_approval: "secondary", queued: "secondary", running: "secondary", succeeded: "default",
  failed: "destructive", cancelled: "outline", expired: "outline", rejected: "outline",
};
export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <Badge variant={TONE[status] ?? "outline"}>{status.replace(/_/g, " ")}</Badge>;
}

export const fmtWhen = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-NG") : "—");
export const label = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export function AiShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const { manage } = useAiAccess();
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b-4 border-accent bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-sm font-bold text-accent-foreground">AF</span>
            <span className="font-semibold">Aibinu Flexiprep · AI Drafting</span>
          </Link>
          <nav className="flex flex-wrap gap-4 text-sm" aria-label="AI">
            <Link to="/ai" activeOptions={{ exact: true }} activeProps={navActive}>Request drafts</Link>
            {manage && <Link to="/ai/admin" activeProps={navActive}>Approvals & usage</Link>}
            <Link to="/notebank" activeProps={navActive}>NoteBank</Link>
            <Link to="/questionbank" activeProps={navActive}>Question Bank</Link>
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
