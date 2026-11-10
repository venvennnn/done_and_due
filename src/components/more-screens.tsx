"use client";

import Link from "next/link";
import { useState } from "react";
import { formatMoney, formatWhen, relativeDay, statusLabel } from "@/lib/format";
import { lineTotal } from "@/lib/domain/invoice-math";
import { amountDue, customerById } from "@/lib/domain/overview";
import { parseMoneyToMinor } from "@/lib/domain/money";
import { Button, Card, Field, inputClass, Pill } from "./ui";
import { Stepper } from "./shell";
import { useWorkspace } from "./workspace-context";

export function SendScreen({ jobId }: { jobId: string }) {
  const workspace = useWorkspace();
  const base = workspace.mode === "demo" ? "/demo" : "/app";
  const invoice = workspace.snapshot?.invoices.find((item) => item.jobId === jobId);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!invoice) return <p>Approve a draft before sending.</p>;
  const frozen = invoice.snapshot;
  const link = workspace.mode === "demo" ? `${base}/invoices/${invoice.id}/buyer` : invoice.paypalRecipientViewUrl;
  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold text-[#1258F5]">Send or share</h1>
        <Stepper current="send" />
      </div>
      <span className="inline-flex rounded-full bg-[#EEF3FF] px-3 py-1 text-xs font-bold text-[#1258F5]">{workspace.mode === "demo" ? "Demo · Simulated" : "PayPal Sandbox"}</span>
      <Card>
        <h2 className="text-xl font-extrabold">Frozen bill</h2>
        <p className="mt-2 text-sm text-[#5C6B8A]">Recipient and total are taken from the approved snapshot.</p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div><dt className="text-xs font-semibold text-[#8B98B3]">Recipient</dt><dd className="font-semibold">{frozen?.recipientName} · {frozen?.recipientEmail}</dd></div>
          <div><dt className="text-xs font-semibold text-[#8B98B3]">Total</dt><dd className="text-2xl font-extrabold">{formatMoney(frozen?.totalMinor ?? invoice.totalMinor, invoice.currency)}</dd></div>
        </dl>
        <ul className="mt-4 space-y-2 text-sm">
          {(frozen?.lines ?? invoice.lines).filter((line) => !line.excluded).map((line) => {
            const amount = lineTotal(line);
            return (
              <li key={line.id} className="flex justify-between"><span>{line.description} · {line.quantity} {line.unit}</span><span>{amount === null ? "—" : formatMoney(amount, invoice.currency)}</span></li>
            );
          })}
        </ul>
      </Card>
      {workspace.mode === "demo" ? (
        <section className="rounded-[26px] bg-gradient-to-br from-[#1258F5] to-[#5287F6] p-5 text-white">
          <h2 className="text-xl font-extrabold">Simulation only</h2>
          <p className="mt-1 text-sm text-white/85">These actions stay in this browser. No email is sent and no payment details are collected.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="white" disabled={busy || invoice.approval !== "approved"} onClick={() => run(() => workspace.actions.simulateSend(invoice.id))}>Simulate sending</Button>
            <Link href={`${base}/invoices/${invoice.id}/buyer`} className="inline-flex min-h-11 items-center rounded-full bg-white/15 px-4 text-sm font-semibold">Preview demo invoice</Link>
          </div>
        </section>
      ) : (
        <section className="rounded-[26px] bg-gradient-to-br from-[#1258F5] to-[#5287F6] p-5 text-white">
          <h2 className="text-xl font-extrabold">PayPal Sandbox</h2>
          <p className="mt-1 text-sm text-white/85">Create the draft first. Sending and the share link are separate actions, and neither one is implied by a payment.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="white" disabled={busy || !workspace.integration?.paypal.configured} onClick={() => run(() => workspace.actions.createPayPalDraft(invoice.id))}>Create PayPal draft</Button>
            <Button variant="white" disabled={busy || invoice.delivery !== "provider_draft"} onClick={() => run(() => workspace.actions.sendPayPal(invoice.id))}>Send through PayPal</Button>
            <Button variant="white" disabled={busy || invoice.delivery !== "provider_draft"} onClick={() => run(() => workspace.actions.linkPayPal(invoice.id))}>Create shareable payment link</Button>
            <Button variant="ghost" disabled={busy || !invoice.paypalInvoiceId} onClick={() => run(() => workspace.actions.refreshPayPal(invoice.id))}>Refresh status</Button>
          </div>
          {!workspace.integration?.paypal.configured ? <p className="mt-3 text-sm">PayPal Sandbox is not configured ({workspace.integration?.paypal.missing.join(", ")}). Drafts stay saved. Nothing is simulated.</p> : null}
        </section>
      )}
      <Card>
        <div className="flex flex-wrap gap-2">
          <Pill tone={invoice.approval}>{statusLabel(invoice.approval)}</Pill>
          <Pill tone={invoice.delivery}>{statusLabel(invoice.delivery)}</Pill>
          <Pill tone={invoice.settlement}>{statusLabel(invoice.settlement)}</Pill>
        </div>
        {link ? (
          <div className="mt-3">
            <p className="text-sm font-semibold">{workspace.mode === "demo" ? "Demo buyer preview" : invoice.delivery === "ready_to_share" ? "Ready to share" : "Payment link"}</p>
            <p className="mt-1 break-all text-sm text-[#5C6B8A]">{link}</p>
            <Button className="mt-2" variant="ghost" onClick={async () => { await navigator.clipboard.writeText(new URL(link, window.location.origin).toString()); setCopied(true); }}>{copied ? "Copied" : "Copy payment link"}</Button>
          </div>
        ) : <p className="mt-3 text-sm text-[#5C6B8A]">A payment link appears after delivery is prepared.</p>}
        <Link href={`${base}/invoices/${invoice.id}`} className="mt-4 inline-flex font-semibold text-[#1258F5]">Open invoice detail</Link>
      </Card>
    </div>
  );
}

export function JobsScreen() {
  const workspace = useWorkspace();
  const base = workspace.mode === "demo" ? "/demo" : "/app";
  const jobs = [...(workspace.snapshot?.jobs ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold text-[#1258F5]">Jobs</h1>
        <Link href={`${base}/jobs/new`} className="inline-flex min-h-11 items-center rounded-full bg-[#1258F5] px-4 text-sm font-semibold text-white">New job</Link>
      </div>
      <div className="mt-4 grid gap-3">
        {jobs.map((job) => {
          const customer = customerById(workspace.snapshot!, job.customerId);
          return (
            <Link key={job.id} href={`${base}/jobs/${job.id}`} className="rounded-[26px] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-extrabold">{job.title}</p>
                  <p className="text-sm text-[#5C6B8A]">{customer?.name ?? "No customer"} · {relativeDay(job.updatedAt)}</p>
                </div>
                {job.sample ? <Pill tone="simulated">Sample</Pill> : null}
              </div>
            </Link>
          );
        })}
        {jobs.length === 0 ? <Card><p>No jobs yet. Capture one to start a bill.</p></Card> : null}
      </div>
    </div>
  );
}

export function InvoiceListScreen() {
  const workspace = useWorkspace();
  const base = workspace.mode === "demo" ? "/demo" : "/app";
  const invoices = [...(workspace.snapshot?.invoices ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <div>
      <h1 className="text-3xl font-extrabold text-[#1258F5]">Invoices</h1>
      <div className="mt-4 overflow-hidden rounded-[26px] bg-white">
        <table className="w-full text-left text-sm">
          <thead className="text-[#8B98B3]"><tr><th className="px-4 py-3">Number</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Approval</th><th className="px-4 py-3">Delivery</th><th className="px-4 py-3">Settlement</th></tr></thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id} className="border-t border-[#F0F3F8]">
                <td className="px-4 py-3"><Link className="font-semibold" href={`${base}/invoices/${invoice.id}`}>{invoice.number}</Link></td>
                <td className="px-4 py-3">{invoice.recipientName}</td>
                <td className="px-4 py-3">{formatMoney(invoice.totalMinor, invoice.currency)}</td>
                <td className="px-4 py-3"><Pill tone={invoice.approval}>{statusLabel(invoice.approval)}</Pill></td>
                <td className="px-4 py-3"><Pill tone={invoice.delivery}>{statusLabel(invoice.delivery)}</Pill></td>
                <td className="px-4 py-3"><Pill tone={invoice.settlement}>{statusLabel(invoice.settlement)}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
        {invoices.length === 0 ? <p className="p-6 text-sm text-[#5C6B8A]">No invoices yet.</p> : null}
      </div>
    </div>
  );
}

export function InvoiceDetailScreen({ invoiceId }: { invoiceId: string }) {
  const workspace = useWorkspace();
  const base = workspace.mode === "demo" ? "/demo" : "/app";
  const invoice = workspace.snapshot?.invoices.find((item) => item.id === invoiceId);
  if (!invoice || !workspace.snapshot) return <Card><p>That invoice is not in this workspace.</p></Card>;
  const events = workspace.snapshot.timeline.filter((event) => event.invoiceId === invoice.id);
  const link = workspace.mode === "demo" && (invoice.delivery === "sent" || invoice.delivery === "ready_to_share") ? `${base}/invoices/${invoice.id}/buyer` : invoice.paypalRecipientViewUrl;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-extrabold text-[#1258F5]">{invoice.number}</h1>
          <Pill tone={invoice.approval}>{statusLabel(invoice.approval)}</Pill>
          <Pill tone={invoice.delivery}>{statusLabel(invoice.delivery)}</Pill>
          <Pill tone={invoice.settlement}>{statusLabel(invoice.settlement)}{invoice.simulated ? " · simulated" : ""}</Pill>
        </div>
        <p className="mt-3 text-sm text-[#5C6B8A]">{invoice.recipientName} · {invoice.recipientEmail}</p>
        <p className="mt-4 text-4xl font-extrabold">{formatMoney(invoice.totalMinor, invoice.currency)}</p>
        <p className="mt-1 text-sm text-[#5C6B8A]">Amount due {invoice.amountDueMinor === null ? "unknown" : formatMoney(amountDue(invoice), invoice.currency)} · Paid {formatMoney(invoice.amountPaidMinor, invoice.currency)}</p>
        <p className="mt-1 text-sm text-[#5C6B8A]">Last verified {formatWhen(invoice.lastVerifiedAt)}</p>
        <ul className="mt-4 space-y-2 text-sm">
          {invoice.lines.filter((line) => !line.excluded).map((line) => <li key={line.id} className="flex justify-between"><span>{line.description}</span><span>{line.quantity} × {line.rateMinor === null ? "—" : formatMoney(line.rateMinor, invoice.currency)}</span></li>)}
        </ul>
        {link ? <p className="mt-4 break-all text-sm"><span className="font-semibold">Share link · </span>{link}</p> : <p className="mt-4 text-sm text-[#5C6B8A]">No share link yet.</p>}
        {workspace.mode === "paypal_sandbox" && invoice.paypalInvoiceId ? <Button className="mt-4" variant="ghost" onClick={() => workspace.actions.refreshPayPal(invoice.id)}>Refresh from PayPal</Button> : null}
      </Card>
      <Card>
        <h2 className="font-extrabold">Payment timeline</h2>
        <ul className="mt-3 space-y-3">
          {events.map((event) => (
            <li key={event.id}>
              <p className="text-sm font-semibold">{event.message}</p>
              <p className="text-xs text-[#8B98B3]">{relativeDay(event.at)} · {event.actor}{event.simulated ? " · simulated" : ""}</p>
            </li>
          ))}
          {events.length === 0 ? <li className="text-sm text-[#5C6B8A]">No status changes yet.</li> : null}
        </ul>
      </Card>
    </div>
  );
}

export function BuyerScreen({ invoiceId }: { invoiceId: string }) {
  const workspace = useWorkspace();
  const invoice = workspace.snapshot?.invoices.find((item) => item.id === invoiceId);
  if (workspace.mode !== "demo") return <Card><p>PayPal buyers pay on PayPal&apos;s hosted invoice, not inside Done & Due.</p></Card>;
  if (!invoice) return <Card><p>That demo invoice is not available.</p></Card>;
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="rounded-[26px] bg-[#FFF7E8] p-4 text-sm font-semibold text-[#8A5A00]" role="status">Simulation — no payment is collected and no email is sent. This is not a PayPal checkout.</div>
      <Card>
        <p className="text-sm font-semibold text-[#5C6B8A]">Invoice for {invoice.recipientName}</p>
        <h1 className="text-3xl font-extrabold">{formatMoney(invoice.totalMinor, invoice.currency)}</h1>
        <ul className="mt-4 space-y-2 text-sm">
          {invoice.lines.filter((line) => !line.excluded).map((line) => <li key={line.id} className="flex justify-between"><span>{line.description}</span><span>{line.quantity} {line.unit}</span></li>)}
        </ul>
        <p className="mt-3 text-sm text-[#5C6B8A]">Due {invoice.amountDueMinor === null ? formatMoney(invoice.totalMinor, invoice.currency) : formatMoney(amountDue(invoice), invoice.currency)}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => workspace.actions.simulateSettlement(invoice.id, "pending")}>Simulate pending</Button>
          <Button variant="ghost" onClick={() => workspace.actions.simulateSettlement(invoice.id, "partially_paid")}>Simulate partial</Button>
          <Button onClick={() => workspace.actions.simulateSettlement(invoice.id, "paid")}>Simulate paid</Button>
        </div>
        <p className="mt-3 text-sm font-semibold capitalize">Settlement: {statusLabel(invoice.settlement)}</p>
      </Card>
    </div>
  );
}

export function PriceListScreen() {
  const workspace = useWorkspace();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("each");
  const [rate, setRate] = useState("40.00");
  const [aliases, setAliases] = useState("");
  const catalog = workspace.snapshot?.catalog ?? [];
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <h1 className="text-3xl font-extrabold text-[#1258F5]">Price list</h1>
        <p className="mt-2 text-sm text-[#5C6B8A]">Retiring an item stops it matching new work. Approved invoices keep their original rates.</p>
        <div className="mt-4 space-y-3">
          {catalog.map((item) => (
            <Card key={item.id}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-extrabold">{item.name}</p>
                  <p className="text-sm text-[#5C6B8A]">{formatMoney(item.rateMinor, workspace.snapshot?.currency)} / {item.unit}</p>
                  <p className="text-xs text-[#8B98B3]">Also called {item.aliases.join(", ") || "—"}</p>
                </div>
                {item.active ? <Button variant="ghost" onClick={() => workspace.actions.retireCatalog(item.id)}>Retire</Button> : <Pill tone="canceled">Retired</Pill>}
              </div>
            </Card>
          ))}
          {catalog.length === 0 ? <Card><p>Add a catalog item to price future jobs.</p></Card> : null}
        </div>
      </div>
      <Card>
        <h2 className="font-extrabold">Add item</h2>
        <div className="mt-3 space-y-3">
          <Field label="Name"><input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="Unit"><input className={inputClass} value={unit} onChange={(event) => setUnit(event.target.value)} /></Field>
          <Field label="Rate"><input className={inputClass} value={rate} onChange={(event) => setRate(event.target.value)} /></Field>
          <Field label="Aliases"><input className={inputClass} value={aliases} placeholder="Comma separated" onChange={(event) => setAliases(event.target.value)} /></Field>
          <Button onClick={() => {
            const minor = parseMoneyToMinor(rate);
            if (minor === null) return;
            workspace.actions.saveCatalog({ name, unit, rateMinor: minor, aliases: aliases.split(",") });
            setName("");
            setAliases("");
          }}>Save item</Button>
        </div>
      </Card>
    </div>
  );
}

export function SettingsScreen() {
  const workspace = useWorkspace();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-3xl font-extrabold text-[#1258F5]">Settings</h1>
      <Card>
        <h2 className="font-extrabold">{workspace.mode === "demo" ? "Demo workspace" : "PayPal Sandbox workspace"}</h2>
        <p className="mt-2 text-sm leading-6 text-[#5C6B8A]">
          {workspace.mode === "demo"
            ? "Reset clears only this browser's demo jobs, invoices, and photos. It does not touch a PayPal workspace."
            : "PayPal actions use the server-side Sandbox merchant. A missing credential is shown here and never falls back to the demo."}
        </p>
        {workspace.mode === "demo" ? <Button className="mt-4" variant="danger" onClick={() => workspace.actions.resetDemo()}>Reset demo</Button> : null}
        {workspace.integration ? (
          <ul className="mt-4 space-y-2 text-sm">
            <li>Supabase: {workspace.integration.supabase.configured ? "configured" : `missing ${workspace.integration.supabase.missing.join(", ")}`}</li>
            <li>Gemini: {workspace.integration.gemini.configured ? `configured (${workspace.integration.gemini.transcriptionModel}, ${workspace.integration.gemini.visionModel})` : `missing ${workspace.integration.gemini.missing.join(", ")}`}</li>
            <li>PayPal: {workspace.integration.paypal.configured ? "sandbox configured" : `missing ${workspace.integration.paypal.missing.join(", ")}`}</li>
          </ul>
        ) : null}
      </Card>
    </div>
  );
}
