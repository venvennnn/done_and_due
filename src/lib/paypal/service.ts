import { approvalBlockers, reviewFlags } from "@/lib/domain/invoice-math";
import { createId, ServiceError } from "@/lib/domain/ids";
import { buildTimeline, changeDelivery } from "@/lib/domain/mutate";
import type { Invoice, OperationRecord, OperationType, TimelineEvent, WebhookReceipt } from "@/lib/domain/types";
import { buildPayPalInvoiceBody, idempotencyKey, observePayPalInvoice, type PayPalInvoice } from "./map";
import type { PayPalClient } from "./client";

export type StoredWorkspace = {
  id: string;
  ownerId: string;
  contractorName: string;
  currency: string;
  customers: import("@/lib/domain/types").Customer[];
  jobs: import("@/lib/domain/types").Job[];
  invoices: Invoice[];
  catalog: import("@/lib/domain/types").CatalogItem[];
  timeline: TimelineEvent[];
  payments: import("@/lib/domain/types").PaymentRecord[];
  operations: OperationRecord[];
  webhooks: WebhookReceipt[];
  aiRuns: import("@/lib/domain/types").AiRun[];
};

export interface BillingStore {
  getWorkspace(id: string): Promise<StoredWorkspace | null>;
  saveWorkspace(workspace: StoredWorkspace): Promise<void>;
}

const CLAIM_STALE_MS = 60_000;

function clone<T>(value: T): T {
  return structuredClone(value);
}

async function mutate<T>(store: BillingStore, workspaceId: string, fn: (workspace: StoredWorkspace) => T): Promise<T> {
  const workspace = await store.getWorkspace(workspaceId);
  if (!workspace) throw new ServiceError("not_found", 404, "Workspace not found.");
  const draft = clone(workspace);
  const result = fn(draft);
  await store.saveWorkspace(draft);
  return result;
}

function invoiceOf(workspace: StoredWorkspace, invoiceId: string): Invoice {
  const invoice = workspace.invoices.find((item) => item.id === invoiceId && !item.id.startsWith("demo_"));
  if (!invoice) throw new ServiceError("not_found", 404, "Invoice not found in this workspace.");
  return invoice;
}

export async function approveInvoice(store: BillingStore, workspaceId: string, invoiceId: string, expectedRevision: number, actor: string, now = new Date()): Promise<Invoice> {
  return mutate(store, workspaceId, (workspace) => {
    const invoice = invoiceOf(workspace, invoiceId);
    if (invoice.approval === "approved" && invoice.revision === expectedRevision && invoice.snapshot) return invoice;
    if (invoice.revision !== expectedRevision) throw new ServiceError("stale_revision", 409, "This draft changed. Reload it before approving.");
    const job = workspace.jobs.find((item) => item.id === invoice.jobId);
    const blockers = approvalBlockers(reviewFlags({ invoice, expectedRevision, catalog: workspace.catalog, transcriptText: job?.transcript?.text }));
    if (blockers.length) throw new ServiceError("blocked", 400, blockers.map((flag) => flag.message).join(" "));
    const stamp = now.toISOString();
    invoice.approval = "approved";
    invoice.snapshot = {
      id: createId("snap"),
      invoiceId: invoice.id,
      revision: invoice.revision,
      currency: invoice.currency,
      recipientName: invoice.recipientName,
      recipientEmail: invoice.recipientEmail,
      totalMinor: invoice.totalMinor,
      lines: clone(invoice.lines),
      exclusions: clone(invoice.exclusions),
      approvedAt: stamp,
      approvedBy: actor,
    };
    invoice.updatedAt = stamp;
    workspace.timeline.unshift(buildTimeline({ invoice, message: `Approved ${invoice.number}`, kind: "approval", at: stamp, actor, simulated: false }));
    return invoice;
  });
}

function operationFor(workspace: StoredWorkspace, snapshotId: string, type: OperationType): OperationRecord | undefined {
  return workspace.operations.find((operation) => operation.snapshotId === snapshotId && operation.operationType === type);
}

function claim(workspace: StoredWorkspace, invoice: Invoice, type: OperationType, now: Date): { operation: OperationRecord; replay: boolean } {
  if (!invoice.snapshot || invoice.approval !== "approved") {
    throw new ServiceError("not_approved", 409, "Approve the exact bill before calling PayPal.");
  }
  if (invoice.delivery === "sent" || invoice.delivery === "ready_to_share") {
    throw new ServiceError("readonly", 409, "Sent invoices stay read-only in this release.");
  }
  const existing = operationFor(workspace, invoice.snapshot.id, type);
  if (existing?.status === "succeeded") return { operation: existing, replay: true };
  if (existing?.status === "outcome_unknown") {
    throw new ServiceError("needs_reconciliation", 409, "The last PayPal call had an uncertain result. Reconcile it before trying again.", "uncertain");
  }
  if (existing?.status === "claimed") {
    const age = now.getTime() - Date.parse(existing.claimedAt);
    if (age < CLAIM_STALE_MS) throw new ServiceError("in_progress", 409, "That PayPal action is already in progress.");
    existing.status = "outcome_unknown";
    existing.errorCategory = "uncertain";
    existing.finishedAt = now.toISOString();
    invoice.delivery = "needs_reconciliation";
    throw new ServiceError("needs_reconciliation", 409, "A previous PayPal call did not finish. Reconcile it before trying again.", "uncertain");
  }
  if (existing?.status === "failed_safe_to_retry") {
    existing.status = "claimed";
    existing.claimedAt = now.toISOString();
    existing.finishedAt = null;
    existing.errorCategory = null;
    return { operation: existing, replay: false };
  }
  const operation: OperationRecord = {
    id: createId("op"),
    workspaceId: workspace.id,
    invoiceId: invoice.id,
    snapshotId: invoice.snapshot.id,
    operationType: type,
    status: "claimed",
    idempotencyKey: idempotencyKey(invoice.snapshot.id, type),
    paypalInvoiceId: invoice.paypalInvoiceId,
    errorCategory: null,
    correlationId: null,
    claimedAt: now.toISOString(),
    finishedAt: null,
  };
  workspace.operations.push(operation);
  return { operation, replay: false };
}

async function withClaim(
  store: BillingStore,
  workspaceId: string,
  invoiceId: string,
  type: OperationType,
  now: Date,
): Promise<{ operation: OperationRecord; replay: boolean; invoice: Invoice }> {
  return mutate(store, workspaceId, (workspace) => {
    const invoice = invoiceOf(workspace, invoiceId);
    const claimed = claim(workspace, invoice, type, now);
    return { ...claimed, invoice: clone(invoice) };
  });
}

function finish(workspace: StoredWorkspace, operationId: string, status: OperationRecord["status"], extra: Partial<OperationRecord>, now: Date) {
  const operation = workspace.operations.find((item) => item.id === operationId);
  if (!operation) return;
  operation.status = status;
  operation.finishedAt = now.toISOString();
  Object.assign(operation, extra);
}

export async function createPayPalDraft(store: BillingStore, paypal: PayPalClient, workspaceId: string, invoiceId: string, now = new Date()): Promise<Invoice> {
  const claimed = await withClaim(store, workspaceId, invoiceId, "create_draft", now);
  if (claimed.replay && claimed.invoice.paypalInvoiceId) return claimed.invoice;
  if (claimed.invoice.paypalInvoiceId && claimed.replay) return claimed.invoice;
  const body = buildPayPalInvoiceBody(claimed.invoice);
  try {
    const created = await paypal.createDraft(body, claimed.operation.idempotencyKey);
    return mutate(store, workspaceId, (workspace) => {
      const invoice = invoiceOf(workspace, invoiceId);
      invoice.paypalInvoiceId = created.id;
      invoice.delivery = "provider_draft";
      invoice.updatedAt = now.toISOString();
      finish(workspace, claimed.operation.id, "succeeded", { paypalInvoiceId: created.id }, now);
      workspace.timeline.unshift(
        buildTimeline({ invoice, message: "PayPal draft created", kind: "paypal_draft", at: now.toISOString(), actor: "paypal", simulated: false }),
      );
      return clone(invoice);
    });
  } catch (error) {
    const serviceError = error instanceof ServiceError ? error : new ServiceError("paypal_network", 504, "PayPal did not respond.", "uncertain");
    if (serviceError.category === "uncertain" || serviceError.category === "transient") {
      const reconciled = await reconcileByNumber(store, paypal, workspaceId, invoiceId, claimed.operation.id, now);
      if (reconciled) return reconciled;
    }
    await mutate(store, workspaceId, (workspace) => {
      const invoice = invoiceOf(workspace, invoiceId);
      const status = serviceError.category === "bad_input" || serviceError.category === "permission" ? "failed_safe_to_retry" : "outcome_unknown";
      finish(workspace, claimed.operation.id, status, { errorCategory: serviceError.category ?? "uncertain" }, now);
      if (status === "outcome_unknown") invoice.delivery = changeDelivery(invoice, "needs_reconciliation", "paypal_sandbox", now.toISOString()).delivery;
    });
    throw serviceError;
  }
}

async function reconcileByNumber(store: BillingStore, paypal: PayPalClient, workspaceId: string, invoiceId: string, operationId: string, now: Date): Promise<Invoice | null> {
  const workspace = await store.getWorkspace(workspaceId);
  const invoice = workspace?.invoices.find((item) => item.id === invoiceId);
  if (!invoice) return null;
  let matches: PayPalInvoice[] = [];
  try {
    matches = await paypal.searchByNumber(invoice.number);
  } catch {
    return null;
  }
  if (matches.length > 1) {
    await mutate(store, workspaceId, (draft) => {
      finish(draft, operationId, "outcome_unknown", { errorCategory: "operator" }, now);
      const current = invoiceOf(draft, invoiceId);
      current.delivery = "needs_reconciliation";
    });
    throw new ServiceError("ambiguous_remote", 409, "More than one PayPal invoice uses this number. An operator has to choose the right one.", "operator");
  }
  if (matches.length === 0) return null;
  const remote = matches[0];
  return mutate(store, workspaceId, (draft) => {
    const current = invoiceOf(draft, invoiceId);
    current.paypalInvoiceId = remote.id;
    const observation = observePayPalInvoice(current, remote);
    current.settlement = observation.settlement;
    current.delivery = observation.delivery === "needs_reconciliation" ? "provider_draft" : observation.delivery;
    if (remote.status === "DRAFT") current.delivery = "provider_draft";
    current.lastVerifiedAt = now.toISOString();
    finish(draft, operationId, "succeeded", { paypalInvoiceId: remote.id }, now);
    return clone(current);
  });
}

export async function deliverPayPal(
  store: BillingStore,
  paypal: PayPalClient,
  workspaceId: string,
  invoiceId: string,
  method: "email" | "link",
  now = new Date(),
): Promise<Invoice> {
  const type: OperationType = method === "email" ? "send_email" : "create_share_link";
  const current = await store.getWorkspace(workspaceId);
  const invoice = current?.invoices.find((item) => item.id === invoiceId);
  if (!invoice?.paypalInvoiceId) throw new ServiceError("no_draft", 409, "Create the PayPal draft before sending it.");
  const claimed = await withClaim(store, workspaceId, invoiceId, type, now);
  if (claimed.replay) {
    const latest = await store.getWorkspace(workspaceId);
    return latest!.invoices.find((item) => item.id === invoiceId)!;
  }
  try {
    await paypal.send(
      invoice.paypalInvoiceId,
      {
        send_to_recipient: method === "email",
        send_to_invoicer: false,
      },
      claimed.operation.idempotencyKey,
    );
    const remote = await paypal.getInvoice(invoice.paypalInvoiceId);
    return mutate(store, workspaceId, (workspace) => {
      const saved = invoiceOf(workspace, invoiceId);
      saved.deliveryMethod = method;
      const observation = observePayPalInvoice({ ...saved, deliveryMethod: method }, remote);
      saved.delivery = method === "link" ? "ready_to_share" : "sent";
      saved.settlement = observation.settlement;
      saved.amountDueMinor = observation.amountDueMinor ?? saved.totalMinor;
      saved.amountPaidMinor = observation.amountPaidMinor;
      if (observation.paypalRecipientViewUrl) saved.paypalRecipientViewUrl = observation.paypalRecipientViewUrl;
      saved.lastVerifiedAt = now.toISOString();
      finish(workspace, claimed.operation.id, "succeeded", { paypalInvoiceId: saved.paypalInvoiceId }, now);
      workspace.timeline.unshift(
        buildTimeline({
          invoice: saved,
          message: method === "link" ? "PayPal payment link is ready to share" : "Sent through PayPal",
          kind: "delivery",
          at: now.toISOString(),
          actor: "contractor",
          simulated: false,
        }),
      );
      return clone(saved);
    });
  } catch (error) {
    const serviceError = error instanceof ServiceError ? error : new ServiceError("paypal_network", 504, "PayPal did not respond.", "uncertain");
    await mutate(store, workspaceId, (workspace) => {
      const saved = invoiceOf(workspace, invoiceId);
      const status = serviceError.category === "bad_input" || serviceError.category === "permission" ? "failed_safe_to_retry" : "outcome_unknown";
      finish(workspace, claimed.operation.id, status, { errorCategory: serviceError.category ?? "uncertain" }, now);
      if (status === "outcome_unknown") saved.delivery = "needs_reconciliation";
    });
    throw serviceError;
  }
}

export async function refreshPayPal(store: BillingStore, paypal: PayPalClient, workspaceId: string, invoiceId: string, now = new Date()): Promise<Invoice> {
  const workspace = await store.getWorkspace(workspaceId);
  const invoice = workspace?.invoices.find((item) => item.id === invoiceId);
  if (!invoice?.paypalInvoiceId) throw new ServiceError("no_draft", 409, "This invoice has no PayPal id to refresh.");
  let remote = await paypal.getInvoice(invoice.paypalInvoiceId);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const latest = await store.getWorkspace(workspaceId);
    const current = latest?.invoices.find((item) => item.id === invoiceId);
    if (!current) throw new ServiceError("not_found", 404, "Invoice not found.");
    const expected = current.observationVersion;
    const observation = observePayPalInvoice(current, remote);
    const changed = observation.settlement !== current.settlement || observation.delivery !== current.delivery || observation.amountPaidMinor !== current.amountPaidMinor;
    const committed = await mutate(store, workspaceId, (draft) => {
      const row = invoiceOf(draft, invoiceId);
      if (row.observationVersion !== expected) return false;
      const before = { settlement: row.settlement, delivery: row.delivery, paid: row.amountPaidMinor };
      row.settlement = observation.settlement;
      row.delivery = observation.delivery;
      row.amountPaidMinor = observation.amountPaidMinor;
      row.amountDueMinor = observation.amountDueMinor;
      if (observation.paypalRecipientViewUrl) row.paypalRecipientViewUrl = observation.paypalRecipientViewUrl;
      row.lastVerifiedAt = now.toISOString();
      row.observationVersion = expected + 1;
      if (changed) {
        draft.timeline.unshift(
          buildTimeline({
            invoice: row,
            message: `PayPal status ${remote.status}`,
            kind: "refresh",
            at: now.toISOString(),
            actor: "paypal",
            simulated: false,
          }),
        );
        if (observation.amountPaidMinor > before.paid) {
          draft.payments.unshift({
            id: createId("pay"),
            invoiceId: row.id,
            amountMinor: observation.amountPaidMinor - before.paid,
            at: now.toISOString(),
            simulated: false,
            note: "Payment recorded from PayPal",
          });
        }
      }
      return true;
    });
    if (committed) {
      const saved = await store.getWorkspace(workspaceId);
      return saved!.invoices.find((item) => item.id === invoiceId)!;
    }
    remote = await paypal.getInvoice(invoice.paypalInvoiceId);
  }
  throw new ServiceError("conflict", 409, "A newer PayPal status was saved. Refresh again.");
}

export function sanitizeWebhookEvent(event: Record<string, unknown>): Record<string, unknown> {
  const resource = (event.resource ?? {}) as Record<string, unknown>;
  const invoice = (resource.invoice ?? resource) as Record<string, unknown>;
  return {
    id: event.id ?? null,
    event_type: event.event_type ?? null,
    invoice_id: invoice.id ?? null,
    status: invoice.status ?? null,
  };
}

export async function processWebhook(
  store: BillingStore,
  paypal: PayPalClient,
  input: {
    workspaceId: string;
    event: Record<string, unknown>;
    verified: boolean;
    now?: Date;
  },
): Promise<{ status: number; duplicate: boolean }> {
  if (!input.verified) return { status: 400, duplicate: false };
  const now = input.now ?? new Date();
  const eventId = String(input.event.id ?? "");
  if (!eventId) return { status: 400, duplicate: false };
  const workspace = await store.getWorkspace(input.workspaceId);
  if (!workspace) return { status: 500, duplicate: false };
  const existing = workspace.webhooks.find((receipt) => receipt.eventId === eventId);
  if (existing?.processStatus === "processed" || existing?.processStatus === "ignored") return { status: 200, duplicate: true };
  const sanitized = sanitizeWebhookEvent(input.event);
  const paypalId = String(sanitized.invoice_id ?? "");
  if (!existing) {
    workspace.webhooks.push({
      eventId,
      environment: "sandbox",
      invoiceId: null,
      processStatus: "received",
      sanitized,
      receivedAt: now.toISOString(),
      processedAt: null,
      error: null,
    });
    await store.saveWorkspace(workspace);
  }
  const invoice = workspace.invoices.find((item) => item.paypalInvoiceId === paypalId);
  if (!invoice || !paypalId) {
    await markWebhook(store, input.workspaceId, eventId, "ignored", null, now);
    return { status: 200, duplicate: false };
  }
  try {
    await refreshPayPal(store, paypal, input.workspaceId, invoice.id, now);
    await markWebhook(store, input.workspaceId, eventId, "processed", invoice.id, now);
    return { status: 200, duplicate: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "refresh failed";
    await markWebhook(store, input.workspaceId, eventId, "received", invoice.id, now, message);
    return { status: 500, duplicate: false };
  }
}

async function markWebhook(store: BillingStore, workspaceId: string, eventId: string, status: WebhookReceipt["processStatus"], invoiceId: string | null, now: Date, error?: string) {
  await mutate(store, workspaceId, (workspace) => {
    const receipt = workspace.webhooks.find((item) => item.eventId === eventId);
    if (!receipt) return;
    receipt.processStatus = status;
    receipt.invoiceId = invoiceId;
    receipt.processedAt = status === "received" ? null : now.toISOString();
    receipt.error = error ?? null;
  });
}

export function workspaceSnapshot(workspace: StoredWorkspace) {
  return {
    mode: "paypal_sandbox" as const,
    contractorName: workspace.contractorName,
    currency: workspace.currency,
    customers: workspace.customers,
    jobs: workspace.jobs,
    invoices: workspace.invoices,
    catalog: workspace.catalog,
    timeline: workspace.timeline,
    payments: workspace.payments,
  };
}
