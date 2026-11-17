import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatKobo } from "@/lib/finance/currency";
import {
  describeFinanceError,
  fetchLiveFinanceAccess,
  searchStudents,
  type InvoiceStatus,
  type StudentPick,
} from "@/lib/finance/live";

/** Permission flags for showing controls. UX only — every read and write is re-checked by RLS / the RPC. */
export function useLiveFinanceAccess() {
  const q = useQuery({ queryKey: ["finance", "live", "access"], queryFn: fetchLiveFinanceAccess, retry: false });
  const a = q.data;
  return {
    loading: q.isLoading,
    error: q.error,
    staff: !!a?.viewAll,
    manage: !!a?.manage,
    approve: !!a?.approve,
    family: !!a?.read && !a?.viewAll,
    any: !!a && (a.read || a.viewAll || a.manage || a.approve),
  };
}

export function FinanceError({ error, title = "Action not completed" }: { error: unknown; title?: string }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{describeFinanceError(error)}</AlertDescription>
    </Alert>
  );
}

export function FinanceNotice({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">{children}</div>;
}

/** Shown when the account lacks the finance permission a page needs. RLS hides the data anyway. */
export function NoFinanceAccess({ need = "finance staff access" }: { need?: string }) {
  return <FinanceNotice>This page needs {need} in the active organisation.</FinanceNotice>;
}

export function Money({ kobo, className }: { kobo: number | string | bigint | null | undefined; className?: string }) {
  if (kobo === null || kobo === undefined) return <span className={className}>—</span>;
  return <span className={`tabular-nums ${className ?? ""}`}>{formatKobo(typeof kobo === "number" ? Math.trunc(kobo) : kobo)}</span>;
}

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft", issued: "Issued", partially_paid: "Part paid", paid: "Paid", void: "Void",
};
export function InvoiceStatusBadge({ status, overdue }: { status: InvoiceStatus; overdue?: boolean }) {
  if (overdue) return <Badge variant="destructive">Overdue</Badge>;
  const v = status === "paid" ? "default" : status === "void" ? "outline" : "secondary";
  return <Badge variant={v}>{STATUS_LABEL[status] ?? status}</Badge>;
}

export const fmtDay = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-NG") : "—");
export const fmtWhen = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-NG") : "—");
export const label = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Type-ahead student search through RLS. */
export function StudentPicker({ value, onChange }: { value: StudentPick | null; onChange: (s: StudentPick | null) => void }) {
  const [q, setQ] = useState("");
  const found = useQuery({ queryKey: ["finance", "student-search", q], queryFn: () => searchStudents(q), enabled: q.trim().length >= 2, retry: false });
  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-border p-2 text-sm">
        <span className="font-medium">{value.full_name}</span>
        {value.admission_no && <span className="text-muted-foreground">{value.admission_no}</span>}
        <button type="button" className="ml-auto text-primary underline underline-offset-4" onClick={() => onChange(null)}>Change</button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Input aria-label="Search student" placeholder="Type a name or admission number" value={q} onChange={(e) => setQ(e.target.value)} />
      {found.error && <FinanceError error={found.error} title="Search failed" />}
      {found.data && found.data.length === 0 && <p className="text-xs text-muted-foreground">No matching students.</p>}
      {!!found.data?.length && (
        <ul className="max-h-56 overflow-y-auto rounded-md border border-border text-sm">
          {found.data.map((s) => (
            <li key={s.id}>
              <button type="button" className="w-full px-3 py-2 text-left hover:bg-accent" onClick={() => onChange(s)}>
                {s.full_name} {s.admission_no && <span className="text-muted-foreground">· {s.admission_no}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
