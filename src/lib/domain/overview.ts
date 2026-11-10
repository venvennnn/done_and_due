import type { Invoice, Job, PaymentRecord, WorkspaceSnapshot } from "./types";

export type OverviewFilter = {
  month: "this" | "all";
  customerId: string | "all";
  query: string;
};

export const DEFAULT_FILTER: OverviewFilter = { month: "this", customerId: "all", query: "" };

function inMonth(iso: string, now: Date): boolean {
  const date = new Date(iso);
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function matchesQuery(values: string[], query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return values.join(" ").toLowerCase().includes(needle);
}

export function featuredJob(snapshot: WorkspaceSnapshot): Job | null {
  const jobs = [...snapshot.jobs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return jobs[0] ?? null;
}

export function customerById(snapshot: WorkspaceSnapshot, id: string | null) {
  return snapshot.customers.find((customer) => customer.id === id) ?? null;
}

export function visibleInvoices(snapshot: WorkspaceSnapshot, filter: OverviewFilter, now: Date): Invoice[] {
  return snapshot.invoices.filter((invoice) => {
    if (filter.customerId !== "all" && invoice.customerId !== filter.customerId) return false;
    if (filter.month === "this" && !inMonth(invoice.updatedAt, now) && !inMonth(invoice.createdAt, now)) return false;
    const customer = customerById(snapshot, invoice.customerId);
    const job = snapshot.jobs.find((item) => item.id === invoice.jobId);
    return matchesQuery([invoice.number, invoice.recipientName, customer?.name ?? "", job?.title ?? ""], filter.query);
  });
}

export function awaitingPayment(invoices: Invoice[]): Invoice[] {
  return invoices.filter(
    (invoice) =>
      (invoice.delivery === "sent" || invoice.delivery === "ready_to_share") &&
      (invoice.settlement === "unpaid" || invoice.settlement === "pending" || invoice.settlement === "partially_paid"),
  );
}

export function amountDue(invoice: Invoice): number {
  if (invoice.amountDueMinor !== null) return invoice.amountDueMinor;
  return Math.max(invoice.totalMinor - invoice.amountPaidMinor, 0);
}

export function draftsToFinish(snapshot: WorkspaceSnapshot): Invoice[] {
  const featured = featuredJob(snapshot);
  return snapshot.invoices
    .filter((invoice) => invoice.approval === "editing" && invoice.jobId !== featured?.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function paidInRange(payments: PaymentRecord[], filter: OverviewFilter, now: Date): PaymentRecord[] {
  return payments.filter((payment) => (filter.month === "all" ? true : inMonth(payment.at, now)));
}

export function monthBuckets(payments: PaymentRecord[], now: Date, months = 4): { label: string; totalMinor: number }[] {
  const buckets: { label: string; totalMinor: number; key: string }[] = [];
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    buckets.push({
      key,
      label: date.toLocaleString("en-US", { month: "short" }),
      totalMinor: 0,
    });
  }
  for (const payment of payments) {
    const date = new Date(payment.at);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const bucket = buckets.find((item) => item.key === key);
    if (bucket) bucket.totalMinor += payment.amountMinor;
  }
  return buckets.map(({ label, totalMinor }) => ({ label, totalMinor }));
}

export function recentInvoices(snapshot: WorkspaceSnapshot, filter: OverviewFilter, now: Date): Invoice[] {
  return visibleInvoices(snapshot, { ...filter, month: "all" }, now)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 4);
}

export function activityFeed(snapshot: WorkspaceSnapshot, filter: OverviewFilter): WorkspaceSnapshot["timeline"] {
  const allowed = new Set(
    snapshot.invoices
      .filter((invoice) => filter.customerId === "all" || invoice.customerId === filter.customerId)
      .map((invoice) => invoice.id),
  );
  return [...snapshot.timeline]
    .filter((event) => allowed.has(event.invoiceId))
    .filter((event) => matchesQuery([event.message], filter.query))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 6);
}
