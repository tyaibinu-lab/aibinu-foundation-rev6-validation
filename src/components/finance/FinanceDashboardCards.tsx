import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DEMO_DATA_LABEL } from "@/lib/finance/api";
import { formatKobo } from "@/lib/finance/currency";
import type { FinanceDashboardSummary, PaymentMethod } from "@/lib/finance/types";

const METHOD_LABEL: Record<PaymentMethod, string> = {
  paystack: "Paystack",
  flutterwave: "Flutterwave",
  bank_transfer: "Bank transfer",
  cash: "Cash",
  pos: "POS",
  other: "Other",
};

export function DemoDataBanner() {
  return (
    <Alert role="note" className="border-accent">
      <AlertTitle className="font-bold tracking-wide">{DEMO_DATA_LABEL}</AlertTitle>
      <AlertDescription>
        Illustrative figures only. Not school revenue, balances, audited profit, cash flow or a
        general ledger.
      </AlertDescription>
    </Alert>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export function FinanceDashboardCards({ data }: { data: FinanceDashboardSummary }) {
  const pct = data.fees.invoiced === 0n ? 0n : (data.fees.collected * 100n) / data.fees.invoiced;
  return (
    <div className="space-y-6">
      <p className="text-sm font-medium text-muted-foreground">{data.periodLabel}</p>
      <section
        aria-label="Key figures"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        <Kpi label="Total invoiced" value={formatKobo(data.fees.invoiced)} />
        <Kpi
          label="Total collected (confirmed)"
          value={formatKobo(data.fees.collected)}
          hint={`${pct}% of invoiced`}
        />
        <Kpi
          label="Outstanding fees"
          value={formatKobo(data.fees.outstanding)}
          hint={`${data.fees.overdueInvoices} overdue invoices`}
        />
        <Kpi label="Payments received today" value={formatKobo(data.payments.receivedToday)} />
        <Kpi
          label="Approved expenditure"
          value={formatKobo(data.expenditure.approved)}
          hint={`${formatKobo(data.expenditure.paid)} paid`}
        />
        <Kpi
          label="Pending expense approvals"
          value={String(data.approvals.expenses)}
          hint={`${data.approvals.refunds} refunds awaiting approval`}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fee collection overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              className="h-3 w-full overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`${pct}% collected`}
            >
              <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
            <Table>
              <TableBody>
                {data.topOutstanding.map((o) => (
                  <TableRow key={o.studentLabel}>
                    <TableCell>{o.studentLabel}</TableCell>
                    <TableCell>{o.className}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatKobo(o.balance)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment methods</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.payments.byMethod.map((m) => (
                  <TableRow key={m.method}>
                    <TableCell>{METHOD_LABEL[m.method]}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.count}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatKobo(m.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Expenditure summary</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">Approved</p>
              <p className="font-semibold tabular-nums">{formatKobo(data.expenditure.approved)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Paid</p>
              <p className="font-semibold tabular-nums">{formatKobo(data.expenditure.paid)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Pending</p>
              <p className="font-semibold">{data.expenditure.pendingApprovals}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border text-sm">
              {data.recentActivity.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    <span className="text-muted-foreground">{a.at}</span> — {a.description}
                  </span>
                  <span className="tabular-nums">{formatKobo(a.amount)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
