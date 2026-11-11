import { describe, expect, it } from "vitest";
import { awaitingPayment, paidInRange, DEFAULT_FILTER } from "@/lib/domain/overview";
import { DEMO_IDS, createDemoState } from "@/lib/demo/seed";
import { approveInvoice, loadDurationExample, resetDemo, simulateSend, simulateSettlement, updateInvoiceLine, updateRecipient } from "@/lib/demo/engine";

const now = new Date("2026-11-10T15:00:00.000Z");

describe("public demo journey", () => {
  it("runs capture edits, approval, simulated payment, reload, and reset", () => {
    let state = createDemoState(now);
    const seeded = state.snapshot.invoices.find((invoice) => invoice.id === DEMO_IDS.invTap)!;
    expect(seeded.totalMinor).toBe(24000);
    expect(seeded.exclusions.some((item) => /connector/i.test(item.description))).toBe(true);
    expect(awaitingPayment(state.snapshot.invoices).reduce((sum, invoice) => sum + (invoice.amountDueMinor ?? 0), 0)).toBe(50000);

    const labor = seeded.lines.find((line) => line.unit === "hr")!;
    state = updateInvoiceLine(state, seeded.id, labor.id, { quantity: "1.5" }, now);
    let invoice = state.snapshot.invoices.find((item) => item.id === seeded.id)!;
    expect(invoice.lines.find((line) => line.unit === "hr")?.rateMinor).toBe(12000);
    expect(invoice.totalMinor).toBe(30000);
    invoice = structuredClone(state).snapshot.invoices.find((item) => item.id === seeded.id)!;
    expect(invoice.totalMinor).toBe(30000);

    const blockedDuration = loadDurationExample(createDemoState(now), now).state;
    const durationInvoice = blockedDuration.snapshot.invoices.find((item) => item.id === DEMO_IDS.invTap)!;
    expect(() => approveInvoice(blockedDuration, durationInvoice.id, durationInvoice.revision, now)).toThrow(/duration/i);

    state = updateRecipient(state, seeded.id, { email: "" }, now);
    invoice = state.snapshot.invoices.find((item) => item.id === seeded.id)!;
    expect(() => approveInvoice(state, invoice.id, invoice.revision, now)).toThrow(/email/i);
    state = updateRecipient(state, seeded.id, { email: "emma.wilson@example.com" }, now);
    invoice = state.snapshot.invoices.find((item) => item.id === seeded.id)!;
    const tap = invoice.lines.find((line) => line.unit === "each")!;
    state = updateInvoiceLine(state, invoice.id, tap.id, { description: "tap" }, now);
    invoice = state.snapshot.invoices.find((item) => item.id === seeded.id)!;
    expect(() => approveInvoice(state, invoice.id, invoice.revision, now)).toThrow(/price list|matches/i);

    state = createDemoState(now);
    const fresh = state.snapshot.invoices.find((item) => item.id === DEMO_IDS.invTap)!;
    const freshLabor = fresh.lines.find((line) => line.unit === "hr")!;
    state = updateInvoiceLine(state, fresh.id, freshLabor.id, { quantity: "1.5" }, now);
    invoice = state.snapshot.invoices.find((item) => item.id === fresh.id)!;
    state = approveInvoice(state, invoice.id, invoice.revision, now);
    state = simulateSend(state, invoice.id, now);
    state = simulateSettlement(state, invoice.id, "pending", now);
    state = simulateSettlement(state, invoice.id, "partially_paid", now);
    state = simulateSettlement(state, invoice.id, "paid", now);
    invoice = state.snapshot.invoices.find((item) => item.id === fresh.id)!;
    expect(invoice.approval).toBe("approved");
    expect(invoice.delivery).toBe("sent");
    expect(invoice.settlement).toBe("paid");
    expect(invoice.amountDueMinor).toBe(0);
    expect(invoice.snapshot?.totalMinor).toBe(30000);
    expect(state.snapshot.timeline.filter((event) => event.invoiceId === invoice.id && event.simulated).length).toBeGreaterThanOrEqual(4);
    const paidBefore = paidInRange(createDemoState(now).snapshot.payments, DEFAULT_FILTER, now).reduce((sum, payment) => sum + payment.amountMinor, 0);
    const paidAfter = paidInRange(state.snapshot.payments, DEFAULT_FILTER, now).reduce((sum, payment) => sum + payment.amountMinor, 0);
    expect(paidAfter).toBe(paidBefore + 30000);
    expect(invoice.delivery).toBe("sent");

    const reset = resetDemo(now);
    expect(reset.snapshot.invoices.find((item) => item.id === DEMO_IDS.invTap)?.totalMinor).toBe(24000);
    expect(reset.snapshot.mode).toBe("demo");
  });
});
