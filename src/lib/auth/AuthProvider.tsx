import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  applyOrgHeader,
  loadMyOrganisations,
  readOrgPreference,
  resolveActiveOrg,
  writeOrgPreference,
  type OrgOption,
} from "./org-context";

export type AuthStatus = "loading" | "signed_out" | "signed_in";
export type OrgStatus = "idle" | "loading" | "none" | "choose" | "ready" | "error";

export interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  orgStatus: OrgStatus;
  organisations: OrgOption[];
  activeOrg: OrgOption | null;
  orgError: unknown;
  selectOrganisation: (orgId: string) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [orgStatus, setOrgStatus] = useState<OrgStatus>("idle");
  const [organisations, setOrganisations] = useState<OrgOption[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [orgError, setOrgError] = useState<unknown>(null);
  const loadedFor = useRef<string | null>(null);

  const clearTenant = useCallback(() => {
    applyOrgHeader(null);
    loadedFor.current = null;
    setOrganisations([]);
    setActiveOrgId(null);
    setOrgStatus("idle");
    setOrgError(null);
  }, []);

  const resolveOrgs = useCallback(async (userId: string) => {
    if (loadedFor.current === userId) return;
    loadedFor.current = userId;
    applyOrgHeader(null);
    setOrgStatus("loading");
    try {
      const orgs = await loadMyOrganisations(userId);
      setOrganisations(orgs);
      const r = resolveActiveOrg(orgs, readOrgPreference());
      if (r.kind === "selected") {
        applyOrgHeader(r.orgId); // header set BEFORE tenant screens render
        setActiveOrgId(r.orgId);
        setOrgStatus("ready");
      } else {
        setActiveOrgId(null);
        setOrgStatus(r.kind);
      }
    } catch (e) {
      loadedFor.current = null;
      setOrgError(e);
      setOrgStatus("error");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const handle = (s: Session | null) => {
      if (!alive) return;
      setSession(s);
      if (s?.user) {
        setStatus("signed_in");
        void resolveOrgs(s.user.id);
      } else {
        setStatus("signed_out");
        clearTenant();
      }
    };
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_OUT") {
        queryClient.clear();
        handle(null);
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED" || event === "INITIAL_SESSION") {
        if (event === "SIGNED_IN" && s?.user && loadedFor.current && loadedFor.current !== s.user.id) {
          queryClient.clear();
          clearTenant();
        }
        handle(s);
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [clearTenant, queryClient, resolveOrgs]);

  const selectOrganisation = useCallback(
    (orgId: string) => {
      if (!organisations.some((o) => o.id === orgId)) return; // only the user's own orgs; DB re-checks anyway
      void queryClient.cancelQueries();
      queryClient.clear(); // drop every tenant-scoped cache so no stale data from the previous org remains
      applyOrgHeader(orgId);
      writeOrgPreference(orgId);
      setActiveOrgId(orgId);
      setOrgStatus("ready");
    },
    [organisations, queryClient],
  );

  const signOut = useCallback(async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    clearTenant();
    await supabase.auth.signOut();
  }, [clearTenant, queryClient]);

  const value: AuthContextValue = {
    status,
    session,
    user: session?.user ?? null,
    orgStatus,
    organisations,
    activeOrg: organisations.find((o) => o.id === activeOrgId) ?? null,
    orgError,
    selectOrganisation,
    signOut,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
