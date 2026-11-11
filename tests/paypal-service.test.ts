import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSign, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { emptyLedger } from "@/lib/domain/cashflow";
import { applyExtraction } from "@/lib/domain/extraction";
import { ServiceError, assertNotDemoId } from "@/lib/domain/ids";
import { patchLine } from "@/lib/domain/mutate";
import { defaultCatalog, SAMPLE_TRANSCRIPT } from "@/lib/domain/sample";
import { crc32 } from "@/lib/paypal/crc32";
import { MemoryBillingStore } from "@/lib/paypal/memory-store";
import { observePayPalInvoice, type PayPalInvoice } from "@/lib/paypal/map";
import { approveInvoice, createPayPalDraft, deliverPayPal, processWebhook, refreshPayPal, remindPayPal, type StoredWorkspace } from "@/lib/paypal/service";
import { verifyWebhookSignature } from "@/lib/paypal/verify";
import type { PayPalClient } from "@/lib/paypal/client";
import { draftFromTranscript } from "@/lib/demo/sample-draft";
import { samplePhoto } from "@/lib/demo/seed";
import type { Invoice } from "@/lib/domain/types";

const now = new Date("2026-11-10T15:00:00.000Z");

function workspaceWith(invoice: Invoice, id = "ws_1"): StoredWorkspace {
  return {
    id,
    ownerId: "user_1",
    contractorName: "Alex",
    currency: "USD",
    timezone: "UTC",
    cash: emptyLedger("2026-11-11"),
    customers: [],
    jobs: [
      {
        id: invoice.jobId,
        title: "Kitchen tap replacement",
        customerId: null,
        photo: samplePhoto(),
        audio: null,
        transcript: { revisionId: "rev", text: SAMPLE_TRANSCRIPT, source: "typed", createdAt: now.toISOString() },
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        sample: true,
      },
    ],
    invoices: [invoice],
    catalog: defaultCatalog(),
    timeline: [],
    payments: [],
    operations: [],
    webhooks: [],
    aiRuns: [],
  };
}

function draftInvoice(): Invoice {
  const transcript = { revisionId: "rev", text: SAMPLE_TRANSCRIPT, source: "typed" as const, createdAt: now.toISOString() };
  const drafted = draftFromTranscript({ text: SAMPLE_TRANSCRIPT, catalog: defaultCatalog(), transcript, photo: samplePhoto() });
  const labor = drafted.lines.find((line) => line.unit === "hr")!;
  const lines = drafted.lines.map((line) => (line.id === labor.id ? patchLine(line, { quantity: "1.5" }, defaultCatalog(), now.toISOString()) : line));
  const total = 30000;
  return {
    id: "inv_130",
    jobId: "job_tap",
    number: "DD-1042",
    customerId: null,
    recipientName: "Sandbox Buyer",
    recipientEmail: "buyer@personal.sandbox",
    currency: "USD",
    approval: "editing",
    delivery: "not_prepared",
    settlement: "unpaid",
    deliveryMethod: null,
    revision: 3,
    observationVersion: 1,
    lines,
    exclusions: drafted.exclusions,
    questions: [],
    totalMinor: total,
    amountPaidMinor: 0,
    amountDueMinor: total,
    snapshot: null,
    paypalInvoiceId: null,
    paypalRecipientViewUrl: null,
    lastVerifiedAt: null,
    seeded: false,
    simulated: false,
    sample: true,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function remote(partial: Partial<PayPalInvoice> & { status: string }): PayPalInvoice {
  return {
    id: partial.id ?? "INV2-TEST",
    status: partial.status,
    detail: {
      currency_code: "USD",
      invoice_number: "DD-1042",
      metadata: partial.detail?.metadata,
      ...partial.detail,
    },
    due_amount: partial.due_amount,
    payments: partial.payments,
  };
}

function client(handlers: Partial<PayPalClient> & { createDraft?: PayPalClient["createDraft"] }): PayPalClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async createDraft(body, requestId) {
      calls.push(`create:${requestId}`);
      if (handlers.createDraft) return handlers.createDraft(body, requestId);
      return remote({ id: "INV2-ONE", status: "DRAFT" });
    },
    async send(_id, _body, requestId) {
      calls.push(`send:${requestId}`);
      if (handlers.send) return handlers.send(_id, _body, requestId);
    },
    async getInvoice(id) {
      calls.push(`get:${id}`);
      if (handlers.getInvoice) return handlers.getInvoice(id);
      return remote({ id, status: "DRAFT" });
    },
    async searchByNumber(number) {
      calls.push(`search:${number}`);
      if (handlers.searchByNumber) return handlers.searchByNumber(number);
      return [];
    },
    async deleteDraft(id) {
      calls.push(`delete:${id}`);
    },
    async remind(id, _body, requestId) {
      calls.push(`remind:${id}:${requestId}`);
      if (handlers.remind) return handlers.remind(id, _body, requestId);
    },
  };
}

describe("PayPal reconciliation", () => {
  it("creates one draft, blocks an uncertain retry, and does not infer delivery from payment", async () => {
    const store = new MemoryBillingStore();
    store.seed(workspaceWith(draftInvoice()));
    await approveInvoice(store, "ws_1", "inv_130", 3, "contractor", now);
    const paypal = client({});
    const drafted = await createPayPalDraft(store, paypal, "ws_1", "inv_130", now);
    expect(drafted.paypalInvoiceId).toBe("INV2-ONE");
    expect(drafted.delivery).toBe("provider_draft");
    expect(drafted.snapshot?.totalMinor).toBe(30000);
    await createPayPalDraft(store, paypal, "ws_1", "inv_130", now);
    expect(paypal.calls.filter((call) => call.startsWith("create:"))).toHaveLength(1);

    const uncertain = client({
      async createDraft() {
        throw new ServiceError("paypal_network", 504, "timeout", "uncertain");
      },
      async searchByNumber() {
        return [];
      },
    });
    const other = new MemoryBillingStore();
    other.seed(workspaceWith(draftInvoice(), "ws_2"));
    await approveInvoice(other, "ws_2", "inv_130", 3, "contractor", now);
    await expect(createPayPalDraft(other, uncertain, "ws_2", "inv_130", now)).rejects.toMatchObject({ category: "uncertain" });
    await expect(createPayPalDraft(other, uncertain, "ws_2", "inv_130", now)).rejects.toMatchObject({ code: "needs_reconciliation" });
    expect(uncertain.calls.filter((call) => call.startsWith("create:"))).toHaveLength(1);

    const paid = observePayPalInvoice(drafted, remote({ status: "PAID", due_amount: { currency_code: "USD", value: "0.00" } }));
    expect(paid.settlement).toBe("paid");
    expect(paid.delivery).toBe("provider_draft");
    const partial = observePayPalInvoice(
      { ...drafted, delivery: "sent", deliveryMethod: "email" },
      remote({ status: "PARTIALLY_PAID", due_amount: { currency_code: "USD", value: "65.00" } }),
    );
    expect(partial.settlement).toBe("partially_paid");
    expect(partial.delivery).toBe("sent");
    expect(partial.amountDueMinor).toBe(6500);
  });

  it("rejects duplicate webhook application and demo ids", async () => {
    const store = new MemoryBillingStore();
    const invoice = draftInvoice();
    invoice.approval = "approved";
    invoice.delivery = "sent";
    invoice.deliveryMethod = "email";
    invoice.paypalInvoiceId = "INV2-PAID";
    invoice.snapshot = {
      id: "snap_1",
      invoiceId: invoice.id,
      revision: 3,
      currency: "USD",
      recipientName: invoice.recipientName,
      recipientEmail: invoice.recipientEmail,
      totalMinor: 13000,
      lines: invoice.lines,
      exclusions: invoice.exclusions,
      approvedAt: now.toISOString(),
      approvedBy: "contractor",
    };
    store.seed(workspaceWith(invoice));
    const paypal = client({
      async getInvoice(id) {
        return remote({
          id,
          status: "PAID",
          due_amount: { currency_code: "USD", value: "0.00" },
          detail: { currency_code: "USD", metadata: { recipient_view_url: "https://www.sandbox.paypal.com/invoice/payerView/details/INV2-PAID" } },
        });
      },
    });
    const event = { id: "WH-1", event_type: "INVOICING.INVOICE.PAID", resource: { id: "INV2-PAID", status: "PAID" } };
    const first = await processWebhook(store, paypal, { workspaceId: "ws_1", event, verified: true, now });
    const second = await processWebhook(store, paypal, { workspaceId: "ws_1", event, verified: true, now });
    expect(first.status).toBe(200);
    expect(second).toEqual({ status: 200, duplicate: true });
    const saved = await store.getWorkspace("ws_1");
    expect(saved?.invoices[0]?.settlement).toBe("paid");
    expect(saved?.invoices[0]?.delivery).toBe("sent");
    expect(saved?.invoices[0]?.paypalRecipientViewUrl).toContain("paypal.com");
    expect(saved?.timeline.filter((item) => item.kind === "refresh")).toHaveLength(1);
    expect(() => assertNotDemoId("demo_inv_1042")).toThrow(/Demo/);
    await expect(approveInvoice(store, "ws_1", "demo_inv_1042", 1, "contractor", now)).rejects.toMatchObject({ code: "not_found" });
    const other = new MemoryBillingStore();
    other.seed(workspaceWith(draftInvoice(), "ws_other"));
    await expect(refreshPayPal(other, paypal, "ws_other", "inv_130", now)).rejects.toMatchObject({ code: "no_draft" });
  });

  it("surfaces multiple search matches as an operator error", async () => {
    const store = new MemoryBillingStore();
    store.seed(workspaceWith(draftInvoice()));
    await approveInvoice(store, "ws_1", "inv_130", 3, "contractor", now);
    const paypal = client({
      async createDraft() {
        throw new ServiceError("paypal_network", 504, "timeout", "uncertain");
      },
      async searchByNumber() {
        return [remote({ id: "INV2-A", status: "DRAFT" }), remote({ id: "INV2-B", status: "DRAFT" })];
      },
    });
    await expect(createPayPalDraft(store, paypal, "ws_1", "inv_130", now)).rejects.toMatchObject({ category: "operator" });
  });

  it("sends link-only without treating it as an email", async () => {
    const store = new MemoryBillingStore();
    store.seed(workspaceWith(draftInvoice()));
    await approveInvoice(store, "ws_1", "inv_130", 3, "contractor", now);
    const paypal = client({
      async getInvoice(id) {
        return remote({
          id,
          status: "SENT",
          detail: { currency_code: "USD", metadata: { recipient_view_url: "https://www.sandbox.paypal.com/invoice/p/INV2-ONE" } },
        });
      },
    });
    await createPayPalDraft(store, paypal, "ws_1", "inv_130", now);
    const shared = await deliverPayPal(store, paypal, "ws_1", "inv_130", "link", now);
    expect(shared.delivery).toBe("ready_to_share");
    expect(shared.deliveryMethod).toBe("link");
    expect(shared.paypalRecipientViewUrl).toContain("INV2-ONE");
    const observed = observePayPalInvoice(shared, remote({ status: "PAID" }));
    expect(observed.delivery).toBe("ready_to_share");
    expect(observed.settlement).toBe("paid");
  });

  it("verifies a PayPal webhook signature and rejects a tampered body", () => {
    const dir = mkdtempSync(join(tmpdir(), "done-due-cert-"));
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem"), "-days", "1", "-nodes", "-subj", "/CN=done-and-due-test"]);
    const privateKey = readFileSync(join(dir, "key.pem"));
    const certPem = readFileSync(join(dir, "cert.pem"), "utf8");
    const body = JSON.stringify({ id: "WH-9", event_type: "INVOICING.INVOICE.PAID" });
    const transmissionId = randomUUID();
    const transmissionTime = now.toISOString();
    const webhookId = "WEBHOOK_ID";
    const message = `${transmissionId}|${transmissionTime}|${webhookId}|${crc32(body)}`;
    const signature = createSign("RSA-SHA256").update(message).end().sign(privateKey).toString("base64");
    expect(
      verifyWebhookSignature({
        transmissionId,
        transmissionTime,
        webhookId,
        rawBody: body,
        signature,
        certPem,
        authAlgo: "SHA256withRSA",
      }),
    ).toBe(true);
    expect(
      verifyWebhookSignature({
        transmissionId,
        transmissionTime,
        webhookId,
        rawBody: body.replace("PAID", "DRAFT"),
        signature,
        certPem,
        authAlgo: "SHA256withRSA",
      }),
    ).toBe(false);
  });

  it("keeps delivery unchanged when PayPal rejects a reminder", async () => {
    const store = new MemoryBillingStore();
    const invoice = draftInvoice();
    invoice.approval = "approved";
    invoice.delivery = "sent";
    invoice.deliveryMethod = "email";
    invoice.paypalInvoiceId = "INV2-ONE";
    store.seed(workspaceWith(invoice));
    const paypal = client({
      remind: async () => {
        throw new ServiceError("paypal_http", 422, "PayPal rejected the reminder.", "bad_input");
      },
    });
    await expect(remindPayPal(store, paypal, "ws_1", invoice.id, { subject: "Payment due", note: "Please pay." }, now)).rejects.toMatchObject({ code: "reminder_rejected" });
    expect((await store.getWorkspace("ws_1"))?.invoices[0]?.delivery).toBe("sent");
  });
});

describe("stale extraction", () => {
  it("does not apply a result whose photo version moved", () => {
    const photo = { ...samplePhoto(), version: 4 };
    const applied = applyExtraction({
      extraction: {
        lines: [
          {
            description: "Standard mixer tap",
            catalogQuery: "standard mixer tap",
            quantityDecimalOrNull: "1",
            unitOrNull: "each",
            ownership: "contractor",
            transcriptQuoteOrNull: "standard mixer tap",
            photoRegionOrNull: { label: "Standard mixer tap", box_2d: [100, 300, 500, 800] },
            reviewReasonOrNull: null,
          },
        ],
        exclusions: [],
        questions: [],
      },
      catalog: defaultCatalog(),
      transcript: { revisionId: "rev", text: SAMPLE_TRANSCRIPT, source: "typed", createdAt: now.toISOString() },
      photo,
    });
    expect(applied.lines[0]?.photoRegion?.photoVersion).toBe(4);
    expect(applied.lines[0]?.photoRegion?.photoId).toBe(photo.id);
  });
});
