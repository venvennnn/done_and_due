"use client";

import { useParams } from "next/navigation";
import { CaptureScreen, NewJobScreen } from "./capture-screen";
import { BuyerScreen, InvoiceDetailScreen, InvoiceListScreen, JobsScreen, PriceListScreen, SendScreen, SettingsScreen } from "./more-screens";
import { CashflowScreen, CustomersScreen } from "./cashflow-screen";
import { OverviewScreen } from "./overview-screen";
import { ReviewScreen } from "./review-screen";

export function WorkspaceRouter() {
  const params = useParams<{ slug?: string[] }>();
  const slug = params.slug ?? [];
  if (slug.length === 0) return <CashflowScreen />;
  if (slug[0] === "customers") return <CustomersScreen />;
  if (slug[0] === "overview") return <OverviewScreen />;
  if (slug[0] === "jobs" && slug.length === 1) return <JobsScreen />;
  if (slug[0] === "jobs" && slug[1] === "new") return <NewJobScreen />;
  if (slug[0] === "jobs" && slug[2] === "review") return <ReviewScreen jobId={slug[1]} />;
  if (slug[0] === "jobs" && slug[2] === "send") return <SendScreen jobId={slug[1]} />;
  if (slug[0] === "jobs" && slug[1]) return <CaptureScreen jobId={slug[1]} />;
  if (slug[0] === "invoices" && slug[2] === "buyer") return <BuyerScreen invoiceId={slug[1]} />;
  if (slug[0] === "invoices" && slug[1]) return <InvoiceDetailScreen invoiceId={slug[1]} />;
  if (slug[0] === "invoices") return <InvoiceListScreen />;
  if (slug[0] === "price-list") return <PriceListScreen />;
  if (slug[0] === "settings") return <SettingsScreen />;
  return <OverviewScreen />;
}
