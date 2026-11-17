import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DemoDataBanner, FinanceDashboardCards } from "@/components/finance/FinanceDashboardCards";
import { FinanceShell } from "@/components/finance/FinanceShell";
import { getDashboardSummary } from "@/lib/finance/api";

export const Route = createFileRoute("/finance/")({
  head: () => ({
    meta: [
      { title: "Finance Overview — Aibinu Flexiprep" },
      {
        name: "description",
        content:
          "Finance and payments overview for school fees and expenditure (demo data in Phase 1).",
      },
      { property: "og:title", content: "Finance Overview — Aibinu Flexiprep" },
      { property: "og:description", content: "School fees, collections and expenditure overview." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FinanceOverview,
});

export function FinanceOverview() {
  const summary = useQuery({
    queryKey: ["finance", "dashboard", "mock"],
    queryFn: getDashboardSummary,
  });

  return (
    <FinanceShell
      title="Finance overview"
      subtitle="Fees, collections and expenditure at a glance."
    >
      <DemoDataBanner />
      {summary.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load demonstration figures</AlertTitle>
          <AlertDescription>Please refresh this page.</AlertDescription>
        </Alert>
      ) : summary.data ? (
        <FinanceDashboardCards data={summary.data} />
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          Loading demonstration figures…
        </p>
      )}
    </FinanceShell>
  );
}
