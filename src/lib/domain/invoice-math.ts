import { chosenCandidate, matchCatalog } from "./catalog";
import { isCurrentRegion } from "./evidence";
import { isValidQuantity, lineAmountMinor, sumMinor } from "./money";
import type { CatalogItem, Invoice, InvoiceLine, Job, WorkspaceSnapshot } from "./types";

export type ReviewFlag = {
  code: string;
  lineId: string | null;
  message: string;
  action: string;
  blocksApproval: boolean;
  impactMinor: number | null;
  sortOrder: number;
};

export function includedLines(lines: InvoiceLine[]): InvoiceLine[] {
  return lines.filter((line) => !line.excluded).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function lineTotal(line: InvoiceLine): number | null {
  if (line.excluded) return 0;
  if (!isValidQuantity(line.quantity) || line.rateMinor === null) return null;
  return lineAmountMinor(line.quantity, line.rateMinor);
}

export function invoiceTotalMinor(lines: InvoiceLine[]): number {
  return sumMinor(
    includedLines(lines).map((line) => {
      const total = lineTotal(line);
      return total ?? 0;
    }),
  );
}

export function syncTotals(invoice: Invoice): Invoice {
  const totalMinor = invoiceTotalMinor(invoice.lines);
  const amountPaidMinor = Math.min(invoice.amountPaidMinor, totalMinor);
  let amountDueMinor = invoice.amountDueMinor;
  if (invoice.settlement === "paid") amountDueMinor = 0;
  else if (invoice.settlement === "partially_paid" || invoice.settlement === "pending" || invoice.settlement === "unpaid") {
    amountDueMinor = Math.max(totalMinor - amountPaidMinor, 0);
  }
  return { ...invoice, totalMinor, amountPaidMinor, amountDueMinor };
}

function impactOf(line: InvoiceLine): number | null {
  return lineTotal(line);
}

export function reviewFlags(input: {
  invoice: Pick<Invoice, "lines" | "exclusions" | "recipientEmail" | "revision">;
  expectedRevision?: number;
  catalog: CatalogItem[];
  transcriptText?: string | null;
}): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  const lines = input.invoice.lines;
  if (!input.invoice.recipientEmail.trim() || !input.invoice.recipientEmail.includes("@")) {
    flags.push({
      code: "MISSING_EMAIL",
      lineId: null,
      message: "This bill needs the customer's email before it can be approved.",
      action: "Enter the recipient email.",
      blocksApproval: true,
      impactMinor: null,
      sortOrder: -1,
    });
  }
  if (input.expectedRevision !== undefined && input.expectedRevision !== input.invoice.revision) {
    flags.push({
      code: "STALE_REVISION",
      lineId: null,
      message: "This draft changed in another tab.",
      action: "Reload the invoice and review it again.",
      blocksApproval: true,
      impactMinor: null,
      sortOrder: -1,
    });
  }

  const included = includedLines(lines);
  const seen = new Map<string, string[]>();
  for (const line of included) {
    if (line.catalogItemId) {
      const list = seen.get(line.catalogItemId) ?? [];
      list.push(line.id);
      seen.set(line.catalogItemId, list);
    }
  }

  for (const line of lines) {
    if (line.ownership === "customer" && !line.excluded) {
      flags.push({
        code: "CUSTOMER_SUPPLIED_CHARGED",
        lineId: line.id,
        message: `${line.description} is customer-supplied and is still on the bill.`,
        action: "Move it to Not billed or confirm you supplied it.",
        blocksApproval: true,
        impactMinor: impactOf(line),
        sortOrder: line.sortOrder,
      });
    }
    if (line.excluded) continue;
    if (line.match.status === "abstain" || line.match.status === "unresolved") {
      flags.push({
        code: "AMBIGUOUS_SKU",
        lineId: line.id,
        message:
          line.match.candidates.length > 0
            ? `“${line.catalogQuery || line.description}” matches more than one price-list item.`
            : `${line.description} is not on the price list yet.`,
        action: "Choose an item, exclude the line, or enter a custom rate.",
        blocksApproval: true,
        impactMinor: null,
        sortOrder: line.sortOrder,
      });
    }
    if (line.match.reason === "unit_conflict") {
      flags.push({
        code: "UNIT_CONFLICT",
        lineId: line.id,
        message: `${line.description} uses a unit the price list does not bill.`,
        action: "Pick a compatible unit or enter a custom line.",
        blocksApproval: true,
        impactMinor: null,
        sortOrder: line.sortOrder,
      });
    }
    if (line.ownership === "unknown") {
      flags.push({
        code: "UNKNOWN_OWNERSHIP",
        lineId: line.id,
        message: `Confirm who supplied ${line.description}.`,
        action: "Mark it as yours or as customer-supplied.",
        blocksApproval: true,
        impactMinor: impactOf(line),
        sortOrder: line.sortOrder,
      });
    }
    if (!isValidQuantity(line.quantity)) {
      const duration = line.unit === "hr";
      flags.push({
        code: duration ? "MISSING_DURATION" : "MISSING_QUANTITY",
        lineId: line.id,
        message: duration ? `${line.description} needs a duration before it can be billed.` : `${line.description} needs a quantity.`,
        action: duration ? "Enter how many hours to bill." : "Enter a quantity greater than zero.",
        blocksApproval: true,
        impactMinor: null,
        sortOrder: line.sortOrder,
      });
    }
    if (line.rateMinor === null) {
      flags.push({
        code: "MISSING_RATE",
        lineId: line.id,
        message: `${line.description} has no price.`,
        action: "Choose a catalog rate or type one.",
        blocksApproval: true,
        impactMinor: null,
        sortOrder: line.sortOrder,
      });
    }
    if (line.transcriptSpan?.ambiguous) {
      flags.push({
        code: "AMBIGUOUS_QUOTE",
        lineId: line.id,
        message: `“${line.transcriptSpan.quote}” appears more than once in the note.`,
        action: "Choose the occurrence this charge refers to.",
        blocksApproval: true,
        impactMinor: impactOf(line),
        sortOrder: line.sortOrder,
      });
    }
    const dupes = line.catalogItemId ? seen.get(line.catalogItemId) : undefined;
    if (dupes && dupes.length > 1 && !line.duplicateConfirmed) {
      flags.push({
        code: "DUPLICATE_CANDIDATE",
        lineId: line.id,
        message: `${line.description} is on the invoice more than once.`,
        action: "Confirm the repeat or remove the extra line.",
        blocksApproval: true,
        impactMinor: impactOf(line),
        sortOrder: line.sortOrder,
      });
    }
  }

  if (input.transcriptText) {
    const covered = new Set(
      lines.flatMap((line) => [line.description, line.catalogQuery, line.catalogItemId ?? ""]).map((value) => value.toLowerCase()),
    );
    for (const item of input.catalog.filter((entry) => entry.active)) {
      const names = [item.name, ...item.aliases].map((name) => name.toLowerCase());
      const mentioned = names.some((name) => name.length > 3 && input.transcriptText!.toLowerCase().includes(name));
      const already = names.some((name) => covered.has(name)) || lines.some((line) => line.catalogItemId === item.id);
      const excluded = input.invoice.exclusions.some((exclusion) => exclusion.description.toLowerCase().includes(item.name.toLowerCase()));
      if (mentioned && !already && !excluded) {
        flags.push({
          code: "OMITTED_WORK",
          lineId: null,
          message: `The note mentions “${item.name}”, and there is no matching line or exclusion.`,
          action: "Add the line, exclude it, or leave it off on purpose.",
          blocksApproval: false,
          impactMinor: null,
          sortOrder: 1000,
        });
      }
    }
  }

  const total = invoiceTotalMinor(lines);
  const hasUnresolved = flags.some((flag) => flag.blocksApproval);
  if (!hasUnresolved && total <= 0) {
    flags.push({
      code: "ZERO_TOTAL",
      lineId: null,
      message: "The invoice total has to be more than zero.",
      action: "Add a billable line with a price and quantity.",
      blocksApproval: true,
      impactMinor: 0,
      sortOrder: 10_000,
    });
  }

  return flags.sort((a, b) => {
    if (a.blocksApproval !== b.blocksApproval) return a.blocksApproval ? -1 : 1;
    const aImpact = a.impactMinor === null ? -1 : a.impactMinor;
    const bImpact = b.impactMinor === null ? -1 : b.impactMinor;
    if (aImpact !== bImpact) return bImpact - aImpact;
    return a.sortOrder - b.sortOrder || a.code.localeCompare(b.code);
  });
}

export function approvalBlockers(flags: ReviewFlag[]): ReviewFlag[] {
  return flags.filter((flag) => flag.blocksApproval);
}

export function mentionedWorkOmissions(transcript: string, catalog: CatalogItem[]): string[] {
  return catalog
    .filter((item) => item.active)
    .filter((item) => [item.name, ...item.aliases].some((alias) => alias.length > 3 && transcript.toLowerCase().includes(alias.toLowerCase())))
    .map((item) => item.name);
}

export function lineNumber(lines: InvoiceLine[], lineId: string): number {
  const index = includedLines(lines).findIndex((line) => line.id === lineId);
  return index + 1;
}

export function jobForInvoice(snapshot: WorkspaceSnapshot, invoice: Invoice): Job | undefined {
  return snapshot.jobs.find((job) => job.id === invoice.jobId);
}

export function customerName(snapshot: WorkspaceSnapshot, customerId: string | null): string {
  return snapshot.customers.find((customer) => customer.id === customerId)?.name ?? "Customer";
}

export function rematchLine(line: InvoiceLine, catalog: CatalogItem[]): InvoiceLine {
  if (line.contractorConfirmed && line.provenance.rate === "contractor") {
    return { ...line, match: { ...line.match, status: "custom", reason: "contractor_rate" } };
  }
  const decision = matchCatalog(line.catalogQuery || line.description, line.unit, catalog);
  const chosen = chosenCandidate(decision);
  if (!chosen || line.provenance.rate === "contractor") {
    if (line.provenance.rate === "contractor") return { ...line, match: decision };
    return {
      ...line,
      match: decision,
      catalogItemId: null,
      rateMinor: null,
      provenance: { ...line.provenance, rate: "missing" },
    };
  }
  return {
    ...line,
    description: chosen.name,
    catalogItemId: chosen.catalogItemId,
    unit: chosen.unit,
    rateMinor: chosen.rateMinor,
    match: decision,
    provenance: { ...line.provenance, rate: "catalog", identity: "catalog" },
  };
}

export function regionsForPhoto(lines: InvoiceLine[], photo: Job["photo"]): InvoiceLine[] {
  if (!photo) return [];
  return includedLines(lines).filter((line) => isCurrentRegion(line.photoRegion, photo));
}
