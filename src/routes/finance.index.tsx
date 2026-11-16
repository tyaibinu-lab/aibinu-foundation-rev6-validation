import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DemoDataBanner, FinanceDashboardCards } from "@/components/finance/FinanceDashboardCards";
import { FinanceShell } from "@/components/finance/FinanceShell";
import { getDashboardSummary } from "@/lib/finance/api";
import { useFinanceAccess } from "@/lib/finance/permissions";

export const Route = createFileRoute("/finance/")({
  head: () => ({
    meta: [
      { title: "Finance Overview — Aibinu Flexiprep" },
      { name: "description", content: "Finance and payments overview for school fees and expenditure (demo data in Phase 1)." },
      { property: "og:title", content: "Finance Overview — Aibinu Flexiprep" },
      { property: "og:description", content: "School fees, collections and expenditure overview." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FinanceOverview,
});

function FinanceOverview() {
  const access = useFinanceAccess();
  const summary = useQuery({ queryKey: ["finance", "dashboard", "mock"], queryFn: getDashboardSummary });

  return (
    <FinanceShell title="Finance overview" subtitle="Fees, collections and expenditure at a glance.">
      {access.loading ? (
        <p role="status" className="text-sm text-muted-foreground">Checking your finance access…</p>
      ) : access.error ? (
        <Alert variant="destructive"><AlertTitle>Could not check finance access</AlertTitle><AlertDescription>Please try again later.</AlertDescription></Alert>
      ) : !access.caps.canViewOrgOverview ? (
        <Alert>
          <AlertTitle>No access to the finance overview</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>The organisation overview needs finance staff access. Ask your administrator if you need it.</p>
            <Button variant="outline" asChild><Link to="/">Home</Link></Button>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <DemoDataBanner />
          {summary.data ? <FinanceDashboardCards data={summary.data} /> : <p role="status" className="text-sm text-muted-foreground">Loading…</p>}
        </>
      )}
    </FinanceShell>
  );
}
