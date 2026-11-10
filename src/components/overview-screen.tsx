"use client";

import Link from "next/link";
import { Download, Mic, Plus, Search, SlidersHorizontal, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { formatMoney, greeting, invoicesToCsv, relativeDay } from "@/lib/format";
import { activityFeed, amountDue, awaitingPayment, customerById, draftsToFinish, featuredJob, monthBuckets, paidInRange, recentInvoices } from "@/lib/domain/overview";
import { statusLabel } from "@/lib/format";
import { Button, Card, MenuPopover, Modal, Pill } from "./ui";
import { useWorkspace } from "./workspace-context";

export function OverviewScreen() {
  const workspace = useWorkspace();
  const snapshot = workspace.snapshot;
  const [query, setQuery] = useState(workspace.filter.query);
  const [support, setSupport] = useState(false);
  const base = workspace.mode === "demo" ? "/demo" : "/app";
  const now = useMemo(() => new Date(), []);
  if (!snapshot) return <p className="text-sm text-[#5C6B8A]">Loading your workspace…</p>;
  const filter = { ...workspace.filter, query };
  const featured = featuredJob(snapshot);
  const featuredInvoice = featured ? snapshot.invoices.find((invoice) => invoice.jobId === featured.id) : undefined;
  const outstanding = awaitingPayment(snapshot.invoices.filter((invoice) => filter.customerId === "all" || invoice.customerId === filter.customerId));
  const outstandingMinor = outstanding.reduce((sum, invoice) => sum + amountDue(invoice), 0);
  const drafts = draftsToFinish(snapshot).filter((invoice) => filter.customerId === "all" || invoice.customerId === filter.customerId);
  const paid = paidInRange(snapshot.payments, filter, now);
  const paidMinor = paid.reduce((sum, payment) => sum + payment.amountMinor, 0);
  const buckets = monthBuckets(snapshot.payments, now, 4);
  const previous = buckets[buckets.length - 2]?.totalMinor ?? 0;
  const delta = previous > 0 ? Math.round(((paidMinor - previous) / previous) * 100) : null;
  const recent = recentInvoices(snapshot, filter, now);
  const activity = activityFeed(snapshot, filter);

  function exportCsv() {
    const csv = invoicesToCsv(
      snapshot!.invoices.map((invoice) => ({
        number: invoice.number,
        customer: invoice.recipientName,
        status: `${invoice.approval} / ${invoice.delivery} / ${invoice.settlement}`,
        total: formatMoney(invoice.totalMinor, invoice.currency),
        due: formatMoney(amountDue(invoice), invoice.currency),
        updated: invoice.updatedAt,
      })),
    );
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "done-and-due-invoices.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight text-[#1258F5] sm:text-4xl">{greeting(snapshot.contractorName, now)}</h1>
        <Link href={`${base}/jobs/new`} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#1258F5] px-4 text-sm font-semibold text-white">
          <Plus className="h-4 w-4" /> New job
        </Link>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <MenuPopover label={<span className="inline-flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" /> {filter.month === "this" ? "This month" : "All time"}</span>}>
          <button className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-[#F4F7FB]" onClick={() => workspace.setFilter({ ...workspace.filter, month: "this" })}>This month</button>
          <button className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-[#F4F7FB]" onClick={() => workspace.setFilter({ ...workspace.filter, month: "all" })}>All time</button>
        </MenuPopover>
        <MenuPopover label={<span className="inline-flex items-center gap-2"><Users className="h-4 w-4" /> {filter.customerId === "all" ? "All customers" : customerById(snapshot, filter.customerId)?.name}</span>}>
          <button className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-[#F4F7FB]" onClick={() => workspace.setFilter({ ...workspace.filter, customerId: "all" })}>All customers</button>
          {snapshot.customers.map((customer) => (
            <button key={customer.id} className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-[#F4F7FB]" onClick={() => workspace.setFilter({ ...workspace.filter, customerId: customer.id })}>
              {customer.name}
            </button>
          ))}
        </MenuPopover>
        <Button variant="ghost" onClick={exportCsv}>
          <Download className="h-4 w-4" /> Export
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="relative block">
            <span className="sr-only">Search</span>
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#8B98B3]" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="h-11 w-40 rounded-full border border-[#E1E7F0] bg-white pl-9 pr-3 text-sm sm:w-52" />
          </label>
          <Button variant="ghost" onClick={() => setSupport(true)}>Support</Button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#5C6B8A]">Outstanding</h2>
            <Link href={`${base}/invoices`} className="text-sm font-semibold text-[#1258F5]">View</Link>
          </div>
          <p className="mt-3 text-4xl font-extrabold tracking-tight">{formatMoney(outstandingMinor, snapshot.currency)}</p>
          <p className="mt-1 text-sm text-[#5C6B8A]">{outstanding.length} invoices awaiting payment</p>
          <Sparkline values={buckets.map((bucket) => bucket.totalMinor)} />
        </Card>
        <section className="flex min-h-[210px] flex-col justify-between rounded-[26px] bg-gradient-to-br from-[#1258F5] to-[#5287F6] p-5 text-white shadow-[0_16px_40px_rgba(18,88,245,0.25)]">
          <div>
            <div className="grid h-10 w-10 place-items-center rounded-full bg-white/15"><Mic className="h-5 w-5" /></div>
            <h2 className="mt-4 text-2xl font-extrabold">From job to invoice</h2>
            <p className="mt-1 text-sm text-white/85">Add a photo. Record the work. Review your bill.</p>
          </div>
          <Link href={`${base}/jobs/new`} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-white px-4 text-sm font-semibold text-[#1258F5]">Capture a job</Link>
        </section>
        <Card>
          <h2 className="text-sm font-semibold text-[#5C6B8A]">Paid this month</h2>
          <div className="mt-3 flex items-end gap-2">
            <p className="text-4xl font-extrabold tracking-tight">{formatMoney(paidMinor, snapshot.currency)}</p>
            {delta !== null ? <span className="mb-1 rounded-full bg-[#E5F6EC] px-2 py-0.5 text-xs font-bold text-[#1B7A43]">{delta > 0 ? "+" : ""}{delta}%</span> : null}
          </div>
          <Sparkline values={buckets.map((bucket) => bucket.totalMinor)} />
          <div className="mt-1 flex justify-between text-xs text-[#8B98B3]">{buckets.map((bucket) => <span key={bucket.label}>{bucket.label}</span>)}</div>
        </Card>
        <Card>
          <h2 className="text-sm font-semibold text-[#5C6B8A]">To finish</h2>
          <p className="mt-3 text-4xl font-extrabold tracking-tight">{drafts.length} drafts</p>
          <ul className="mt-3 space-y-3">
            {drafts.slice(0, 3).map((invoice) => {
              const job = snapshot.jobs.find((item) => item.id === invoice.jobId);
              const customer = customerById(snapshot, invoice.customerId);
              return (
                <li key={invoice.id}>
                  <Link href={`${base}/jobs/${invoice.jobId}/review`} className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-[#F3F6FB] text-xs font-bold">{(customer?.name ?? "?").slice(0, 1)}</span>
                    <span>
                      <span className="block text-sm font-semibold">{job?.title ?? invoice.number}</span>
                      <span className="block text-xs text-[#5C6B8A]">{customer?.name}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
            {drafts.length === 0 ? <li className="text-sm text-[#5C6B8A]">No other drafts to finish.</li> : null}
          </ul>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold">Latest job</h2>
            {featured ? <Link href={`${base}/jobs/${featured.id}`} className="text-sm font-semibold text-[#1258F5]">View job</Link> : null}
          </div>
          {featured ? (
            <div className="mt-3">
              {featured.photo?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={featured.photo.url} alt="" className="h-40 w-full rounded-2xl object-cover" />
              ) : (
                <div className="grid h-40 place-items-center rounded-2xl bg-[#EEF2F7] text-sm text-[#5C6B8A]">No photo yet</div>
              )}
              <div className="mt-3 flex items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{customerById(snapshot, featured.customerId)?.name ?? "No customer"}</p>
                  <p className="text-sm text-[#5C6B8A]">{featured.title}</p>
                </div>
                {featuredInvoice ? <Pill tone={featuredInvoice.approval === "editing" ? "draft" : featuredInvoice.settlement}>{featuredInvoice.approval === "editing" ? "Draft" : statusLabel(featuredInvoice.settlement)}</Pill> : null}
              </div>
            </div>
          ) : (
            <p className="mt-6 text-sm text-[#5C6B8A]">Capture a job to see it here.</p>
          )}
        </Card>
        <Card className="lg:col-span-5">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold">Recent invoices</h2>
            <Link href={`${base}/invoices`} className="text-sm font-semibold text-[#1258F5]">View all</Link>
          </div>
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-[#8B98B3]">
              <tr>
                <th className="py-2 font-semibold">Customer</th>
                <th className="py-2 font-semibold">Amount</th>
                <th className="py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((invoice) => (
                <tr key={invoice.id} className="border-t border-[#F0F3F8]">
                  <td className="py-3">
                    <Link href={`${base}/invoices/${invoice.id}`} className="font-semibold">{invoice.recipientName || "No customer"}</Link>
                  </td>
                  <td className="py-3">{formatMoney(invoice.totalMinor, invoice.currency)}</td>
                  <td className="py-3"><Pill tone={invoice.approval === "editing" ? "draft" : invoice.settlement}>{invoice.approval === "editing" ? "Draft" : statusLabel(invoice.settlement)}</Pill></td>
                </tr>
              ))}
              {recent.length === 0 ? <tr><td className="py-6 text-[#5C6B8A]" colSpan={3}>No invoices match this search.</td></tr> : null}
            </tbody>
          </table>
        </Card>
        <Card className="lg:col-span-4">
          <h2 className="font-extrabold">Payment activity</h2>
          <ul className="mt-3 space-y-3">
            {activity.map((event) => (
              <li key={event.id} className="flex gap-3">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#F3F6FB] text-xs font-bold text-[#1258F5]">{event.kind.slice(0, 1).toUpperCase()}</span>
                <span>
                  <span className="block text-sm font-semibold">{event.message}{event.simulated ? " · Simulated" : ""}</span>
                  <span className="block text-xs text-[#8B98B3]">{relativeDay(event.at, now)}</span>
                </span>
              </li>
            ))}
            {activity.length === 0 ? <li className="text-sm text-[#5C6B8A]">Activity will show up after you send or record a payment.</li> : null}
          </ul>
        </Card>
      </div>
      <Modal open={support} onOpenChange={setSupport} title="Support">
        <p>Done & Due helps you turn a job photo and a note into an invoice you can check before anyone is billed.</p>
        <p className="mt-2">{workspace.mode === "demo" ? "You are in the demo. Sending and payment are simulated in this browser. Nothing is emailed and no payment details are collected." : "You are in the PayPal Sandbox workspace. Invoices use test money. A missing provider is never replaced with a simulation."}</p>
        <p className="mt-2">Use Price list to change future rates. Approved invoices keep the rate they were approved with.</p>
      </Modal>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const width = 240;
  const height = 72;
  const points = values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * width;
    const y = height - 8 - (value / max) * (height - 16);
    return `${x},${y}`;
  });
  const area = `0,${height} ${points.join(" ")} ${width},${height}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-4 h-16 w-full" role="img" aria-label="Payment trend">
      <polyline fill="rgba(18,88,245,0.08)" stroke="none" points={area} />
      <polyline fill="none" stroke="#1258F5" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" points={points.join(" ")} />
    </svg>
  );
}
