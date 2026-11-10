import { applyExtraction } from "@/lib/domain/extraction";
import { syncTotals } from "@/lib/domain/invoice-math";
import { SAMPLE_PHOTO } from "@/lib/domain/sample";
import type { CatalogItem, Invoice, InvoiceLine, JobPhoto, Transcript } from "@/lib/domain/types";
import { parseDemoTranscript } from "./parser";

export function attachSampleMarker(lines: InvoiceLine[], photo: JobPhoto | null): InvoiceLine[] {
  return lines.map((line) => {
    const isTap = /mixer tap|kitchen tap|^tap$/i.test(line.description) || /tap/i.test(line.catalogQuery);
    if (!photo || photo.id !== SAMPLE_PHOTO.id || !isTap || line.unit === "hr") {
      return { ...line, photoRegion: line.photoRegion?.photoId === photo?.id ? line.photoRegion : null };
    }
    return {
      ...line,
      photoRegion: {
        label: SAMPLE_PHOTO.label,
        box2d: SAMPLE_PHOTO.box2d,
        source: "sample",
        photoId: photo.id,
        photoVersion: photo.version,
      },
      provenance: { ...line.provenance, identity: "photo" },
    };
  });
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
  const lines =
    input.photo?.id === SAMPLE_PHOTO.id ? attachSampleMarker(applied.lines, input.photo) : applied.lines.map((line) => ({ ...line, photoRegion: null }));
  return { ...applied, lines };
}

export function withTotals<T extends Invoice>(invoice: T): T {
  return syncTotals(invoice) as T;
}
