import { DEMO_FRIDAY, DEMO_REFERENCE_DATE, emptyLedger } from "@/lib/domain/cashflow";
import { syncTotals } from "@/lib/domain/invoice-math";
import { defaultCatalog, SAMPLE_CUSTOMER, SAMPLE_PHOTO, SAMPLE_TRANSCRIPT } from "@/lib/domain/sample";
import type { CatalogItem, Customer, Invoice, InvoiceLine, Job, PaymentRecord, TimelineEvent, WorkspaceSnapshot } from "@/lib/domain/types";
import { draftFromTranscript } from "./sample-draft";

export const DEMO_IDS = {
  emma: "demo_cus_emma",
  daniel: "demo_cus_daniel",
  maya: "demo_cus_maya",
  alex: "demo_cus_alex",
  jamie: "demo_cus_jamie",
  jobJamie: "demo_job_jamie",
  invJamie: "demo_inv_023",
  jobTap: "demo_job_tap",
  jobBoiler: "demo_job_boiler",
  jobGarden: "demo_job_garden",
  jobCallout: "demo_job_callout",
  jobRadiator: "demo_job_radiator",
  jobBoilerPaid: "demo_job_boiler_paid",
  jobGardenPaid: "demo_job_garden_paid",
  jobSeal: "demo_job_seal",
  invTap: "demo_inv_1042",
  invBoilerDraft: "demo_inv_1041",
  invGardenDraft: "demo_inv_1040",
  invCallout: "demo_inv_1038",
  invRadiator: "demo_inv_1037",
  invGardenPaid: "demo_inv_1036",
  invBoilerPaid: "demo_inv_1035",
  invSeal: "demo_inv_1034",
};

function daysAgo(now: Date, days: number, hours = 10): string {
  const date = new Date(now);
  date.setDate(date.getDate() - days);
  date.setHours(hours, 15, 0, 0);
  return date.toISOString();
}

function monthsAgo(now: Date, months: number): string {
  const date = new Date(now.getFullYear(), now.getMonth() - months, 12, 11, 0, 0);
  return date.toISOString();
}

export function demoCatalog(): CatalogItem[] {
  return defaultCatalog().map((item) => ({ ...item, id: `demo_${item.id}` }));
}

function line(partial: Pick<InvoiceLine, "id" | "description" | "quantity" | "unit" | "rateMinor" | "catalogItemId"> & { sortOrder?: number }): InvoiceLine {
  return {
    id: partial.id,
    sortOrder: partial.sortOrder ?? 0,
    description: partial.description,
    catalogQuery: partial.description,
    catalogItemId: partial.catalogItemId,
    quantity: partial.quantity,
    unit: partial.unit,
    rateMinor: partial.rateMinor,
    ownership: "contractor",
    excluded: false,
    exclusionReason: null,
    transcriptQuote: null,
    transcriptSpan: null,
    photoRegion: null,
    match: { status: "exact", reason: "seed", score: 1, margin: 1, candidates: [] },
    provenance: { identity: "catalog", quantity: "contractor", duration: "contractor", ownership: "contractor", rate: "catalog" },
    reviewReason: null,
    contractorConfirmed: true,
    duplicateConfirmed: false,
    proposed: null,
    corrections: [],
  };
}

function customer(id: string, name: string, email: string, at: string): Customer {
  return { id, name, email, createdAt: at };
}

export function samplePhoto(version = 1) {
  return {
    id: SAMPLE_PHOTO.id,
    version,
    width: SAMPLE_PHOTO.width,
    height: SAMPLE_PHOTO.height,
    mimeType: SAMPLE_PHOTO.mimeType,
    source: "sample" as const,
    url: SAMPLE_PHOTO.url,
    storagePath: null,
  };
}

export function buildSampleInvoice(now: Date, catalog: CatalogItem[]): Invoice {
  const at = now.toISOString();
  const transcript = {
    revisionId: "demo_rev_sample",
    text: SAMPLE_TRANSCRIPT,
    source: "sample" as const,
    createdAt: at,
  };
  const photo = samplePhoto();
  const drafted = draftFromTranscript({
    text: SAMPLE_TRANSCRIPT,
    catalog,
    transcript,
    photo,
    idPrefix: "demo_sample",
  });
  return syncTotals({
    id: DEMO_IDS.invTap,
    jobId: DEMO_IDS.jobTap,
    number: "INV-024",
    customerId: DEMO_IDS.alex,
    dueDate: DEMO_REFERENCE_DATE,
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
    amountDueMinor: 10000,
    snapshot: null,
    paypalInvoiceId: null,
    paypalRecipientViewUrl: null,
    lastVerifiedAt: null,
    seeded: true,
    simulated: true,
    sample: true,
    createdAt: at,
    updatedAt: at,
  });
}

export function createDemoSnapshot(now = new Date()): WorkspaceSnapshot {
  const catalog = demoCatalog();
  const sample = buildSampleInvoice(now, catalog);
  const customers = [
    customer(DEMO_IDS.emma, "Emma Wilson", "emma.wilson@example.com", daysAgo(now, 40)),
    customer(DEMO_IDS.daniel, "Daniel Lee", "daniel.lee@example.com", daysAgo(now, 30)),
    customer(DEMO_IDS.maya, "Maya Patel", "maya.patel@example.com", daysAgo(now, 20)),
    customer(DEMO_IDS.alex, "Alex Morgan", SAMPLE_CUSTOMER.demoEmail, daysAgo(now, 15)),
    customer(DEMO_IDS.jamie, "Jamie Reed", "jamie.reed@example.com", daysAgo(now, 12)),
  ];

  const jobs: Job[] = [
    {
      id: DEMO_IDS.jobTap,
      title: "Kitchen tap replacement",
      customerId: DEMO_IDS.alex,
      photo: samplePhoto(),
      audio: null,
      transcript: { revisionId: "demo_rev_sample", text: SAMPLE_TRANSCRIPT, source: "sample", createdAt: now.toISOString() },
      createdAt: daysAgo(now, 1, 9),
      updatedAt: now.toISOString(),
      sample: true,
    },
    job(DEMO_IDS.jobBoiler, "Boiler service", DEMO_IDS.daniel, daysAgo(now, 1, 8)),
    job(DEMO_IDS.jobGarden, "Garden tidy up", DEMO_IDS.maya, daysAgo(now, 2, 8)),
    job(DEMO_IDS.jobCallout, "Call-out", DEMO_IDS.emma, daysAgo(now, 0, 8)),
    job(DEMO_IDS.jobRadiator, "Radiator", DEMO_IDS.alex, daysAgo(now, 3)),
    job(DEMO_IDS.jobBoilerPaid, "Annual boiler service", DEMO_IDS.daniel, daysAgo(now, 1, 16)),
    job(DEMO_IDS.jobGardenPaid, "Garden tidy", DEMO_IDS.maya, daysAgo(now, 2, 15)),
    job(DEMO_IDS.jobSeal, "Bathroom seal", DEMO_IDS.daniel, daysAgo(now, 6)),
    job(DEMO_IDS.jobJamie, "Service call", DEMO_IDS.jamie, daysAgo(now, 4)),
  ];

  const invoices: Invoice[] = [
    sample,
    issued({
      id: DEMO_IDS.invJamie,
      jobId: DEMO_IDS.jobJamie,
      number: "INV-023",
      customerId: DEMO_IDS.jamie,
      name: "Jamie Reed",
      email: "jamie.reed@example.com",
      lines: [line({ id: "demo_line_jamie", description: "Service call", quantity: "1", unit: "each", rateMinor: 8000, catalogItemId: null })],
      delivery: "sent",
      settlement: "unpaid",
      paid: 0,
      at: daysAgo(now, 4),
      dueDate: "2026-11-10",
    }),
    draftInvoice(DEMO_IDS.invBoilerDraft, DEMO_IDS.jobBoiler, "DD-1041", DEMO_IDS.daniel, "Daniel Lee", "daniel.lee@example.com", [line({ id: "demo_line_boiler", description: "Boiler service", quantity: "1", unit: "each", rateMinor: 18000, catalogItemId: "demo_cat_boiler" })], daysAgo(now, 1, 8)),
    draftInvoice(DEMO_IDS.invGardenDraft, DEMO_IDS.jobGarden, "DD-1040", DEMO_IDS.maya, "Maya Patel", "maya.patel@example.com", [line({ id: "demo_line_garden_draft", description: "Garden tidy", quantity: "1", unit: "each", rateMinor: 8000, catalogItemId: "demo_cat_garden" })], daysAgo(now, 2, 8)),
    issued({
      id: DEMO_IDS.invCallout,
      jobId: DEMO_IDS.jobCallout,
      number: "DD-1038",
      customerId: DEMO_IDS.emma,
      name: "Emma Wilson",
      email: "emma.wilson@example.com",
      lines: [line({ id: "demo_line_callout", description: "Call-out", quantity: "1", unit: "each", rateMinor: 10000, catalogItemId: null })],
      delivery: "sent",
      settlement: "unpaid",
      paid: 0,
      at: daysAgo(now, 0, 8),
    }),
    issued({
      id: DEMO_IDS.invRadiator,
      jobId: DEMO_IDS.jobRadiator,
      number: "DD-1037",
      customerId: DEMO_IDS.alex,
      name: "Alex Morgan",
      email: SAMPLE_CUSTOMER.demoEmail,
      lines: [line({ id: "demo_line_radiator", description: "Radiator", quantity: "1", unit: "each", rateMinor: 20000, catalogItemId: null })],
      delivery: "sent",
      settlement: "unpaid",
      paid: 0,
      at: daysAgo(now, 3),
    }),
    issued({
      id: DEMO_IDS.invGardenPaid,
      jobId: DEMO_IDS.jobGardenPaid,
      number: "DD-1036",
      customerId: DEMO_IDS.maya,
      name: "Maya Patel",
      email: "maya.patel@example.com",
      lines: [line({ id: "demo_line_garden", description: "Garden tidy", quantity: "1", unit: "each", rateMinor: 24000, catalogItemId: "demo_cat_garden" })],
      delivery: "sent",
      settlement: "partially_paid",
      paid: 12000,
      at: daysAgo(now, 2, 15),
    }),
    issued({
      id: DEMO_IDS.invBoilerPaid,
      jobId: DEMO_IDS.jobBoilerPaid,
      number: "DD-1035",
      customerId: DEMO_IDS.daniel,
      name: "Daniel Lee",
      email: "daniel.lee@example.com",
      lines: [line({ id: "demo_line_boiler_paid", description: "Boiler service", quantity: "1", unit: "each", rateMinor: 18000, catalogItemId: "demo_cat_boiler" })],
      delivery: "sent",
      settlement: "paid",
      paid: 18000,
      at: daysAgo(now, 1, 16),
    }),
    issued({
      id: DEMO_IDS.invSeal,
      jobId: DEMO_IDS.jobSeal,
      number: "DD-1034",
      customerId: DEMO_IDS.daniel,
      name: "Daniel Lee",
      email: "daniel.lee@example.com",
      lines: [line({ id: "demo_line_seal", description: "Bathroom seal", quantity: "1", unit: "each", rateMinor: 98000, catalogItemId: null })],
      delivery: "sent",
      settlement: "paid",
      paid: 98000,
      at: daysAgo(now, 6),
    }),
  ];

  const payments: PaymentRecord[] = [
    pay("demo_pay_seal", DEMO_IDS.invSeal, 98000, daysAgo(now, 6), "Payment from Daniel"),
    pay("demo_pay_maya", DEMO_IDS.invGardenPaid, 12000, daysAgo(now, 2, 15), "Partial payment from Maya"),
    pay("demo_pay_daniel", DEMO_IDS.invBoilerPaid, 18000, daysAgo(now, 1, 16), "Payment from Daniel"),
    pay("demo_pay_m3", DEMO_IDS.invSeal, 64000, monthsAgo(now, 3), "Earlier payment"),
    pay("demo_pay_m2", DEMO_IDS.invSeal, 86000, monthsAgo(now, 2), "Earlier payment"),
    pay("demo_pay_m1", DEMO_IDS.invSeal, 104000, monthsAgo(now, 1), "Earlier payment"),
  ];

  const timeline: TimelineEvent[] = [
    event("demo_evt_sent_emma", DEMO_IDS.invCallout, "delivery", "Sent to Emma · $100", daysAgo(now, 0, 8), "sent", "unpaid"),
    event("demo_evt_daniel", DEMO_IDS.invBoilerPaid, "payment", "Payment from Daniel · $180", daysAgo(now, 1, 16), "sent", "paid"),
    event("demo_evt_maya", DEMO_IDS.invGardenPaid, "payment", "Partial payment from Maya · $120 of $240", daysAgo(now, 2, 15), "sent", "partially_paid"),
  ];

  return {
    mode: "demo",
    contractorName: "Dave",
    currency: "USD",
    timezone: "Australia/Perth",
    cash: {
      ...emptyLedger(DEMO_REFERENCE_DATE),
      openingMinor: 31000,
      bills: [
        {
          id: "demo_bill_reece",
          payee: "Reece Plumbing",
          amountMinor: 50000,
          dueDate: DEMO_FRIDAY,
          originalDueDate: DEMO_FRIDAY,
          status: "committed",
          includedInOpening: false,
        },
      ],
    },
    customers,
    jobs,
    invoices,
    catalog,
    timeline,
    payments,
  };

  function job(id: string, title: string, customerId: string, at: string): Job {
    return {
      id,
      title,
      customerId,
      photo: null,
      audio: null,
      transcript: null,
      createdAt: at,
      updatedAt: at,
      sample: false,
    };
  }
}

function draftInvoice(
  id: string,
  jobId: string,
  number: string,
  customerId: string,
  name: string,
  email: string,
  lines: InvoiceLine[],
  at: string,
): Invoice {
  return syncTotals({
    id,
    jobId,
    number,
    customerId,
    recipientName: name,
    recipientEmail: email,
    currency: "USD",
    approval: "editing",
    delivery: "not_prepared",
    settlement: "unpaid",
    deliveryMethod: null,
    revision: 1,
    observationVersion: 1,
    lines,
    exclusions: [],
    questions: [],
    totalMinor: 0,
    amountPaidMinor: 0,
    amountDueMinor: null,
    snapshot: null,
    paypalInvoiceId: null,
    paypalRecipientViewUrl: null,
    lastVerifiedAt: null,
    seeded: true,
    simulated: true,
    sample: false,
    createdAt: at,
    updatedAt: at,
  });
}

function issued(input: {
  id: string;
  jobId: string;
  number: string;
  customerId: string;
  name: string;
  email: string;
  lines: InvoiceLine[];
  delivery: "sent";
  settlement: Invoice["settlement"];
  paid: number;
  at: string;
  dueDate?: string;
}): Invoice {
  const total = input.lines.reduce((sum, item) => sum + (item.rateMinor ?? 0) * Number(item.quantity ?? 0), 0);
  return syncTotals({
    id: input.id,
    jobId: input.jobId,
    number: input.number,
    customerId: input.customerId,
    recipientName: input.name,
    recipientEmail: input.email,
    currency: "USD",
    approval: "approved",
    delivery: input.delivery,
    settlement: input.settlement,
    deliveryMethod: "email",
    revision: 1,
    observationVersion: 2,
    lines: input.lines,
    exclusions: [],
    questions: [],
    totalMinor: total,
    amountPaidMinor: input.paid,
    amountDueMinor: Math.max(total - input.paid, 0),
    snapshot: {
      id: `${input.id}_snap`,
      invoiceId: input.id,
      revision: 1,
      currency: "USD",
      recipientName: input.name,
      recipientEmail: input.email,
      totalMinor: total,
      lines: input.lines,
      exclusions: [],
      approvedAt: input.at,
      approvedBy: "seed",
    },
    paypalInvoiceId: null,
    paypalRecipientViewUrl: null,
    lastVerifiedAt: input.at,
    dueDate: input.dueDate ?? null,
    seeded: true,
    simulated: true,
    sample: false,
    createdAt: input.at,
    updatedAt: input.at,
  });
}

function pay(id: string, invoiceId: string, amountMinor: number, at: string, note: string): PaymentRecord {
  return { id, invoiceId, amountMinor, at, simulated: true, note };
}

function event(
  id: string,
  invoiceId: string,
  kind: string,
  message: string,
  at: string,
  delivery: TimelineEvent["delivery"],
  settlement: TimelineEvent["settlement"],
): TimelineEvent {
  return {
    id,
    invoiceId,
    kind,
    message,
    at,
    actor: "seed",
    simulated: true,
    approval: "approved",
    delivery,
    settlement,
  };
}

export type DemoState = {
  version: 1;
  invoiceSeq: number;
  snapshot: WorkspaceSnapshot;
};

export function createDemoState(now = new Date()): DemoState {
  return { version: 1, invoiceSeq: 1043, snapshot: createDemoSnapshot(now) };
}
