import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AccountBar } from "@/components/auth/TenantGate";
import { currentContext, fetchQuestionPermissions } from "@/lib/questionbank/api";
import {
  describeQuestionError,
  EMPTY_QUESTION_PERMISSIONS,
  SOURCE_LABEL,
  STATUS_LABEL,
  type ContentSource,
  type ContentStatus,
} from "@/lib/questionbank/permissions";

export function useQuestionAccess() {
  const perms = useQuery({ queryKey: ["questionbank", "perms"], queryFn: fetchQuestionPermissions, retry: false });
  const ctx = useQuery({ queryKey: ["questionbank", "ctx"], queryFn: currentContext, retry: false });
  return {
    perms: perms.data ?? EMPTY_QUESTION_PERMISSIONS,
    ctx: ctx.data ?? { userId: null, orgId: null },
    loading: perms.isLoading || ctx.isLoading,
    error: perms.error ?? ctx.error,
  };
}

export function QStatusBadge({ status }: { status: ContentStatus }) {
  const variant = status === "published" ? "default" : status === "approved" ? "secondary" : "outline";
  return <Badge variant={variant} className={status === "in_review" ? "border-accent bg-accent/30" : ""}>{STATUS_LABEL[status]}</Badge>;
}

export function QSourceBadge({ source }: { source: ContentSource }) {
  return (
    <Badge variant="outline" className={source === "ai" ? "border-accent" : ""}>
      {SOURCE_LABEL[source] ?? source}
    </Badge>
  );
}

export function QError({ error }: { error: unknown }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Action not completed</AlertTitle>
      <AlertDescription>{describeQuestionError(error)}</AlertDescription>
    </Alert>
  );
}

const navActive = { className: "underline decoration-accent decoration-2 underline-offset-4" };

export function QuestionBankShell({ title, subtitle, actions, children }: { title: string; subtitle: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b-4 border-accent bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-sm font-bold text-accent-foreground">AF</span>
            <span className="font-semibold">Aibinu Flexiprep · Question Bank</span>
          </Link>
          <nav className="flex flex-wrap gap-4 text-sm" aria-label="Question Bank">
            <Link to="/questionbank" activeOptions={{ exact: true }} activeProps={navActive}>Questions</Link>
            <Link to="/questionbank/new" activeProps={navActive}>New question</Link>
            <Link to="/questionbank/review" activeProps={navActive}>Review queue</Link>
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
