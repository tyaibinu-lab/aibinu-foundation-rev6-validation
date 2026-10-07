import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AccountBar } from "@/components/auth/TenantGate";
import { currentContext, fetchPermissions } from "@/lib/notebank/api";
import { describeDbError, EMPTY_PERMISSIONS, STATUS_LABEL, type ContentStatus } from "@/lib/notebank/permissions";

export function useNoteAccess() {
  const perms = useQuery({ queryKey: ["notebank", "perms"], queryFn: fetchPermissions, retry: false });
  const ctx = useQuery({ queryKey: ["notebank", "ctx"], queryFn: currentContext, retry: false });
  return {
    perms: perms.data ?? EMPTY_PERMISSIONS,
    ctx: ctx.data ?? { userId: null, orgId: null },
    loading: perms.isLoading || ctx.isLoading,
    error: perms.error ?? ctx.error,
  };
}

export function StatusBadge({ status }: { status: ContentStatus }) {
  const variant = status === "published" ? "default" : status === "approved" ? "secondary" : "outline";
  return <Badge variant={variant} className={status === "in_review" ? "border-accent bg-accent/30" : ""}>{STATUS_LABEL[status]}</Badge>;
}

export function SourceBadge({ source }: { source: string }) {
  if (source !== "ai") return null;
  return <Badge variant="outline" className="border-accent">AI draft</Badge>;
}

export function DbError({ error }: { error: unknown }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Action not completed</AlertTitle>
      <AlertDescription>{describeDbError(error)}</AlertDescription>
    </Alert>
  );
}

export function NoteBankShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b-4 border-accent bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-sm font-bold text-accent-foreground">AF</span>
            <span className="font-semibold">Aibinu Flexiprep · NoteBank</span>
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link to="/notebank" activeOptions={{ exact: true }} activeProps={{ className: "underline decoration-accent decoration-2 underline-offset-4" }}>Teacher workspace</Link>
            <Link to="/notebank/review" activeProps={{ className: "underline decoration-accent decoration-2 underline-offset-4" }}>Reviewer workspace</Link>
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
