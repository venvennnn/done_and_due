import { applyExtraction } from "@/lib/domain/extraction";
import { syncTotals } from "@/lib/domain/invoice-math";
import { isSampleTranscript, SAMPLE_OBJECTS, SAMPLE_PHOTO } from "@/lib/domain/sample";
import type { CatalogItem, Invoice, InvoiceLine, JobPhoto, MatchDecision, Transcript } from "@/lib/domain/types";
import { parseDemoTranscript } from "./parser";

const observedMatch: MatchDecision = { status: "custom", reason: "left_in_place", score: null, margin: null, candidates: [] };

export function attachSampleMarker(lines: InvoiceLine[], photo: JobPhoto | null): InvoiceLine[] {
  const marked = lines.map((line) => {
    const isTap = /mixer tap|kitchen tap|^tap$/i.test(line.description) || /tap/i.test(line.catalogQuery);
    if (!photo || photo.id !== SAMPLE_PHOTO.id || !isTap || line.unit === "hr") {
      return { ...line, photoRegion: line.photoRegion?.photoId === photo?.id ? line.photoRegion : null };
    }
    const tap = SAMPLE_OBJECTS.find((object) => object.billed);
    return {
      ...line,
      photoRegion: {
        label: tap?.label ?? SAMPLE_PHOTO.label,
        box2d: tap?.box2d ?? SAMPLE_PHOTO.box2d,
        source: "sample" as const,
        photoId: photo.id,
        photoVersion: photo.version,
      },
      provenance: { ...line.provenance, identity: "photo" as const },
    };
  });
  if (!photo || photo.id !== SAMPLE_PHOTO.id) return marked;
  const extras = SAMPLE_OBJECTS.filter((object) => !object.billed && !marked.some((line) => line.photoRegion?.label === object.label)).map((object, index) => observedLine(object, photo, marked.length + index));
  return [...marked, ...extras];
}

function observedLine(object: (typeof SAMPLE_OBJECTS)[number], photo: JobPhoto, sortOrder: number): InvoiceLine {
  return {
    id: `observed_${object.label.toLowerCase().replace(/\s+/g, "_")}`,
    sortOrder,
    description: object.label,
    catalogQuery: object.label,
    catalogItemId: null,
    quantity: "1",
    unit: "each",
    rateMinor: 0,
    ownership: "customer",
    excluded: true,
    exclusionReason: "Left in place",
    transcriptQuote: null,
    transcriptSpan: null,
    photoRegion: {
      label: object.label,
      box2d: object.box2d,
      source: "sample",
      photoId: photo.id,
      photoVersion: photo.version,
    },
    match: observedMatch,
    provenance: { identity: "photo", quantity: "contractor", duration: "missing", ownership: "contractor", rate: "contractor" },
    reviewReason: null,
    contractorConfirmed: true,
    duplicateConfirmed: false,
    proposed: null,
    corrections: [],
  };
}

export function draftFromTranscript(input: {
  text: string;
  catalog: CatalogItem[];
  transcript: Transcript;
  photo: JobPhoto | null;
  idPrefix?: string;
}): { lines: InvoiceLine[]; exclusions: Invoice["exclusions"]; questions: string[] } {
  const extraction = parseDemoTranscript(input.text);
  const applied = applyExtraction({
    extraction,
    catalog: input.catalog,
    transcript: input.transcript,
    photo: input.photo,
    regionSource: "sample",
    idPrefix: input.idPrefix,
  });
  const marked =
    input.photo?.id === SAMPLE_PHOTO.id ? attachSampleMarker(applied.lines, input.photo) : applied.lines.map((line) => ({ ...line, photoRegion: null }));
  return { ...applied, lines: groundSamplePrices(marked, input.text) };
}

function groundSamplePrices(lines: InvoiceLine[], text: string): InvoiceLine[] {
  if (!isSampleTranscript(text)) return lines;
  return lines.map((line) => {
    if (/mixer tap|kitchen tap/i.test(line.description)) return priced(line, 11000, "Replaced the kitchen tap with a standard mixer tap for $110.");
    if (line.unit === "hr") return priced(line, 12000, "Labor was $120.");
    if (/consumable/i.test(line.description)) return priced(line, 1000, "Used $10 of consumables.");
    return line;
  });
}

function priced(line: InvoiceLine, rateMinor: number, quote: string): InvoiceLine {
  return {
    ...line,
    rateMinor,
    transcriptQuote: quote,
    provenance: { ...line.provenance, rate: "transcript" },
  };
}

export function withTotals<T extends Invoice>(invoice: T): T {
  return syncTotals(invoice) as T;
}
