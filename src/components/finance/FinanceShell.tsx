import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AccountBar } from "@/components/auth/TenantGate";
import { Badge } from "@/components/ui/badge";

export const FINANCE_SECTIONS = [
  "Overview",
  "Fee Catalogue",
  "Invoices",
  "Payments",
  "Student Accounts",
  "Discounts & Scholarships",
  "Receipts",
  "Refunds",
  "Expenditure",
  "Vendors",
  "Reports",
] as const;

export function FinanceShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b-4 border-accent bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-sm font-bold text-accent-foreground">
              AF
            </span>
            <span className="font-semibold">Aibinu Flexiprep · Finance</span>
          </Link>
          <AccountBar />
        </div>
        <nav aria-label="Finance sections" className="mx-auto max-w-6xl overflow-x-auto px-4 pb-3">
          <ul className="flex gap-2 text-sm">
            {FINANCE_SECTIONS.map((s) =>
              s === "Overview" ? (
                <li key={s}>
                  <Link
                    to="/finance"
                    activeOptions={{ exact: true }}
                    activeProps={{
                      className: "underline decoration-accent decoration-2 underline-offset-4",
                    }}
                    className="whitespace-nowrap font-medium"
                  >
                    Overview
                  </Link>
                </li>
              ) : (
                <li
                  key={s}
                  aria-disabled="true"
                  title="Not yet available"
                  className="flex items-center gap-1 whitespace-nowrap opacity-60"
                >
                  {s}
                  <span className="text-[10px] uppercase">· soon</span>
                </li>
              ),
            )}
          </ul>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <Badge variant="outline">NGN ₦</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        <div className="mt-6 space-y-6">{children}</div>
      </main>
    </div>
  );
}
