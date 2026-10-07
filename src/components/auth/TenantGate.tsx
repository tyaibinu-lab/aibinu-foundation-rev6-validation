import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth/AuthProvider";

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-background px-4">{children}</div>;
}

/**
 * Layout gate for tenant screens. Children (and therefore their queries) only
 * mount once a session exists AND an organisation is active, so no tenant data
 * is requested or shown while auth state is unknown. The database remains the
 * authority: this only avoids flashing UI and pointless requests.
 */
export function TenantGate() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const redirected = useRef(false);
  useEffect(() => {
    // Redirect once; the gate can stay mounted while /login loads, so never re-wrap /login.
    if (auth.status === "signed_out" && !redirected.current && !location.pathname.startsWith("/login")) {
      redirected.current = true;
      void navigate({ to: "/login", search: { redirect: location.href }, replace: true });
    }
    if (auth.status === "signed_in") redirected.current = false;
  }, [auth.status, location.href, location.pathname, navigate]);

  if (auth.status !== "signed_in" || auth.orgStatus === "idle" || auth.orgStatus === "loading") {
    return <Centered><p className="text-sm text-muted-foreground" role="status">Checking your sign-in…</p></Centered>;
  }

  if (auth.orgStatus === "error") {
    return (
      <Centered>
        <Card className="max-w-md"><CardHeader><CardTitle>Could not load your organisations</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Please try again. If this continues, contact your administrator.</p>
            <Button onClick={() => window.location.reload()}>Try again</Button>
          </CardContent>
        </Card>
      </Centered>
    );
  }

  if (auth.orgStatus === "none") {
    return (
      <Centered>
        <Card className="max-w-md"><CardHeader><CardTitle>No organisation access</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Your account ({auth.user?.email}) is not an active member of any organisation. Ask your school administrator to invite you.</p>
            <div className="flex gap-2">
              <Button variant="outline" asChild><Link to="/">Home</Link></Button>
              <Button onClick={() => void auth.signOut()}>Sign out</Button>
            </div>
          </CardContent>
        </Card>
      </Centered>
    );
  }

  if (auth.orgStatus === "choose" || !auth.activeOrg) {
    return (
      <Centered>
        <Card className="w-full max-w-md"><CardHeader><CardTitle>Choose an organisation</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Select onValueChange={auth.selectOrganisation}>
              <SelectTrigger aria-label="Organisation"><SelectValue placeholder="Select organisation" /></SelectTrigger>
              <SelectContent>{auth.organisations.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
            </Select>
          </CardContent>
        </Card>
      </Centered>
    );
  }

  // Remount the subtree on organisation change so no previous-tenant state survives.
  return <div key={auth.activeOrg.id}><Outlet /></div>;
}

/** Signed-in user, active organisation, switcher and sign-out — shown in module headers. */
export function AccountBar() {
  const auth = useAuth();
  const navigate = useNavigate();
  if (auth.status !== "signed_in") {
    return <Link to="/login" className="text-sm underline underline-offset-4">Sign in</Link>;
  }
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="opacity-90" title="Signed in">{auth.user?.email}</span>
      {auth.organisations.length > 1 ? (
        <Select value={auth.activeOrg?.id ?? ""} onValueChange={auth.selectOrganisation}>
          <SelectTrigger aria-label="Active organisation" className="h-8 w-48 bg-background text-foreground"><SelectValue placeholder="Organisation" /></SelectTrigger>
          <SelectContent>{auth.organisations.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
        </Select>
      ) : auth.activeOrg ? (
        <span className="rounded-full border border-current px-2 py-0.5 text-xs" aria-label="Active organisation">{auth.activeOrg.name}</span>
      ) : null}
      <Button
        size="sm"
        variant="secondary"
        onClick={async () => {
          await auth.signOut();
          void navigate({ to: "/login", replace: true });
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
