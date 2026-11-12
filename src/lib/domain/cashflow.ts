import type { CashLedger, CashReceipt, Invoice, OutgoingBill } from "./types";

export const DEMO_REFERENCE_DATE = "2026-11-11";
export const DEMO_THURSDAY = "2026-11-12";
export const DEMO_FRIDAY = "2026-11-13";
export const DEMO_MONDAY = "2026-11-16";
export const DEMO_HORIZON = "2026-11-16";

export type DatedFlow = {
  id: string;
  date: string;
  kind: "in" | "out";
  amountMinor: number;
  label: string;
  originalDate: string | null;
  timing: "confirmed" | "unconfirmed";
};

export type ForecastDay = {
  date: string;
  cashInMinor: number;
  cashOutMinor: number;
  closingMinor: number;
  shortfallMinor: number;
  bufferMinor: number;
  events: DatedFlow[];
  sameDayTimingUnconfirmed: boolean;
};

export type Forecast = {
  asOfDate: string;
  openingMinor: number;
  days: ForecastDay[];
  firstShortfall: { date: string; gapMinor: number } | null;
  lowest: { date: string; closingMinor: number } | null;
  includedInOpening: { receipts: CashReceipt[]; bills: OutgoingBill[] };
  unknownAvailability: CashReceipt[];
};

export type ScenarioSelection = {
  invoiceId: string;
  collectibleMinor: number;
  availableOn: string;
  label: string;
};

export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function listDates(start: string, end: string): string[] {
  if (end < start) return [];
  const dates: string[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) dates.push(cursor);
  return dates;
}

export function emptyLedger(asOfDate: string): CashLedger {
  return { asOfDate, openingMinor: 0, bills: [], receipts: [] };
}

export function weekdayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

export function buildForecast(ledger: CashLedger, horizonEnd: string): Forecast {
  const firstDay = addDays(ledger.asOfDate, 1);
  const includedBills = ledger.bills.filter((bill) => bill.includedInOpening || (bill.status !== "committed" && bill.dueDate <= ledger.asOfDate));
  const includedReceipts = ledger.receipts.filter((receipt) => receipt.includedInOpening || (receipt.availableOn !== null && receipt.availableOn <= ledger.asOfDate && receipt.availability !== "unknown"));
  const unknownAvailability = ledger.receipts.filter((receipt) => receipt.availability === "unknown" || receipt.availableOn === null);
  const flows: DatedFlow[] = [];

  for (const bill of ledger.bills) {
    if (bill.status !== "committed" || bill.includedInOpening) continue;
    const overdue = bill.dueDate < firstDay;
    const date = overdue ? firstDay : bill.dueDate;
    if (date > horizonEnd || date < firstDay) continue;
    flows.push({
      id: bill.id,
      date,
      kind: "out",
      amountMinor: bill.amountMinor,
      label: bill.payee,
      originalDate: overdue ? bill.originalDueDate : null,
      timing: "confirmed",
    });
  }

  for (const receipt of ledger.receipts) {
    if (receipt.includedInOpening || receipt.availability === "unknown" || !receipt.availableOn) continue;
    if (receipt.availableOn <= ledger.asOfDate || receipt.availableOn > horizonEnd) continue;
    flows.push({
      id: receipt.id,
      date: receipt.availableOn,
      kind: "in",
      amountMinor: receipt.amountMinor,
      label: receipt.label,
      originalDate: null,
      timing: receipt.availability === "confirmed" ? "confirmed" : "unconfirmed",
    });
  }

  const days = listDates(firstDay, horizonEnd).map((date) => {
    const events = flows.filter((flow) => flow.date === date);
    const cashInMinor = events.filter((event) => event.kind === "in").reduce((sum, event) => sum + event.amountMinor, 0);
    const cashOutMinor = events.filter((event) => event.kind === "out").reduce((sum, event) => sum + event.amountMinor, 0);
    return { date, cashInMinor, cashOutMinor, events, sameDayTimingUnconfirmed: cashInMinor > 0 && cashOutMinor > 0 && events.some((event) => event.kind === "in" && event.timing !== "confirmed") };
  });

  let running = ledger.openingMinor;
  const forecastDays: ForecastDay[] = days.map((day) => {
    running += day.cashInMinor - day.cashOutMinor;
    return {
      ...day,
      closingMinor: running,
      shortfallMinor: Math.max(0, -running),
      bufferMinor: Math.max(0, running),
    };
  });
  const negative = forecastDays.filter((day) => day.closingMinor < 0);
  const lowest = forecastDays.reduce<ForecastDay | null>((best, day) => (!best || day.closingMinor < best.closingMinor ? day : best), null);
  return {
    asOfDate: ledger.asOfDate,
    openingMinor: ledger.openingMinor,
    days: forecastDays,
    firstShortfall: negative[0] ? { date: negative[0].date, gapMinor: negative[0].shortfallMinor } : null,
    lowest: lowest ? { date: lowest.date, closingMinor: lowest.closingMinor } : null,
    includedInOpening: { receipts: includedReceipts, bills: includedBills.filter((bill) => bill.includedInOpening) },
    unknownAvailability,
  };
}

export function closingOn(forecast: Forecast, date: string): number | null {
  return forecast.days.find((day) => day.date === date)?.closingMinor ?? null;
}

export function withScenario(ledger: CashLedger, selections: ScenarioSelection[], horizonEnd: string): Forecast {
  const extra: CashReceipt[] = selections.map((selection) => ({
    id: `scenario_${selection.invoiceId}_${selection.availableOn}`,
    invoiceId: selection.invoiceId,
    providerPaymentId: null,
    amountMinor: selection.collectibleMinor,
    availableOn: selection.availableOn,
    availability: "estimated",
    label: selection.label,
    includedInOpening: false,
  }));
  return buildForecast({ ...ledger, receipts: [...ledger.receipts, ...extra] }, horizonEnd);
}

export function outstandingMinor(invoice: Invoice): number {
  if (invoice.settlement === "canceled" || invoice.settlement === "refunded") return 0;
  if (invoice.amountDueMinor !== null) return Math.max(invoice.amountDueMinor, 0);
  return Math.max(invoice.totalMinor - invoice.amountPaidMinor, 0);
}

export function assertCollectible(invoice: Invoice, amountMinor: number): void {
  if (!Number.isInteger(amountMinor) || amountMinor < 0 || amountMinor > outstandingMinor(invoice)) {
    throw new Error("A scenario amount has to stay between zero and the outstanding balance.");
  }
}

export type FollowUpRank = {
  invoiceId: string;
  gapClosedMinor: number;
  bufferMinor: number;
  gapAfterMinor: number;
  availableOn: string;
};

export function rankFollowUps(input: {
  ledger: CashLedger;
  horizonEnd: string;
  decisionDate: string;
  candidates: { invoiceId: string; dueDate: string; collectibleMinor: number; availableOn: string; label: string }[];
}): FollowUpRank[] {
  const baseline = buildForecast(input.ledger, input.horizonEnd);
  const before = Math.max(0, -(closingOn(baseline, input.decisionDate) ?? 0));
  return input.candidates
    .map((candidate) => {
      const scenario = withScenario(input.ledger, [candidate], input.horizonEnd);
      const closing = closingOn(scenario, input.decisionDate) ?? 0;
      const gapAfter = Math.max(0, -closing);
      return {
        invoiceId: candidate.invoiceId,
        gapClosedMinor: before - gapAfter,
        bufferMinor: Math.max(0, closing),
        gapAfterMinor: gapAfter,
        availableOn: candidate.availableOn,
        dueDate: candidate.dueDate,
      };
    })
    .sort((a, b) => b.gapClosedMinor - a.gapClosedMinor || a.dueDate.localeCompare(b.dueDate) || a.invoiceId.localeCompare(b.invoiceId))
    .map((row) => ({
      invoiceId: row.invoiceId,
      gapClosedMinor: row.gapClosedMinor,
      bufferMinor: row.bufferMinor,
      gapAfterMinor: row.gapAfterMinor,
      availableOn: row.availableOn,
    }));
}

export function upsertReceipt(receipts: CashReceipt[], next: CashReceipt): CashReceipt[] {
  const key = next.providerPaymentId ?? next.id;
  const index = receipts.findIndex((receipt) => (receipt.providerPaymentId ?? receipt.id) === key);
  if (index === -1) return [...receipts, next];
  const copy = receipts.slice();
  copy[index] = { ...copy[index], ...next, amountMinor: next.amountMinor };
  return copy;
}

export function shouldApplyObservation(currentVersion: number, incomingVersion: number): boolean {
  return incomingVersion > currentVersion;
}

export function canonicalPresets(alexId: string, jamieId: string): Record<"neither" | "jamie" | "alex" | "both" | "monday", ScenarioSelection[]> {
  const alex = { invoiceId: alexId, collectibleMinor: 24000, availableOn: DEMO_THURSDAY, label: "Alex Morgan" };
  const jamie = { invoiceId: jamieId, collectibleMinor: 8000, availableOn: DEMO_FRIDAY, label: "Jamie Reed" };
  const monday = { ...alex, availableOn: DEMO_MONDAY, label: "Alex Morgan on Monday" };
  return { neither: [], jamie: [jamie], alex: [alex], both: [alex, jamie], monday: [monday] };
}

export function recommendationText(input: { name: string; amountMinor: number; gapMinor: number; bufferMinor: number; payBy: string }): string {
  const amount = dollars(input.amountMinor);
  const gap = dollars(input.gapMinor);
  const buffer = dollars(input.bufferMinor);
  return `Ask ${input.name} to pay by ${input.payBy}. If the ${amount} is available in time, it covers Friday’s ${gap} gap and leaves ${buffer} after the supplier bill.`;
}

export function assertLedger(cash: CashLedger): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cash.asOfDate) || Number.isNaN(Date.parse(`${cash.asOfDate}T00:00:00Z`))) {
    throw new Error("Opening cash needs a real business date.");
  }
  if (!Number.isInteger(cash.openingMinor) || cash.openingMinor < 0) throw new Error("Opening cash has to be zero or more, in cents.");
  for (const bill of cash.bills) {
    if (!Number.isInteger(bill.amountMinor) || bill.amountMinor < 0) throw new Error("A bill amount has to be zero or more, in cents.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bill.dueDate)) throw new Error("A bill needs a due date.");
  }
  for (const receipt of cash.receipts) {
    if (!Number.isInteger(receipt.amountMinor)) throw new Error("A receipt amount has to be a whole number of cents.");
    if (receipt.availableOn && !/^\d{4}-\d{2}-\d{2}$/.test(receipt.availableOn)) throw new Error("A receipt needs a real availability date.");
  }
}

function dollars(minor: number): string {
  return `$${Math.round(minor / 100)}`;
}
