import { canonicalUnit } from "./catalog";
import { isCurrentRegion, selectOccurrence } from "./evidence";
import { boxAroundPoint, validBox } from "./geometry";
import { createId, ServiceError } from "./ids";
import { invoiceTotalMinor, rematchLine, syncTotals } from "./invoice-math";
import { isValidQuantity } from "./money";
import { canTransitionApproval, canTransitionDelivery, canTransitionSettlement } from "./transitions";
import type {
  CatalogItem,
  Invoice,
  InvoiceLine,
  Job,
  PhotoRegion,
  TimelineEvent,
  WorkspaceMode,
} from "./types";

export type LinePatch = {
  description?: string;
  quantity?: string | null;
  unit?: string | null;
  rateMinor?: number | null;
  excluded?: boolean;
  ownership?: InvoiceLine["ownership"];
  catalogItemId?: string | null;
  duplicateConfirmed?: boolean;
  contractorConfirmed?: boolean;
  quoteOccurrence?: number;
};

function correction(line: InvoiceLine, field: string, fromValue: string, toValue: string, at: string): InvoiceLine {
  if (fromValue === toValue) return line;
  return {
    ...line,
    corrections: [...line.corrections, { field, fromValue, toValue, at }],
  };
}

export function patchLine(line: InvoiceLine, patch: LinePatch, catalog: CatalogItem[], at: string, transcript?: string): InvoiceLine {
  let next = { ...line, corrections: [...line.corrections] };
  if (patch.description !== undefined && patch.description.trim() && patch.description !== line.description) {
    next = correction(next, "description", line.description, patch.description.trim(), at);
    next.description = patch.description.trim();
    next.catalogQuery = patch.description.trim();
    next.contractorConfirmed = true;
    next.provenance = { ...next.provenance, identity: "contractor" };
    next = rematchLine(next, catalog);
  }
  if (patch.quantity !== undefined) {
    if (patch.quantity !== null && !isValidQuantity(patch.quantity)) {
      throw new ServiceError("bad_quantity", 400, "Enter a quantity greater than zero with at most 3 decimal places.");
    }
    next = correction(next, "quantity", line.quantity ?? "", patch.quantity ?? "", at);
    next.quantity = patch.quantity;
    next.provenance = {
      ...next.provenance,
      quantity: "contractor",
      duration: next.unit === "hr" ? "contractor" : next.provenance.duration,
    };
  }
  if (patch.unit !== undefined) {
    next = correction(next, "unit", line.unit ?? "", patch.unit ?? "", at);
    next.unit = patch.unit ? canonicalUnit(patch.unit) : null;
    next = rematchLine(next, catalog);
  }
  if (patch.rateMinor !== undefined) {
    if (patch.rateMinor !== null && (!Number.isInteger(patch.rateMinor) || patch.rateMinor < 0)) {
      throw new ServiceError("bad_rate", 400, "Rates have to be zero or more, in cents.");
    }
    next = correction(next, "rateMinor", String(line.rateMinor ?? ""), String(patch.rateMinor ?? ""), at);
    next.rateMinor = patch.rateMinor;
    next.catalogItemId = patch.catalogItemId === undefined ? null : patch.catalogItemId;
    next.provenance = { ...next.provenance, rate: "contractor" };
    next.contractorConfirmed = true;
    next.match = { ...next.match, status: "custom", reason: "contractor_rate" };
  }
  if (patch.catalogItemId) {
    const item = catalog.find((entry) => entry.id === patch.catalogItemId && entry.active);
    if (!item) throw new ServiceError("unknown_sku", 400, "That price-list item is not active.");
    next = correction(next, "catalogItemId", line.catalogItemId ?? "", item.id, at);
    next.catalogItemId = item.id;
    next.description = item.name;
    next.unit = item.unit;
    next.rateMinor = item.rateMinor;
    next.provenance = { ...next.provenance, rate: "catalog", identity: "contractor" };
    next.match = {
      status: "exact",
      reason: "contractor_selected",
      score: 1,
      margin: 1,
      candidates: next.match.candidates,
    };
    next.contractorConfirmed = true;
  }
  if (patch.ownership) {
    next = correction(next, "ownership", line.ownership, patch.ownership, at);
    next.ownership = patch.ownership;
    next.provenance = { ...next.provenance, ownership: "contractor" };
    if (patch.ownership === "customer") {
      next.excluded = true;
      next.exclusionReason = "Customer supplied";
    }
    if (patch.ownership === "contractor") {
      next.excluded = patch.excluded ?? false;
    }
  }
  if (patch.excluded !== undefined) {
    next.excluded = patch.excluded;
    next.exclusionReason = patch.excluded ? next.exclusionReason ?? "Excluded by contractor" : null;
    next.contractorConfirmed = true;
  }
  if (patch.duplicateConfirmed !== undefined) next.duplicateConfirmed = patch.duplicateConfirmed;
  if (patch.contractorConfirmed !== undefined) next.contractorConfirmed = patch.contractorConfirmed;
  if (patch.quoteOccurrence !== undefined && next.transcriptSpan && transcript) {
    const selected = selectOccurrence(next.transcriptSpan, transcript, patch.quoteOccurrence);
    if (!selected) throw new ServiceError("bad_quote", 400, "That occurrence is not in the note.");
    next.transcriptSpan = selected;
    next.transcriptQuote = selected.quote;
  }
  return next;
}

export function addCustomLine(invoice: Invoice, at: string): Invoice {
  if (invoice.approval !== "editing") {
    throw new ServiceError("locked", 409, "Approved bills are read-only until you revise them.");
  }
  const line: InvoiceLine = {
    id: createId("line"),
    sortOrder: invoice.lines.length,
    description: "Custom item",
    catalogQuery: "",
    catalogItemId: null,
    quantity: "1",
    unit: "each",
    rateMinor: null,
    ownership: "contractor",
    excluded: false,
    exclusionReason: null,
    transcriptQuote: null,
    transcriptSpan: null,
    photoRegion: null,
    match: { status: "custom", reason: "contractor_entered", score: null, margin: null, candidates: [] },
    provenance: {
      identity: "contractor",
      quantity: "contractor",
      duration: "missing",
      ownership: "contractor",
      rate: "missing",
    },
    reviewReason: null,
    contractorConfirmed: true,
    duplicateConfirmed: false,
    proposed: null,
    corrections: [{ field: "created", fromValue: "", toValue: "custom", at }],
  };
  return touch({ ...invoice, lines: [...invoice.lines, line] }, at);
}

export function removeLine(invoice: Invoice, lineId: string, at: string): Invoice {
  assertEditing(invoice);
  return touch({ ...invoice, lines: invoice.lines.filter((line) => line.id !== lineId) }, at);
}

export function placeMarker(invoice: Invoice, lineId: string, photo: Job["photo"], box: PhotoRegion["box2d"], at: string): Invoice {
  assertEditing(invoice);
  if (!photo) throw new ServiceError("no_photo", 400, "Add a job photo before placing a marker.");
  if (!validBox(box)) throw new ServiceError("bad_box", 400, "The marker has to stay inside the photo.");
  return touch(
    {
      ...invoice,
      lines: invoice.lines.map((line) =>
        line.id === lineId
          ? {
              ...line,
              photoRegion: {
                label: line.description,
                box2d: box,
                source: "contractor",
                photoId: photo.id,
                photoVersion: photo.version,
              },
              provenance: { ...line.provenance, identity: "contractor" },
              contractorConfirmed: true,
            }
          : line,
      ),
    },
    at,
  );
}

export function clearMarkersForPhoto(invoice: Invoice, photoId: string): Invoice {
  return {
    ...invoice,
    lines: invoice.lines.map((line) =>
      line.photoRegion?.photoId === photoId ? { ...line, photoRegion: null } : line,
    ),
  };
}

export function markerFromClick(xNorm: number, yNorm: number): PhotoRegion["box2d"] {
  return boxAroundPoint(xNorm, yNorm);
}

function assertEditing(invoice: Invoice) {
  if (invoice.approval !== "editing") {
    throw new ServiceError("locked", 409, "This bill is approved. Revise it before editing lines.");
  }
}

export function touch(invoice: Invoice, at: string): Invoice {
  return syncTotals({ ...invoice, revision: invoice.revision + 1, updatedAt: at });
}

export function applyRecipient(invoice: Invoice, recipient: { name?: string; email?: string }, at: string): Invoice {
  assertEditing(invoice);
  return touch(
    {
      ...invoice,
      recipientName: recipient.name?.trim() || invoice.recipientName,
      recipientEmail: recipient.email !== undefined ? recipient.email.trim() : invoice.recipientEmail,
    },
    at,
  );
}

export function buildTimeline(input: {
  invoice: Invoice;
  message: string;
  kind: string;
  at: string;
  actor: string;
  simulated: boolean;
}): TimelineEvent {
  return {
    id: createId("evt"),
    invoiceId: input.invoice.id,
    kind: input.kind,
    message: input.message,
    at: input.at,
    actor: input.actor,
    simulated: input.simulated,
    approval: input.invoice.approval,
    delivery: input.invoice.delivery,
    settlement: input.invoice.settlement,
  };
}

export function changeDelivery(invoice: Invoice, to: Invoice["delivery"], mode: WorkspaceMode, at: string): Invoice {
  if (!canTransitionDelivery(invoice.delivery, to, mode)) {
    throw new ServiceError("delivery_transition", 409, `Cannot change delivery from ${invoice.delivery} to ${to}.`);
  }
  return { ...invoice, delivery: to, updatedAt: at };
}

export function changeSettlement(invoice: Invoice, to: Invoice["settlement"], at: string): Invoice {
  if (!canTransitionSettlement(invoice.settlement, to)) {
    throw new ServiceError("settlement_transition", 409, `Cannot change settlement from ${invoice.settlement} to ${to}.`);
  }
  return { ...invoice, settlement: to, updatedAt: at };
}

export function changeApproval(invoice: Invoice, to: Invoice["approval"]): void {
  if (!canTransitionApproval(invoice.approval, to)) {
    throw new ServiceError("approval_transition", 409, `Cannot change approval from ${invoice.approval} to ${to}.`);
  }
}

export function readableRegionCount(lines: InvoiceLine[], photo: Job["photo"]): number {
  return lines.filter((line) => isCurrentRegion(line.photoRegion, photo)).length;
}

export function recompute(invoice: Invoice): Invoice {
  return syncTotals({ ...invoice, totalMinor: invoiceTotalMinor(invoice.lines) });
}
