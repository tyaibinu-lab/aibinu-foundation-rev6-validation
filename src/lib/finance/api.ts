// Offline Phase 1 Finance service: no network or persistence.
import type { FinanceDashboardSummary } from "./types";
import { MOCK_DASHBOARD } from "./mock-data";

export { MOCK_DASHBOARD } from "./mock-data";
export const DEMO_DATA_LABEL = "DEMO DATA — NOT CONNECTED TO LIVE FINANCIAL RECORDS";

/** Returns mock fixtures. Never fetches live data in Phase 1. */
export async function getDashboardSummary(): Promise<FinanceDashboardSummary> {
  return MOCK_DASHBOARD;
}
