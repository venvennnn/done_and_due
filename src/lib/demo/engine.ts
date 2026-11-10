import { approvalBlockers, reviewFlags } from "@/lib/domain/invoice-math";
import { createId, ServiceError } from "@/lib/domain/ids";
import {
  addCustomLine,
  applyRecipient,
  buildTimeline,
  changeDelivery,
  changeSettlement,
  clearMarkersForPhoto,
  patchLine,
  placeMarker,
  removeLine,
  touch,
  type LinePatch,
} from "@/lib/domain/mutate";
import { roundHalfAwayFromZero } from "@/lib/domain/money";
import { isSampleTranscript, SAMPLE_CUSTOMER, SAMPLE_TRANSCRIPT } from "@/lib/domain/sample";
import type { CatalogItem, Customer, Invoice, Job, JobAudio, JobPhoto, WorkspaceSnapshot } from "@/lib/domain/types";
import { createDemoState, DEMO_IDS, demoCatalog, samplePhoto, type DemoState } from "./seed";
import { draftFromTranscript } from "./sample-draft";

export type { DemoState };
export { createDemoState };

function clone<T>(value: T): T {
  return structuredClone(value);
}

function at(now: Date): string {
  return now.toISOString();
}

function mustJob(snapshot: WorkspaceSnapshot, jobId: string): Job {
  const job = snapshot.jobs.find((item) => item.id === jobId);
  if (!job) throw new ServiceError("not_found", 404, "That job is not in this demo workspace.");
  return job;
}

function mustInvoice(snapshot: WorkspaceSnapshot, invoiceId: string): Invoice {
  const invoice = snapshot.invoices.find((item) => item.id === invoiceId);
  if (!invoice) throw new ServiceError("not_found", 404, "That invoice is not in this demo workspace.");
  return invoice;
}

function invoiceForJob(snapshot: WorkspaceSnapshot, jobId: string): Invoice | undefined {
  return snapshot.invoices.find((invoice) => invoice.jobId === jobId);
}

function replaceInvoice(snapshot: WorkspaceSnapshot, invoice: Invoice): WorkspaceSnapshot {
  return { ...snapshot, invoices: snapshot.invoices.map((item) => (item.id === invoice.id ? invoice : item)) };
}

function replaceJob(snapshot: WorkspaceSnapshot, job: Job): WorkspaceSnapshot {
  return { ...snapshot, jobs: snapshot.jobs.map((item) => (item.id === job.id ? job : item)) };
}

export function resetDemo(now = new Date()): DemoState {
  return createDemoState(now);
}

export function loadSampleJob(state: DemoState, now = new Date()): { state: DemoState; jobId: string } {
  const next = clone(state);
  const stamp = at(now);
  const catalog = next.snapshot.catalog;
  const photo = samplePhoto();
  const transcript = {
    revisionId: createId("demo_rev"),
    text: SAMPLE_TRANSCRIPT,
    source: "sample" as const,
    createdAt: stamp,
  };
  const drafted = draftFromTranscript({ text: SAMPLE_TRANSCRIPT, catalog, transcript, photo, idPrefix: "demo_sample" });
  const job: Job = {
    id: DEMO_IDS.jobTap,
    title: "Kitchen tap replacement",
    customerId: DEMO_IDS.emma,
    photo,
    audio: null,
    transcript,
    createdAt: next.snapshot.jobs.find((item) => item.id === DEMO_IDS.jobTap)?.createdAt ?? stamp,
    updatedAt: stamp,
    sample: true,
  };
  if (!next.snapshot.jobs.some((item) => item.id === job.id)) next.snapshot.jobs.push(job);
  else next.snapshot = replaceJob(next.snapshot, job);
  const invoice: Invoice = {
    id: DEMO_IDS.invTap,
    jobId: job.id,
    number: "DD-1042",
    customerId: DEMO_IDS.emma,
    recipientName: SAMPLE_CUSTOMER.name,
    recipientEmail: SAMPLE_CUSTOMER.demoEmail,
    currency: "USD",
    approval: "editing",
    delivery: "not_prepared",
    settlement: "unpaid",
    deliveryMethod: null,
    revision: 1,
    observationVersion: 1,
    lines: drafted.lines,
    exclusions: drafted.exclusions,
    questions: drafted.questions,
    totalMinor: 0,
    amountPaidMinor: 0,
    amountDueMinor: null,
    snapshot: null,
    paypalInvoiceId: null,
    paypalRecipientViewUrl: null,
    lastVerifiedAt: null,
    seeded: true,
    simulated: true,
    sample: true,
    createdAt: stamp,
    updatedAt: stamp,
  };
  const synced = { ...invoice, ...{ totalMinor: 0 } };
  const withTotal = touch({ ...synced, revision: 0 }, stamp);
  if (!next.snapshot.invoices.some((item) => item.id === invoice.id)) next.snapshot.invoices.push(withTotal);
  else next.snapshot = replaceInvoice(next.snapshot, withTotal);
  return { state: next, jobId: job.id };
}

export function loadDurationExample(state: DemoState, now = new Date()): { state: DemoState; jobId: string } {
  const loaded = loadSampleJob(state, now);
  const text = "Replaced the kitchen tap with a standard mixer tap. Labor. The customer supplied the connectors.";
  const captured = updateCapture(loaded.state, loaded.jobId, { transcriptText: text }, now);
  const drafted = createDraft(captured, loaded.jobId, now, true);
  return { state: drafted.state, jobId: loaded.jobId };
}

export function createJob(state: DemoState, now = new Date()): { state: DemoState; jobId: string } {
  const next = clone(state);
  const stamp = at(now);
  const job: Job = {
    id: createId("demo_job"),
    title: "New job",
    customerId: null,
    photo: null,
    audio: null,
    transcript: { revisionId: createId("demo_rev"), text: "", source: "typed", createdAt: stamp },
    createdAt: stamp,
    updatedAt: stamp,
    sample: false,
  };
  next.snapshot.jobs.unshift(job);
  return { state: next, jobId: job.id };
}

export function updateCapture(
  state: DemoState,
  jobId: string,
  patch: {
    title?: string;
    customerId?: string | null;
    transcriptText?: string;
    photo?: JobPhoto | null;
    audio?: JobAudio | null;
  },
  now = new Date(),
): DemoState {
  const next = clone(state);
  const stamp = at(now);
  const job = mustJob(next.snapshot, jobId);
  const photoChanged = patch.photo !== undefined && patch.photo?.id !== job.photo?.id;
  const updated: Job = {
    ...job,
    title: patch.title?.trim() || job.title,
    customerId: patch.customerId !== undefined ? patch.customerId : job.customerId,
    photo: patch.photo !== undefined ? patch.photo : job.photo,
    audio: patch.audio !== undefined ? patch.audio : job.audio,
    updatedAt: stamp,
  };
  if (patch.transcriptText !== undefined) {
    updated.transcript = {
      revisionId: createId("demo_rev"),
      text: patch.transcriptText,
      source: isSampleTranscript(patch.transcriptText) ? "sample" : "typed",
      createdAt: stamp,
    };
  }
  next.snapshot = replaceJob(next.snapshot, updated);
  const invoice = invoiceForJob(next.snapshot, jobId);
  if (invoice && invoice.approval === "editing") {
    let revised = invoice;
    if (photoChanged && job.photo) revised = clearMarkersForPhoto(revised, job.photo.id);
    if (patch.photo && patch.photo.id !== SAMPLE_PHOTO_ID) {
      revised = { ...revised, lines: revised.lines.map((line) => ({ ...line, photoRegion: null })) };
    }
    if (patch.customerId !== undefined) {
      const customer = next.snapshot.customers.find((item) => item.id === patch.customerId);
      revised = {
        ...revised,
        customerId: patch.customerId,
        recipientName: customer?.name ?? revised.recipientName,
        recipientEmail: customer?.email ?? "",
      };
    }
    next.snapshot = replaceInvoice(next.snapshot, touch(revised, stamp));
  }
  return next;
}

const SAMPLE_PHOTO_ID = samplePhoto().id;

export function createDraft(state: DemoState, jobId: string, now = new Date(), confirmReplace = false): { state: DemoState; invoiceId: string } {
  const next = clone(state);
  const stamp = at(now);
  const job = mustJob(next.snapshot, jobId);
  if (!job.transcript?.text.trim()) {
    throw new ServiceError("missing_note", 400, "Add a note before creating a draft. You can type it if recording is unavailable.");
  }
  const existing = invoiceForJob(next.snapshot, jobId);
  if (existing?.approval === "approved") {
    throw new ServiceError("locked", 409, "This bill is already approved. Revise it before replacing the draft.");
  }
  if (existing && existing.lines.some((line) => line.corrections.length > 0) && !confirmReplace) {
    throw new ServiceError("preserve_edits", 409, "This draft has edits. Confirm if you want to replace them.");
  }
  const transcript = job.transcript;
  const drafted = draftFromTranscript({
    text: transcript.text,
    catalog: next.snapshot.catalog,
    transcript,
    photo: job.photo,
  });
  const customer = next.snapshot.customers.find((item) => item.id === job.customerId);
  if (existing) {
    const replaced = touch(
      {
        ...existing,
        customerId: job.customerId,
        recipientName: customer?.name ?? existing.recipientName,
        recipientEmail: customer?.email ?? existing.recipientEmail,
        lines: drafted.lines,
        exclusions: drafted.exclusions,
        questions: drafted.questions,
        sample: job.sample || isSampleTranscript(transcript.text),
      },
      stamp,
    );
    next.snapshot = replaceInvoice(next.snapshot, replaced);
    return { state: next, invoiceId: replaced.id };
  }
  next.invoiceSeq += 1;
  const invoice = touch(
    {
      id: createId("demo_inv"),
      jobId,
      number: `DD-${next.invoiceSeq}`,
      customerId: job.customerId,
      recipientName: customer?.name ?? "",
      recipientEmail: customer?.email ?? "",
      currency: next.snapshot.currency,
      approval: "editing",
      delivery: "not_prepared",
      settlement: "unpaid",
      deliveryMethod: null,
      revision: 0,
      observationVersion: 1,
      lines: drafted.lines,
      exclusions: drafted.exclusions,
      questions: drafted.questions,
      totalMinor: 0,
      amountPaidMinor: 0,
      amountDueMinor: null,
      snapshot: null,
      paypalInvoiceId: null,
      paypalRecipientViewUrl: null,
      lastVerifiedAt: null,
      seeded: false,
      simulated: true,
      sample: Boolean(job.sample || isSampleTranscript(transcript.text)),
      createdAt: stamp,
      updatedAt: stamp,
    },
    stamp,
  );
  next.snapshot.invoices.unshift(invoice);
  return { state: next, invoiceId: invoice.id };
}

export function updateInvoiceLine(state: DemoState, invoiceId: string, lineId: string, patch: LinePatch, now = new Date()): DemoState {
  const next = clone(state);
  const stamp = at(now);
  const invoice = mustInvoice(next.snapshot, invoiceId);
  const job = mustJob(next.snapshot, invoice.jobId);
  const lines = invoice.lines.map((line) => (line.id === lineId ? patchLine(line, patch, next.snapshot.catalog, stamp, job.transcript?.text) : line));
  if (!lines.some((line) => line.id === lineId)) throw new ServiceError("not_found", 404, "That line is not on the draft.");
  next.snapshot = replaceInvoice(next.snapshot, touch({ ...invoice, lines }, stamp));
  return next;
}

export function updateRecipient(state: DemoState, invoiceId: string, recipient: { name?: string; email?: string }, now = new Date()): DemoState {
  const next = clone(state);
  const invoice = mustInvoice(next.snapshot, invoiceId);
  next.snapshot = replaceInvoice(next.snapshot, applyRecipient(invoice, recipient, at(now)));
  return next;
}

export function addLine(state: DemoState, invoiceId: string, now = new Date()): DemoState {
  const next = clone(state);
  next.snapshot = replaceInvoice(next.snapshot, addCustomLine(mustInvoice(next.snapshot, invoiceId), at(now)));
  return next;
}

export function deleteLine(state: DemoState, invoiceId: string, lineId: string, now = new Date()): DemoState {
  const next = clone(state);
  next.snapshot = replaceInvoice(next.snapshot, removeLine(mustInvoice(next.snapshot, invoiceId), lineId, at(now)));
  return next;
}

export function setMarker(state: DemoState, invoiceId: string, lineId: string, box: [number, number, number, number], now = new Date()): DemoState {
  const next = clone(state);
  const invoice = mustInvoice(next.snapshot, invoiceId);
  const job = mustJob(next.snapshot, invoice.jobId);
  next.snapshot = replaceInvoice(next.snapshot, placeMarker(invoice, lineId, job.photo, box, at(now)));
  return next;
}

export function approveInvoice(state: DemoState, invoiceId: string, expectedRevision: number, now = new Date()): DemoState {
  const next = clone(state);
  const stamp = at(now);
  const invoice = mustInvoice(next.snapshot, invoiceId);
  if (invoice.approval === "approved" && invoice.revision === expectedRevision && invoice.snapshot) return next;
  if (invoice.revision !== expectedRevision) {
    throw new ServiceError("stale_revision", 409, "This draft changed. Reload it before approving.");
  }
  const flags = reviewFlags({ invoice, expectedRevision, catalog: next.snapshot.catalog, transcriptText: mustJob(next.snapshot, invoice.jobId).transcript?.text });
  const blockers = approvalBlockers(flags);
  if (blockers.length > 0) {
    throw new ServiceError("blocked", 400, blockers.map((flag) => flag.message).join(" "));
  }
  const snapshotId = createId("demo_snap");
  const approved: Invoice = {
    ...invoice,
    approval: "approved",
    snapshot: {
      id: snapshotId,
      invoiceId: invoice.id,
      revision: invoice.revision,
      currency: invoice.currency,
      recipientName: invoice.recipientName,
      recipientEmail: invoice.recipientEmail,
      totalMinor: invoice.totalMinor,
      lines: clone(invoice.lines),
      exclusions: clone(invoice.exclusions),
      approvedAt: stamp,
      approvedBy: "contractor",
    },
    updatedAt: stamp,
  };
  next.snapshot = replaceInvoice(next.snapshot, approved);
  next.snapshot.timeline.unshift(
    buildTimeline({ invoice: approved, message: `Approved ${approved.number}`, kind: "approval", at: stamp, actor: "contractor", simulated: true }),
  );
  return next;
}

export function simulateSend(state: DemoState, invoiceId: string, now = new Date()): DemoState {
  const next = clone(state);
  const stamp = at(now);
  const invoice = mustInvoice(next.snapshot, invoiceId);
  if (invoice.approval !== "approved" || !invoice.snapshot) {
    throw new ServiceError("not_approved", 409, "Approve the bill before simulating delivery.");
  }
  if (invoice.delivery === "sent" || invoice.delivery === "ready_to_share") return next;
  const sent = changeDelivery(invoice, "sent", "demo", stamp);
  sent.deliveryMethod = "email";
  sent.simulated = true;
  next.snapshot = replaceInvoice(next.snapshot, sent);
  next.snapshot.timeline.unshift(
    buildTimeline({
      invoice: sent,
      message: `Simulated send to ${sent.recipientName}`,
      kind: "delivery",
      at: stamp,
      actor: "demo_simulation",
      simulated: true,
    }),
  );
  return next;
}

export function simulateSettlement(state: DemoState, invoiceId: string, target: "pending" | "partially_paid" | "paid", now = new Date()): DemoState {
  const next = clone(state);
  const stamp = at(now);
  const invoice = mustInvoice(next.snapshot, invoiceId);
  if (invoice.delivery !== "sent" && invoice.delivery !== "ready_to_share") {
    throw new ServiceError("not_delivered", 409, "Simulate sending before simulating a payment. Delivery is not inferred from payment.");
  }
  const updated = changeSettlement(invoice, target, stamp);
  updated.simulated = true;
  updated.lastVerifiedAt = stamp;
  const total = updated.totalMinor;
  if (target === "pending") {
    updated.amountDueMinor = Math.max(total - updated.amountPaidMinor, 0);
  } else if (target === "partially_paid") {
    const paid = roundHalfAwayFromZero(total, 2);
    const delta = Math.max(paid - updated.amountPaidMinor, 0);
    updated.amountPaidMinor = paid;
    updated.amountDueMinor = total - paid;
    if (delta > 0) {
      next.snapshot.payments.unshift({
        id: createId("demo_pay"),
        invoiceId,
        amountMinor: delta,
        at: stamp,
        simulated: true,
        note: "Simulated partial payment",
      });
    }
  } else if (target === "paid") {
    const delta = Math.max(total - updated.amountPaidMinor, 0);
    updated.amountPaidMinor = total;
    updated.amountDueMinor = 0;
    if (delta > 0) {
      next.snapshot.payments.unshift({
        id: createId("demo_pay"),
        invoiceId,
        amountMinor: delta,
        at: stamp,
        simulated: true,
        note: "Simulated payment in full",
      });
    }
  }
  next.snapshot = replaceInvoice(next.snapshot, updated);
  const label =
    target === "pending" ? "Simulated payment pending" : target === "partially_paid" ? "Simulated partial payment" : "Simulated payment in full";
  next.snapshot.timeline.unshift(
    buildTimeline({ invoice: updated, message: label, kind: "payment", at: stamp, actor: "demo_simulation", simulated: true }),
  );
  return next;
}

export function addCustomer(state: DemoState, input: { name: string; email: string }, now = new Date()): { state: DemoState; customerId: string } {
  const name = input.name.trim();
  const email = input.email.trim();
  if (!name) throw new ServiceError("bad_customer", 400, "Enter the customer's name.");
  const next = clone(state);
  const existing = next.snapshot.customers.find((customer) => customer.email.toLowerCase() === email.toLowerCase() && email);
  if (existing) return { state: next, customerId: existing.id };
  const customer: Customer = { id: createId("demo_cus"), name, email, createdAt: at(now) };
  next.snapshot.customers.unshift(customer);
  return { state: next, customerId: customer.id };
}

export function saveCatalogItem(
  state: DemoState,
  input: { id?: string; name: string; unit: string; rateMinor: number; aliases: string[] },
  now = new Date(),
): DemoState {
  const next = clone(state);
  const name = input.name.trim();
  if (!name) throw new ServiceError("bad_catalog", 400, "Enter a price-list name.");
  if (!Number.isInteger(input.rateMinor) || input.rateMinor < 0) throw new ServiceError("bad_rate", 400, "Enter a rate of zero or more.");
  if (input.id) {
    next.snapshot.catalog = next.snapshot.catalog.map((item) =>
      item.id === input.id && item.active
        ? { ...item, name, unit: input.unit, rateMinor: input.rateMinor, aliases: cleanAliases(input.aliases) }
        : item,
    );
    return next;
  }
  const item: CatalogItem = {
    id: createId("demo_cat"),
    name,
    unit: input.unit || "each",
    rateMinor: input.rateMinor,
    aliases: cleanAliases(input.aliases),
    active: true,
    retiredAt: null,
  };
  next.snapshot.catalog.unshift(item);
  void now;
  return next;
}

export function retireCatalogItem(state: DemoState, itemId: string, now = new Date()): DemoState {
  const next = clone(state);
  next.snapshot.catalog = next.snapshot.catalog.map((item) =>
    item.id === itemId ? { ...item, active: false, retiredAt: at(now) } : item,
  );
  return next;
}

function cleanAliases(aliases: string[]): string[] {
  return [...new Set(aliases.map((alias) => alias.trim()).filter(Boolean))];
}

export function blankDemoCatalog(): CatalogItem[] {
  return demoCatalog();
}
