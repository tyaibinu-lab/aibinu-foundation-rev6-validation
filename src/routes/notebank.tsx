import { createFileRoute } from "@tanstack/react-router";
import { TenantGate } from "@/components/auth/TenantGate";

// Session lives in browser storage, so the protected subtree renders client-side only.
export const Route = createFileRoute("/notebank")({
  ssr: false,
  component: TenantGate,
});
