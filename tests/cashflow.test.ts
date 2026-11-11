import { describe, expect, it } from "vitest";
import {
  DEMO_FRIDAY,
  DEMO_MONDAY,
  DEMO_REFERENCE_DATE,
  DEMO_THURSDAY,
  addDays,
  buildForecast,
  canonicalPresets,
  closingOn,
  emptyLedger,
  rankFollowUps,
  recommendationText,
  shouldApplyObservation,
  upsertReceipt,
  withScenario,
} from "@/lib/domain/cashflow";
import type { CashLedger, Invoice } from "@/lib/domain/types";

const alex = "inv_alex";
const jamie = "inv_jamie";

function ledger(): CashLedger {
  return {
    asOfDate: DEMO_REFERENCE_DATE,
    openingMinor: 31000,
    bills: [
      {
        id: "reece",
        payee: "Reece Plumbing",
        amountMinor: 50000,
        dueDate: DEMO_FRIDAY,
        originalDueDate: DEMO_FRIDAY,
        status: "committed",
        includedInOpening: false,
      },
    ],
    receipts: [],
  };
}

function invoice(id: string, due: number): Invoice {
  return {
    id,
    jobId: "job",
    number: id,
    customerId: null,
    recipientName: id,
    recipientEmail: "buyer@example.com",
    currency: "USD",
    approval: "approved",
    delivery: "sent",
    settlement: "unpaid",
    deliveryMethod: "email",
    revision: 1,
    observationVersion: 1,
    lines: [],
    exclusions: [],
    questions: [],
    totalMinor: due,
    amountPaidMinor: 0,
    amountDueMinor: due,
    snapshot: null,
    paypalInvoiceId: null,
    paypalRecipientViewUrl: null,
    lastVerifiedAt: null,
    dueDate: DEMO_THURSDAY,
    seeded: true,
    simulated: true,
    sample: true,
    createdAt: DEMO_REFERENCE_DATE,
    updatedAt: DEMO_REFERENCE_DATE,
  };
}

describe("cashflow forecast", () => {
  it("matches the four Friday scenarios and a Monday arrival", () => {
    const base = ledger();
    const presets = canonicalPresets(alex, jamie);
    expect(closingOn(buildForecast(base, DEMO_MONDAY), DEMO_FRIDAY)).toBe(-19000);
    expect(closingOn(withScenario(base, presets.jamie, DEMO_MONDAY), DEMO_FRIDAY)).toBe(-11000);
    expect(closingOn(withScenario(base, presets.alex, DEMO_MONDAY), DEMO_FRIDAY)).toBe(5000);
    expect(closingOn(withScenario(base, presets.both, DEMO_MONDAY), DEMO_FRIDAY)).toBe(13000);
    expect(closingOn(withScenario(base, presets.monday, DEMO_MONDAY), DEMO_FRIDAY)).toBe(-19000);
    expect(closingOn(withScenario(base, presets.monday, DEMO_MONDAY), DEMO_MONDAY)).toBe(5000);
  });

  it("ranks Alex ahead of Jamie and explains the $50 buffer", () => {
    const ranked = rankFollowUps({
      ledger: ledger(),
      horizonEnd: DEMO_MONDAY,
      decisionDate: DEMO_FRIDAY,
      candidates: [
        { invoiceId: jamie, dueDate: "2026-11-10", collectibleMinor: 8000, availableOn: DEMO_FRIDAY, label: "Jamie Reed" },
        { invoiceId: alex, dueDate: DEMO_REFERENCE_DATE, collectibleMinor: 24000, availableOn: DEMO_THURSDAY, label: "Alex Morgan" },
      ],
    });
    expect(ranked[0]?.invoiceId).toBe(alex);
    expect(ranked[0]?.gapClosedMinor).toBe(19000);
    expect(ranked[0]?.bufferMinor).toBe(5000);
    expect(ranked[1]?.gapClosedMinor).toBe(8000);
    expect(recommendationText({ name: "Alex", amountMinor: 24000, gapMinor: 19000, bufferMinor: 5000, payBy: "Thursday" })).toBe(
      "Ask Alex to pay by Thursday. If the $240 is available in time, it covers Friday’s $190 gap and leaves $50 after the supplier bill.",
    );
  });

  it("keeps an earlier shortfall when a later day recovers, and flags same-day timing", () => {
    const early = emptyLedger("2026-11-11");
    early.openingMinor = 10000;
    early.bills = [
      { id: "rent", payee: "Rent", amountMinor: 15000, dueDate: "2026-11-12", originalDueDate: "2026-11-12", status: "committed", includedInOpening: false },
      { id: "late", payee: "Overdue", amountMinor: 2000, dueDate: "2026-11-01", originalDueDate: "2026-11-01", status: "committed", includedInOpening: false },
    ];
    early.receipts = [{ id: "later", invoiceId: null, providerPaymentId: "p1", amountMinor: 30000, availableOn: "2026-11-14", availability: "confirmed", label: "Later", includedInOpening: false }];
    const forecast = buildForecast(early, "2026-11-14");
    expect(forecast.firstShortfall?.date).toBe("2026-11-12");
    expect(closingOn(forecast, "2026-11-14")).toBeGreaterThan(0);
    expect(forecast.days[0]?.events.some((event) => event.originalDate === "2026-11-01")).toBe(true);

    const sameDay = emptyLedger("2026-11-11");
    sameDay.openingMinor = 0;
    sameDay.bills = [{ id: "bill", payee: "Supplier", amountMinor: 5000, dueDate: DEMO_FRIDAY, originalDueDate: DEMO_FRIDAY, status: "committed", includedInOpening: false }];
    sameDay.receipts = [{ id: "same", invoiceId: alex, providerPaymentId: null, amountMinor: 5000, availableOn: DEMO_FRIDAY, availability: "estimated", label: "Same day", includedInOpening: false }];
    const day = buildForecast(sameDay, DEMO_FRIDAY).days.find((item) => item.date === DEMO_FRIDAY);
    expect(day?.closingMinor).toBe(0);
    expect(day?.sameDayTimingUnconfirmed).toBe(true);
  });

  it("does not double count a cumulative provider payment, a refund, or cash already in the opening balance", () => {
    let receipts = upsertReceipt([], { id: "r1", invoiceId: alex, providerPaymentId: "PAY-1", amountMinor: 10000, availableOn: null, availability: "unknown", label: "Paid", includedInOpening: false });
    receipts = upsertReceipt(receipts, { id: "r1b", invoiceId: alex, providerPaymentId: "PAY-1", amountMinor: 24000, availableOn: DEMO_THURSDAY, availability: "confirmed", label: "Paid", includedInOpening: false });
    expect(receipts).toHaveLength(1);
    expect(receipts[0]?.amountMinor).toBe(24000);
    receipts = upsertReceipt(receipts, { id: "refund", invoiceId: alex, providerPaymentId: "REF-1", amountMinor: -4000, availableOn: DEMO_MONDAY, availability: "confirmed", label: "Refund", includedInOpening: false });
    const book = ledger();
    book.receipts = receipts;
    book.receipts.push({ id: "old", invoiceId: null, providerPaymentId: "OLD", amountMinor: 5000, availableOn: "2026-11-10", availability: "confirmed", label: "Already banked", includedInOpening: false });
    const forecast = buildForecast(book, DEMO_MONDAY);
    expect(forecast.includedInOpening.receipts.map((item) => item.id)).toContain("old");
    expect(closingOn(forecast, DEMO_FRIDAY)).toBe(5000);
    expect(closingOn(forecast, DEMO_MONDAY)).toBe(1000);
    expect(forecast.unknownAvailability).toHaveLength(0);
    expect(shouldApplyObservation(4, 4)).toBe(false);
    expect(shouldApplyObservation(4, 5)).toBe(true);
    expect(addDays(DEMO_REFERENCE_DATE, 1)).toBe(DEMO_THURSDAY);
    expect(invoice(alex, 24000).amountDueMinor).toBe(24000);
  });
});
