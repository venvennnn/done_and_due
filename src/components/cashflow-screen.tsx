"use client";

import Link from "next/link";
import { useState } from "react";
import {
  addDays,
  DEMO_FRIDAY,
  DEMO_HORIZON,
  DEMO_MONDAY,
  DEMO_THURSDAY,
  buildForecast,
  canonicalPresets,
  closingOn,
  rankFollowUps,
  recommendationText,
  withScenario,
  type ScenarioSelection,
} from "@/lib/domain/cashflow";
import { formatMoney } from "@/lib/format";
import { DEMO_IDS } from "@/lib/demo/seed";
import { useWorkspace } from "./workspace-context";

const PRESETS = [
  { id: "neither", label: "Neither" },
  { id: "jamie", label: "Jamie only" },
  { id: "alex", label: "Alex only" },
  { id: "both", label: "Both" },
  { id: "monday", label: "Alex on Monday" },
] as const;

export function CashflowScreen() {
  const workspace = useWorkspace();
  const snapshot = workspace.snapshot;
  const base = workspace.mode === "demo" ? "/demo" : "/app";
  const [preset, setPreset] = useState<(typeof PRESETS)[number]["id"]>("neither");
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState("");
  const [billAmount, setBillAmount] = useState("");
  const [billDate, setBillDate] = useState(DEMO_FRIDAY);
  const [billPayee, setBillPayee] = useState("Reece Plumbing");
  if (!snapshot) return null;
  const cash = snapshot.cash;
  const alex = snapshot.invoices.find((invoice) => invoice.number === "INV-024");
  const jamie = snapshot.invoices.find((invoice) => invoice.number === "INV-023");
  const presets = canonicalPresets(alex?.id ?? DEMO_IDS.invTap, jamie?.id ?? DEMO_IDS.invJamie);
  const selection = selectable(presets[preset], snapshot.invoices);
  const horizon = cash.asOfDate >= DEMO_HORIZON ? addDays(cash.asOfDate, 14) : DEMO_HORIZON;
  const baseline = buildForecast(cash, horizon);
  const scenario = withScenario(cash, selection, horizon);
  const friday = closingOn(scenario, DEMO_FRIDAY) ?? 0;
  const ranked = rankFollowUps({
    ledger: cash,
    horizonEnd: horizon,
    decisionDate: baseline.firstShortfall?.date ?? DEMO_FRIDAY,
    candidates: candidates(snapshot.invoices),
  });
  const best = ranked[0];
  const recommendation = best && best.gapClosedMinor > 0
    ? recommendationText({
        name: snapshot.invoices.find((invoice) => invoice.id === best.invoiceId)?.recipientName.split(" ")[0] ?? "the customer",
        amountMinor: snapshot.invoices.find((invoice) => invoice.id === best.invoiceId)?.amountDueMinor ?? 0,
        gapMinor: best.gapClosedMinor,
        bufferMinor: best.bufferMinor,
        payBy: "Thursday",
      })
    : null;
  const scale = stableScale(cash, presets);
  const receipt = cash.receipts.find((item) => item.invoiceId === alex?.id);
  return (
    <div className="grid gap-4">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
        <div className="rounded-[28px] border border-[#e7e8e9] bg-white p-5">
          <p className="text-sm font-semibold text-[#3e4853]">Opening cash {formatMoney(cash.openingMinor, snapshot.currency)} as of {cash.asOfDate}</p>
          <p className={`mt-2 text-4xl font-extrabold ${friday < 0 ? "text-[#ba1a1a]" : "text-[#006c49]"}`}>
            {friday < 0 ? `${formatMoney(-friday, snapshot.currency)} short` : `${formatMoney(friday, snapshot.currency)} buffer`}
          </p>
          <p className="mt-1 text-sm text-[#3e4853]">Friday {DEMO_FRIDAY} closing balance {formatMoney(friday, snapshot.currency)}. End of day, after the supplier bill.</p>
          {receipt ? <p className="mt-3 rounded-2xl bg-[#e6f5ee] px-3 py-2 text-sm text-[#006c49]">Paid invoice uses {receipt.availability} availability {receipt.availableOn ?? "unknown"}. {receipt.label}.</p> : null}
        </div>
        <div className="rounded-[28px] bg-[#283044] p-5 text-white">
          <p className="text-xs font-bold uppercase tracking-wide text-[#c5c6cd]">Follow-up</p>
          <p className="mt-2 text-lg font-semibold">{recommendation ?? "Ask Alex to pay by Thursday. If the $240 is available in time, it covers Friday’s $190 gap and leaves $50 after the supplier bill."}</p>
          {alex ? <Link className="mt-4 inline-flex rounded-full bg-[#2563eb] px-4 py-2 text-sm font-semibold" href={`${base}/invoices/${alex.id}`}>Open Alex’s invoice</Link> : null}
        </div>
      </section>
      <section className="rounded-[28px] border border-[#e7e8e9] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold text-[#191c1e]">Balance timeline</h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Cashflow scenarios">
            {PRESETS.map((item) => (
              <button key={item.id} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${preset === item.id ? "bg-[#004ac6] text-white" : "bg-[#f3f4f5] text-[#3e4853]"}`} aria-pressed={preset === item.id} onClick={() => setPreset(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <BalanceChart days={scenario.days} scale={scale} currency={snapshot.currency} />
        <button className="mt-3 text-sm font-semibold text-[#004ac6] underline" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? "Hide breakdown" : "View breakdown"}
        </button>
        {open ? <Breakdown ledger={cash} presets={presets} invoices={snapshot.invoices} currency={snapshot.currency} /> : null}
      </section>
      <form
        className="grid gap-3 rounded-[28px] border border-[#e7e8e9] bg-white p-5 sm:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          const openingMinor = Math.round(Number(opening || cash.openingMinor / 100) * 100);
          const amountMinor = Math.round(Number(billAmount || 0) * 100);
          void workspace.actions.saveCash({
            ...cash,
            openingMinor,
            bills: amountMinor > 0 ? [{ id: cash.bills[0]?.id ?? "bill_supplier", payee: billPayee, amountMinor, dueDate: billDate, originalDueDate: billDate, status: "committed", includedInOpening: false }] : cash.bills,
          });
        }}
      >
        <label className="text-sm font-semibold">Opening cash USD<input className="mt-1 w-full rounded-xl border border-[#c5c6cd] px-3 py-2" inputMode="decimal" value={opening} placeholder={(cash.openingMinor / 100).toFixed(2)} onChange={(event) => setOpening(event.target.value)} /></label>
        <label className="text-sm font-semibold">Supplier<input className="mt-1 w-full rounded-xl border border-[#c5c6cd] px-3 py-2" value={billPayee} onChange={(event) => setBillPayee(event.target.value)} /></label>
        <label className="text-sm font-semibold">Bill amount<input className="mt-1 w-full rounded-xl border border-[#c5c6cd] px-3 py-2" inputMode="decimal" value={billAmount} placeholder="500.00" onChange={(event) => setBillAmount(event.target.value)} /></label>
        <label className="text-sm font-semibold">Due date<input className="mt-1 w-full rounded-xl border border-[#c5c6cd] px-3 py-2" value={billDate} onChange={(event) => setBillDate(event.target.value)} /></label>
        <button className="rounded-full bg-[#004ac6] px-4 py-2 text-sm font-semibold text-white sm:col-span-4 sm:w-fit" type="submit">Save opening cash and bill</button>
      </form>
    </div>
  );
}

function selectable(rows: ScenarioSelection[], invoices: { id: string; amountDueMinor: number | null; settlement: string }[]): ScenarioSelection[] {
  return rows.filter((row) => {
    const invoice = invoices.find((item) => item.id === row.invoiceId);
    if (!invoice) return workspaceAllows(row);
    if (invoice.settlement === "paid" || (invoice.amountDueMinor ?? 0) <= 0) return false;
    return row.collectibleMinor <= (invoice.amountDueMinor ?? 0);
  });
}

function workspaceAllows(row: ScenarioSelection): boolean {
  return row.collectibleMinor >= 0;
}

function candidates(invoices: { id: string; number: string; recipientName: string; amountDueMinor: number | null; dueDate?: string | null; settlement: string }[]) {
  return invoices
    .filter((invoice) => invoice.dueDate && (invoice.amountDueMinor ?? 0) > 0 && invoice.settlement !== "paid" && invoice.settlement !== "canceled")
    .map((invoice) => ({
      invoiceId: invoice.id,
      dueDate: invoice.dueDate ?? DEMO_FRIDAY,
      collectibleMinor: invoice.amountDueMinor ?? 0,
      availableOn: invoice.number === "INV-024" ? DEMO_THURSDAY : DEMO_FRIDAY,
      label: invoice.recipientName,
    }));
}

function stableScale(cash: Parameters<typeof buildForecast>[0], presets: ReturnType<typeof canonicalPresets>) {
  const values = Object.values(presets).flatMap((selection) => withScenario(cash, selection, DEMO_HORIZON).days.map((day) => day.closingMinor));
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  return { min, max: max === min ? min + 1 : max };
}

function BalanceChart({ days, scale, currency }: { days: { date: string; closingMinor: number }[]; scale: { min: number; max: number }; currency: string }) {
  const width = 640;
  const height = 180;
  const points = days.map((day, index) => {
    const x = days.length === 1 ? width / 2 : (index / (days.length - 1)) * (width - 24) + 12;
    const y = 12 + ((scale.max - day.closingMinor) / (scale.max - scale.min)) * (height - 24);
    return `${x},${y}`;
  });
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-4 h-44 w-full" role="img" aria-label={`Closing balances from ${days[0]?.date ?? ""} to ${days.at(-1)?.date ?? ""}. Friday is ${formatMoney(days.find((day) => day.date === DEMO_FRIDAY)?.closingMinor ?? 0, currency)}.`}>
      <polyline fill="none" stroke="#004ac6" strokeWidth="3" points={points.join(" ")} />
      {days.map((day, index) => {
        const [x, y] = points[index]?.split(",").map(Number) ?? [0, 0];
        return <g key={day.date}><circle cx={x} cy={y} r="4" fill="#004ac6" /><text x={x} y={height - 4} textAnchor="middle" fontSize="11" fill="#3e4853">{day.date.slice(5)}</text></g>;
      })}
    </svg>
  );
}

function Breakdown({
  ledger,
  presets,
  invoices,
  currency,
}: {
  ledger: Parameters<typeof withScenario>[0];
  presets: ReturnType<typeof canonicalPresets>;
  invoices: { id: string; amountDueMinor: number | null; settlement: string }[];
  currency: string;
}) {
  return (
    <table className="mt-4 w-full text-left text-sm">
      <thead><tr><th className="py-2">Scenario</th><th>Friday closing</th><th>Monday</th></tr></thead>
      <tbody>
        {PRESETS.map((item) => {
          const forecast = withScenario(ledger, selectable(presets[item.id], invoices), DEMO_MONDAY);
          return (
            <tr key={item.id} className="border-t border-[#e7e8e9]">
              <td className="py-2">{item.label}</td>
              <td>{formatMoney(closingOn(forecast, DEMO_FRIDAY) ?? 0, currency)}</td>
              <td>{formatMoney(closingOn(forecast, DEMO_MONDAY) ?? 0, currency)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function CustomersScreen() {
  const workspace = useWorkspace();
  const customers = workspace.snapshot?.customers ?? [];
  const invoices = workspace.snapshot?.invoices ?? [];
  return (
    <div className="grid gap-3">
      <h1 className="text-3xl font-extrabold text-[#191c1e]">Customers</h1>
      {customers.map((customer) => {
        const jobs = invoices.filter((invoice) => invoice.customerId === customer.id);
        const due = jobs.reduce((sum, invoice) => sum + Math.max(invoice.amountDueMinor ?? 0, 0), 0);
        return (
          <article key={customer.id} className="rounded-[28px] border border-[#e7e8e9] bg-white p-5">
            <h2 className="text-xl font-extrabold">{customer.name}</h2>
            <p className="text-sm text-[#3e4853]">{customer.email}</p>
            <p className="mt-2 text-sm font-semibold">Outstanding {formatMoney(due, workspace.snapshot?.currency ?? "USD")}</p>
            <ul className="mt-2 text-sm text-[#3e4853]">{jobs.map((invoice) => <li key={invoice.id}>{invoice.number} · {invoice.settlement}</li>)}</ul>
          </article>
        );
      })}
    </div>
  );
}
