import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { safeRedirect } from "@/lib/auth/org-context";

export const Route = createFileRoute("/login")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { redirect?: string } =>
    typeof s['redirect'] === "string" ? { redirect: s['redirect'] } : {},
  head: () => ({
    meta: [
      { title: "Sign in — Aibinu Flexiprep" },
      { name: "description", content: "Sign in to the Aibinu Flexiprep learning platform." },
      { property: "og:title", content: "Sign in — Aibinu Flexiprep" },
      { property: "og:description", content: "Sign in to the Aibinu Flexiprep learning platform." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { redirect } = Route.useSearch();
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = safeRedirect(redirect);

  useEffect(() => {
    if (auth.status === "signed_in") void navigate({ to: target, replace: true });
  }, [auth.status, navigate, target]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    setPassword(""); // never keep the password in app state after the attempt
    if (err) setError(err.message === "Invalid login credentials" ? "Email or password is incorrect." : "Sign-in failed. Please try again.");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">AF</div>
          <CardTitle>Sign in to Aibinu Flexiprep</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-1">
              <Label htmlFor="login-email">Email</Label>
              <Input id="login-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="login-password">Password</Label>
              <Input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} required />
            </div>
            {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
            <p className="text-center text-xs text-muted-foreground"><Link to="/" className="underline">Back to home</Link></p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
