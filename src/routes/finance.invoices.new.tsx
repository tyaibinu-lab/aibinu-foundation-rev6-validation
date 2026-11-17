import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FinanceShell } from "@/components/finance/FinanceShell";
import { FinanceError, Money, NoFinanceAccess, StudentPicker, useLiveFinanceAccess } from "@/components/finance/live";
import {
  createDraftInvoice,
  listPrices,
  listProducts,
  listSessions,
  validateDraftInvoice,
  type DraftItemInput,
  type StudentPick,
} from "@/lib/finance/live";

export const Route = createFileRoute("/finance/invoices/new")({
  head: () => ({
    meta: [
      { title: "New Invoice — Finance — Aibinu Flexiprep" },
      { name: "description", content: "Create a draft fee invoice for a student." },
      { property: "og:title", content: "New Invoice — Finance — Aibinu Flexiprep" },
      { property: "og:description", content: "Create a draft fee invoice for a student." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewInvoice,
});

const blank = (): DraftItemInput => ({ productId: "", quantity: 1, discountCode: "" });

function NewInvoice() {
  const access = useLiveFinanceAccess();
  const navigate = useNavigate();
  const products = useQuery({ queryKey: ["finance", "products"], queryFn: listProducts, retry: false, enabled: access.manage });
  const prices = useQuery({ queryKey: ["finance", "prices"], queryFn: listPrices, retry: false, enabled: access.manage });
  const sessions = useQuery({ queryKey: ["finance", "sessions"], queryFn: listSessions, retry: false, enabled: access.manage });

  const [student, setStudent] = useState<StudentPick | null>(null);
  const [sessionId, setSessionId] = useState("none");
  const [items, setItems] = useState<DraftItemInput[]>([blank()]);
  const [dueOn, setDueOn] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  const input = { studentId: student?.id ?? "", items, academicSessionId: sessionId === "none" ? null : sessionId, dueOn, notes };
  const create = useMutation({
    mutationFn: () => createDraftInvoice(input),
    onSuccess: (id) => void navigate({ to: "/finance/invoices/$invoiceId", params: { invoiceId: id } }),
  });

  if (access.loading) return <FinanceShell title="New invoice" subtitle="Checking access…"><span /></FinanceShell>;
  if (!access.manage) return <FinanceShell title="New invoice" subtitle=""><NoFinanceAccess need="finance.manage (bursar or administrator)" /></FinanceShell>;

  const active = (products.data ?? []).filter((p) => p.is_active);
  /** Indicative only: the database picks the exact price (session-specific first) and applies discounts and scholarships. */
  const indicative = (productId: string) => {
    const ps = (prices.data ?? []).filter((x) => x.product_id === productId && x.is_active);
    const sid = sessionId === "none" ? null : sessionId;
    return (ps.find((x) => x.academic_session_id === sid) ?? ps.find((x) => !x.academic_session_id))?.amount;
  };
  const setItem = (n: number, patch: Partial<DraftItemInput>) => setItems((xs) => xs.map((x, i) => (i === n ? { ...x, ...patch } : x)));

  return (
    <FinanceShell title="New invoice" subtitle="Creates a draft. Prices, discounts and scholarships are calculated by the finance system. Nothing is owed until you issue it.">
      <Button variant="outline" size="sm" asChild><Link to="/finance/invoices">← Invoices</Link></Button>
      {[products.error, prices.error, sessions.error, create.error].filter(Boolean).map((e, i) => <FinanceError key={i} error={e} />)}
      <Card>
        <CardHeader><CardTitle>Student</CardTitle></CardHeader>
        <CardContent><StudentPicker value={student} onChange={setStudent} /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Fees</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="max-w-xs space-y-1">
            <Label>Session</Label>
            <Select value={sessionId} onValueChange={setSessionId}>
              <SelectTrigger aria-label="Session"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No specific session</SelectItem>
                {(sessions.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {s.term}{s.is_current ? " (current)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {items.map((it, n) => {
            const est = it.productId ? indicative(it.productId) : undefined;
            return (
              <div key={n} className="grid items-end gap-3 rounded-md border border-border p-3 sm:grid-cols-[2fr_80px_1fr_auto]">
                <div className="space-y-1">
                  <Label>Fee {n + 1}</Label>
                  <Select value={it.productId} onValueChange={(v) => setItem(n, { productId: v })}>
                    <SelectTrigger aria-label={`Fee ${n + 1}`}><SelectValue placeholder="Choose a fee" /></SelectTrigger>
                    <SelectContent>{active.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                  {it.productId && <p className="text-xs text-muted-foreground">{est === undefined ? "No active price — the invoice will be refused." : <>List price <Money kobo={est} /></>}</p>}
                </div>
                <div className="space-y-1"><Label htmlFor={`qty-${n}`}>Qty</Label><Input id={`qty-${n}`} type="number" min={1} value={it.quantity} onChange={(e) => setItem(n, { quantity: Number(e.target.value) })} /></div>
                <div className="space-y-1"><Label htmlFor={`disc-${n}`}>Discount code</Label><Input id={`disc-${n}`} value={it.discountCode ?? ""} onChange={(e) => setItem(n, { discountCode: e.target.value })} placeholder="Optional" /></div>
                <Button variant="ghost" disabled={items.length === 1} onClick={() => setItems((xs) => xs.filter((_, i) => i !== n))}>Remove</Button>
              </div>
            );
          })}
          <Button variant="outline" onClick={() => setItems((xs) => [...xs, blank()])}>Add another fee</Button>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label htmlFor="due">Due date</Label><Input id="due" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} /><p className="text-xs text-muted-foreground">Leave empty to use the school default when issued.</p></div>
            <div className="space-y-1"><Label htmlFor="notes">Notes</Label><Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
          </div>
          {errors.length > 0 && <ul className="list-disc pl-5 text-destructive">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
          <Button
            disabled={create.isPending}
            onClick={() => { const e = validateDraftInvoice(input); setErrors(e); if (!e.length) create.mutate(); }}
          >{create.isPending ? "Creating…" : "Create draft invoice"}</Button>
        </CardContent>
      </Card>
    </FinanceShell>
  );
}
