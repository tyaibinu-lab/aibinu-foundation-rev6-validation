import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

// Verified Rev6 finance permission codes (migration 001 catalogue). Role mappings live
// only in the database. Everything here is UX only: RLS and SECURITY DEFINER checks in
// migration 006 decide every finance read and write.
export const FINANCE_PERMISSIONS = ["finance.read", "finance.view_all", "finance.manage", "finance.approve"] as const;
export type FinancePermission = (typeof FINANCE_PERMISSIONS)[number];
export type FinancePermissionMap = Record<FinancePermission, boolean>;

export const EMPTY_FINANCE_PERMISSIONS: FinancePermissionMap = {
  "finance.read": false,
  "finance.view_all": false,
  "finance.manage": false,
  "finance.approve": false,
};

export interface FinanceCapabilities {
  /** May see the Finance entry in navigation. Grants no data access. */
  canSeeFinanceNav: boolean;
  /** Staff overview of the whole organisation (finance.view_all). */
  canViewOrgOverview: boolean;
  /** Own / ward's records only (finance.read without view_all). */
  canViewOwnRecords: boolean;
  /** Future: products, invoices, manual payments. */
  canManage: boolean;
  /** Future: refunds, write-offs, price overrides. */
  canApprove: boolean;
}

export function financeCapabilities(p: FinancePermissionMap): FinanceCapabilities {
  const any = FINANCE_PERMISSIONS.some((k) => p[k]);
  return {
    canSeeFinanceNav: any,
    canViewOrgOverview: p["finance.view_all"],
    canViewOwnRecords: p["finance.read"] && !p["finance.view_all"],
    canManage: p["finance.manage"],
    canApprove: p["finance.approve"],
  };
}

/** Uses the existing has_permission() check (same mechanism as Students). Read-only. */
export async function fetchFinancePermissions(): Promise<FinancePermissionMap> {
  const out = { ...EMPTY_FINANCE_PERMISSIONS };
  await Promise.all(
    FINANCE_PERMISSIONS.map(async (perm) => {
      const res = await supabase.rpc("has_permission", { perm } as never);
      if (res.error) throw res.error;
      out[perm] = res.data === true;
    }),
  );
  return out;
}

export function useFinanceAccess() {
  const q = useQuery({ queryKey: ["finance", "perms"], queryFn: fetchFinancePermissions, retry: false });
  const perms = q.data ?? EMPTY_FINANCE_PERMISSIONS;
  return { perms, caps: financeCapabilities(perms), loading: q.isLoading, error: q.error };
}
