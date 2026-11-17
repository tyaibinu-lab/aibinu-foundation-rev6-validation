import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FinanceShell } from "@/components/finance/FinanceShell";
import { FinanceError, Money, NoFinanceAccess, fmtDay, label, useLiveFinanceAccess } from "@/components/finance/live";
import {
  PRODUCT_TYPES,
  createPrice,
  createProduct,
  listPrices,
  listProducts,
  listSessions,
  setPriceActive,
  setProductActive,
  validateProduct,
  type ProductType,
} from "@/lib/finance/live";

export const Route = createFileRoute("/finance/catalogue")({
  head: () => ({
    meta: [
      { title: "Fee Catalogue — Finance — Aibinu Flexiprep" },
      { name: "description", content: "School fees and their prices for each session." },
      { property: "og:title", content: "Fee Catalogue — Finance — Aibinu Flexiprep" },
      { property: "og:description", content: "School fees and their prices for each session." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Catalogue,
});

function Catalogue() {
  const access = useLiveFinanceAccess();
  const qc = useQueryClient();
  const products = useQuery({ queryKey: ["finance", "products"], queryFn: listProducts, retry: false, enabled: access.any });
  const prices = useQuery({ queryKey: ["finance", "prices"], queryFn: listPrices, retry: false, enabled: access.any });
  const sessions = useQuery({ queryKey: ["finance", "sessions"], queryFn: listSessions, retry: false, enabled: access.manage });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["finance"] });

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<ProductType>("tuition");
  const [errors, setErrors] = useState<string[]>([]);
  const addProduct = useMutation({
    mutationFn: () => createProduct({ code, name, type }),
    onSuccess: () => { setCode(""); setName(""); refresh(); },
  });

  const [priceFor, setPriceFor] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [sessionId, setSessionId] = useState<string>("any");
  const addPrice = useMutation({
    mutationFn: () => createPrice({ productId: priceFor, amountNaira: amount, academicSessionId: sessionId === "any" ? null : sessionId }),
    onSuccess: () => { setAmount(""); refresh(); },
  });
  const toggleProduct = useMutation({ mutationFn: (p: { id: string; on: boolean }) => setProductActive(p.id, p.on), onSuccess: refresh });
  const togglePrice = useMutation({ mutationFn: (p: { id: string; on: boolean }) => setPriceActive(p.id, p.on), onSuccess: refresh });

  if (access.loading) return <FinanceShell title="Fee catalogue" subtitle="Checking access…"><span /></FinanceShell>;
  if (!access.any) return <FinanceShell title="Fee catalogue" subtitle=""><NoFinanceAccess /></FinanceShell>;

  const sessionName = (id: string | null) => (id ? sessions.data?.find((s) => s.id === id)?.name ?? "Session" : "Any session");

  return (
    <FinanceShell title="Fee catalogue" subtitle="Fees the school charges, with a price for each session. Invoices use the active price automatically.">
      {[products.error, prices.error, addProduct.error, addPrice.error, toggleProduct.error, togglePrice.error].filter(Boolean).map((e, i) => <FinanceError key={i} error={e} />)}

      {access.manage && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Add a fee</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label htmlFor="fee-code">Code</Label><Input id="fee-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="TUITION-SS2" /></div>
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select value={type} onValueChange={(v) => setType(v as ProductType)}>
                    <SelectTrigger aria-label="Fee type"><SelectValue /></SelectTrigger>
                    <SelectContent>{PRODUCT_TYPES.map((t) => <SelectItem key={t} value={t}>{label(t)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1"><Label htmlFor="fee-name">Name</Label><Input id="fee-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="SS2 Tuition" /></div>
              {errors.length > 0 && <ul className="list-disc pl-5 text-destructive">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
              <Button
                disabled={addProduct.isPending}
                onClick={() => { const e = validateProduct({ code, name, type }); setErrors(e); if (!e.length) addProduct.mutate(); }}
              >{addProduct.isPending ? "Saving…" : "Add fee"}</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Set a price</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="space-y-1">
                <Label>Fee</Label>
                <Select value={priceFor} onValueChange={setPriceFor}>
                  <SelectTrigger aria-label="Fee to price"><SelectValue placeholder="Choose a fee" /></SelectTrigger>
                  <SelectContent>{(products.data ?? []).filter((p) => p.is_active).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label htmlFor="price-amt">Amount (₦)</Label><Input id="price-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="45,000.00" /></div>
                <div className="space-y-1">
                  <Label>Session</Label>
                  <Select value={sessionId} onValueChange={setSessionId}>
                    <SelectTrigger aria-label="Session"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any session</SelectItem>
                      {(sessions.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {s.term}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button disabled={!priceFor || !amount.trim() || addPrice.isPending} onClick={() => addPrice.mutate()}>{addPrice.isPending ? "Saving…" : "Save price"}</Button>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Fees ({products.data?.length ?? 0})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {products.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {products.data?.length === 0 && <p className="text-sm text-muted-foreground">No fees yet.</p>}
          {!!products.data?.length && (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-muted-foreground"><th className="py-2 pr-3">Fee</th><th className="pr-3">Code</th><th className="pr-3">Type</th><th className="pr-3">Prices</th><th>Status</th></tr></thead>
              <tbody>
                {products.data.map((p) => {
                  const ps = (prices.data ?? []).filter((x) => x.product_id === p.id);
                  return (
                    <tr key={p.id} className="border-b border-border align-top">
                      <td className="py-2 pr-3 font-medium">{p.name}</td>
                      <td className="pr-3">{p.code}</td>
                      <td className="pr-3">{label(p.type)}</td>
                      <td className="pr-3">
                        {ps.length === 0 ? <span className="text-muted-foreground">No price</span> : (
                          <ul className="space-y-1">
                            {ps.map((x) => (
                              <li key={x.id} className={x.is_active ? "" : "text-muted-foreground line-through"}>
                                <Money kobo={x.amount} /> · {sessionName(x.academic_session_id)}
                                {(x.valid_from || x.valid_to) && <> · {fmtDay(x.valid_from)} – {fmtDay(x.valid_to)}</>}
                                {access.manage && (
                                  <button type="button" className="ml-2 text-xs text-primary underline" onClick={() => togglePrice.mutate({ id: x.id, on: !x.is_active })}>
                                    {x.is_active ? "Retire" : "Restore"}
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td>
                        {p.is_active ? "Active" : "Inactive"}
                        {access.manage && (
                          <button type="button" className="ml-2 text-xs text-primary underline" onClick={() => toggleProduct.mutate({ id: p.id, on: !p.is_active })}>
                            {p.is_active ? "Deactivate" : "Activate"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </FinanceShell>
  );
}
