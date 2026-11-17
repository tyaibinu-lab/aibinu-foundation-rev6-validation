import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  acceptInvitation,
  createOrganisation,
  describeOnboardingError,
  enterOrganisation,
  extractToken,
  slugify,
  validateOrganisation,
} from "@/lib/onboarding/api";

// Deliberately outside the tenant gate: a signed-in user with NO organisation must be able to reach it.
// It only calls create_organisation / accept_invitation, which need no active organisation.
export const Route = createFileRoute("/welcome")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { token?: string } => (typeof s["token"] === "string" ? { token: s["token"] } : {}),
  head: () => ({
    meta: [
      { title: "Get Started — Aibinu Flexiprep" },
      { name: "description", content: "Set up your school on Aibinu Flexiprep or join one with an invitation." },
      { property: "og:title", content: "Get Started — Aibinu Flexiprep" },
      { property: "og:description", content: "Set up your school on Aibinu Flexiprep or join one with an invitation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Welcome,
});

function Welcome() {
  const auth = useAuth();
  const { token } = Route.useSearch();
  const here = token ? `/welcome?token=${encodeURIComponent(token)}` : "/welcome";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b-4 border-accent bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-sm font-bold text-accent-foreground">AF</span>
            <span className="font-semibold">Aibinu Flexiprep · Get started</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        {auth.status === "loading" && <p className="text-sm text-muted-foreground" role="status">Checking your sign-in…</p>}
        {auth.status === "signed_out" && (
          <Card>
            <CardHeader><CardTitle>Sign in first</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>Sign in with the e-mail address your invitation was sent to (or the account that will own the new school).</p>
              <Button asChild><Link to="/login" search={{ redirect: here }}>Sign in</Link></Button>
            </CardContent>
          </Card>
        )}
        {auth.status === "signed_in" && (
          <>
            <p className="text-sm text-muted-foreground">Signed in as {auth.user?.email}.</p>
            <JoinCard initial={token ?? ""} />
            {!token && <CreateCard />}
          </>
        )}
      </main>
    </div>
  );
}

function JoinCard({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const token = extractToken(value);
  const join = useMutation({ mutationFn: () => acceptInvitation(token!), onSuccess: (orgId) => enterOrganisation(orgId) });
  return (
    <Card>
      <CardHeader><CardTitle>Join a school with an invitation</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="space-y-1">
          <Label htmlFor="token">Invitation link or code</Label>
          <Input id="token" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Paste the link you were sent" />
          {value && !token && <p className="text-xs text-destructive">That does not look like an invitation link.</p>}
        </div>
        {join.error && <Alert variant="destructive"><AlertTitle>Could not join</AlertTitle><AlertDescription>{describeOnboardingError(join.error)}</AlertDescription></Alert>}
        <Button disabled={!token || join.isPending} onClick={() => join.mutate()}>{join.isPending ? "Joining…" : "Accept invitation"}</Button>
      </CardContent>
    </Card>
  );
}

function CreateCard() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [type, setType] = useState<"school" | "individual">("school");
  const [errors, setErrors] = useState<string[]>([]);
  const effectiveSlug = slugTouched ? slug : slugify(name);
  const create = useMutation({
    mutationFn: () => createOrganisation({ name, slug: effectiveSlug, type }),
    onSuccess: (orgId) => enterOrganisation(orgId),
  });
  return (
    <Card>
      <CardHeader><CardTitle>Set up a new school</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">You will be the owner. You can invite staff, students and parents afterwards.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="org-name">School name</Label><Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Progressive Senior Secondary School" /></div>
          <div className="space-y-1">
            <Label htmlFor="org-slug">Short name (used in links)</Label>
            <Input id="org-slug" value={effectiveSlug} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()); }} placeholder="progressive-sss" />
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as "school" | "individual")}>
              <SelectTrigger aria-label="Organisation type"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="school">School</SelectItem><SelectItem value="individual">Individual tutor</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        {errors.length > 0 && <ul className="list-disc pl-5 text-destructive">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        {create.error && <Alert variant="destructive"><AlertTitle>Not created</AlertTitle><AlertDescription>{describeOnboardingError(create.error)}</AlertDescription></Alert>}
        <Button
          disabled={create.isPending}
          onClick={() => { const e = validateOrganisation({ name, slug: effectiveSlug, type }); setErrors(e); if (!e.length) create.mutate(); }}
        >{create.isPending ? "Creating…" : "Create school"}</Button>
      </CardContent>
    </Card>
  );
}
