import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountBar } from "@/components/auth/TenantGate";
import {
  canManageMembers,
  describeOnboardingError,
  invitationState,
  inviteMember,
  joinLink,
  listInvitations,
  listMembers,
  listRoles,
  validateInvite,
} from "@/lib/onboarding/api";

export const Route = createFileRoute("/members/")({
  head: () => ({
    meta: [
      { title: "People & Invitations — Aibinu Flexiprep" },
      { name: "description", content: "See who belongs to your school and invite staff, students and parents." },
      { property: "og:title", content: "People & Invitations — Aibinu Flexiprep" },
      { property: "og:description", content: "See who belongs to your school and invite staff, students and parents." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Members,
});

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-NG");

function Members() {
  const qc = useQueryClient();
  const can = useQuery({ queryKey: ["members", "can-manage"], queryFn: canManageMembers, retry: false });
  const manage = can.data === true;
  const members = useQuery({ queryKey: ["members", "list"], queryFn: listMembers, retry: false });
  const roles = useQuery({ queryKey: ["members", "roles"], queryFn: listRoles, retry: false, enabled: manage });
  const invites = useQuery({ queryKey: ["members", "invites"], queryFn: listInvitations, retry: false, enabled: manage });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const invite = useMutation({
    mutationFn: () => inviteMember(email, role),
    onSuccess: (token) => {
      setLink({ email: email.trim().toLowerCase(), url: joinLink(token, window.location.origin) });
      setCopied(false); setEmail("");
      void qc.invalidateQueries({ queryKey: ["members", "invites"] });
    },
  });
  const roleName = (id: string) => roles.data?.find((r) => r.id === id)?.name ?? "—";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b-4 border-accent bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-sm font-bold text-accent-foreground">AF</span>
            <span className="font-semibold">Aibinu Flexiprep · People</span>
          </Link>
          <AccountBar />
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold">People & invitations</h1>
          <p className="mt-1 text-sm text-muted-foreground">Everyone with access to this school, and the role that decides what they can do.</p>
        </div>

        {manage && (
          <Card>
            <CardHeader><CardTitle>Invite someone</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
                <div className="space-y-1"><Label htmlFor="inv-email">E-mail</Label><Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teacher@example.com" /></div>
                <div className="space-y-1">
                  <Label>Role</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger aria-label="Role"><SelectValue placeholder="Choose a role" /></SelectTrigger>
                    <SelectContent>{(roles.data ?? []).map((r) => <SelectItem key={r.id} value={r.code}>{r.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Button disabled={invite.isPending} onClick={() => { const e = validateInvite(email, role); setErrors(e); if (!e.length) invite.mutate(); }}>{invite.isPending ? "Inviting…" : "Create invitation"}</Button>
              </div>
              <p className="text-xs text-muted-foreground">You can only invite people to roles whose permissions you hold yourself. Only an owner can invite another owner.</p>
              {errors.length > 0 && <ul className="list-disc pl-5 text-destructive">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
              {invite.error && <Alert variant="destructive"><AlertTitle>Not invited</AlertTitle><AlertDescription>{describeOnboardingError(invite.error)}</AlertDescription></Alert>}
              {link && (
                <Alert>
                  <AlertTitle>Invitation link for {link.email} — copy it now</AlertTitle>
                  <AlertDescription className="space-y-2">
                    <p>This link is shown only once and expires in 7 days. Send it to the person (WhatsApp, SMS or e-mail). They must sign in with <strong>{link.email}</strong> to accept it.</p>
                    <code className="block break-all rounded bg-muted p-2 text-xs">{link.url}</code>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={async () => { try { await navigator.clipboard.writeText(link.url); setCopied(true); } catch { setCopied(false); } }}>{copied ? "Copied" : "Copy link"}</Button>
                      <Button size="sm" variant="outline" asChild>
                        <a href={`https://wa.me/?text=${encodeURIComponent(`You have been invited to join our school on Aibinu Flexiprep: ${link.url}`)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setLink(null)}>Done</Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle>Members ({members.data?.length ?? 0})</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto text-sm">
            {members.error && <Alert variant="destructive"><AlertTitle>Could not load members</AlertTitle><AlertDescription>{describeOnboardingError(members.error)}</AlertDescription></Alert>}
            {!!members.data?.length && (
              <table className="w-full">
                <thead><tr className="border-b border-border text-left text-muted-foreground"><th className="py-2 pr-3">Name</th><th className="pr-3">Role</th><th className="pr-3">Status</th><th>Since</th></tr></thead>
                <tbody>
                  {members.data.map((m) => (
                    <tr key={m.id} className="border-b border-border">
                      <td className="py-2 pr-3">{m.fullName ?? "—"}</td>
                      <td className="pr-3">{m.roleName ?? "—"}</td>
                      <td className="pr-3"><Badge variant={m.status === "active" ? "default" : "outline"}>{m.status}</Badge></td>
                      <td>{fmtDay(m.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {manage && (
          <Card>
            <CardHeader><CardTitle>Invitations</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto text-sm">
              {invites.error && <Alert variant="destructive"><AlertTitle>Could not load invitations</AlertTitle><AlertDescription>{describeOnboardingError(invites.error)}</AlertDescription></Alert>}
              {invites.data?.length === 0 && <p className="text-muted-foreground">No invitations yet.</p>}
              {!!invites.data?.length && (
                <table className="w-full">
                  <thead><tr className="border-b border-border text-left text-muted-foreground"><th className="py-2 pr-3">E-mail</th><th className="pr-3">Role</th><th className="pr-3">Sent</th><th className="pr-3">Expires</th><th>State</th></tr></thead>
                  <tbody>
                    {invites.data.map((i) => {
                      const st = invitationState(i);
                      return (
                        <tr key={i.id} className="border-b border-border">
                          <td className="py-2 pr-3">{i.email}</td>
                          <td className="pr-3">{roleName(i.role_id)}</td>
                          <td className="pr-3">{fmtDay(i.created_at)}</td>
                          <td className="pr-3">{fmtDay(i.expires_at)}</td>
                          <td><Badge variant={st === "accepted" ? "default" : st === "open" ? "secondary" : "outline"}>{st}</Badge></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <p className="mt-3 text-xs text-muted-foreground">To resend, create a new invitation for the same e-mail; the old link stops working.</p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
