import { z } from "zod";
import { chosenCandidate, matchCatalog } from "./catalog";
import { acceptPhotoRegion, resolveTranscriptSpan } from "./evidence";
import { createId } from "./ids";
import { isValidQuantity } from "./money";
import type { CatalogItem, Exclusion, Extraction, InvoiceLine, JobPhoto, Ownership, Transcript } from "./types";

const boxSchema = z.tuple([z.number().int(), z.number().int(), z.number().int(), z.number().int()]);

const decimalQuantity = z
  .string()
  .regex(/^\d{1,5}(\.\d{1,3})?$/)
  .nullable();

export const extractionSchema = z.object({
  lines: z
    .array(
      z.object({
        description: z.string().min(1).max(240),
        catalogQuery: z.string().max(240),
        quantityDecimalOrNull: z.union([decimalQuantity, z.number(), z.null()]).transform((value, ctx) => {
          if (value === null) return null;
          if (typeof value === "number") {
            if (!Number.isFinite(value) || value <= 0) return null;
            const asString = String(value);
            if (!/^\d{1,5}(\.\d{1,3})?$/.test(asString)) {
              ctx.addIssue({ code: "custom", message: "Quantity precision is not supported." });
              return z.NEVER;
            }
            return asString;
          }
          return value;
        }),
        unitOrNull: z.string().max(32).nullable(),
        ownership: z.enum(["contractor", "customer", "unknown"]),
        transcriptQuoteOrNull: z.string().max(500).nullable(),
        photoRegionOrNull: z
          .object({
            label: z.string().max(80),
            box_2d: boxSchema,
          })
          .nullable(),
        reviewReasonOrNull: z.string().max(400).nullable(),
      }),
    )
    .max(40),
  exclusions: z
    .array(
      z.object({
        description: z.string().min(1).max(240),
        reason: z.string().min(1).max(240),
        transcriptQuoteOrNull: z.string().max(500).nullable(),
      }),
    )
    .max(20),
  questions: z.array(z.string().max(400)).max(20),
});

export type InputRevision = {
  photoVersion: number | null;
  transcriptRevisionId: string | null;
};

export function parseExtraction(payload: unknown): Extraction {
  const parsed = extractionSchema.parse(payload);
  return {
    lines: parsed.lines.map((line) => ({
      ...line,
      quantityDecimalOrNull: line.quantityDecimalOrNull,
      photoRegionOrNull: line.photoRegionOrNull
        ? { label: line.photoRegionOrNull.label, box_2d: line.photoRegionOrNull.box_2d }
        : null,
    })),
    exclusions: parsed.exclusions,
    questions: parsed.questions,
  };
}

const emptyProvenance = {
  identity: "gemini" as const,
  quantity: "missing" as const,
  duration: "missing" as const,
  ownership: "missing" as const,
  rate: "missing" as const,
};

export function applyExtraction(input: {
  extraction: Extraction;
  catalog: CatalogItem[];
  transcript: Transcript | null;
  photo: JobPhoto | null;
  regionSource?: "gemini" | "sample" | "contractor";
  idPrefix?: string;
}): { lines: InvoiceLine[]; exclusions: Exclusion[]; questions: string[] } {
  const regionSource = input.regionSource ?? "gemini";
  const lines = input.extraction.lines.map((line, index) => {
    const quantity = line.quantityDecimalOrNull && isValidQuantity(line.quantityDecimalOrNull) ? line.quantityDecimalOrNull : null;
    const decision = matchCatalog(line.catalogQuery || line.description, line.unitOrNull, input.catalog);
    const chosen = chosenCandidate(decision);
    const ownership: Ownership = line.ownership;
    const excluded = ownership === "customer";
    const span = input.transcript ? resolveTranscriptSpan(input.transcript.text, input.transcript.revisionId, line.transcriptQuoteOrNull) : null;
    const supportedQuote = span !== null && !span.ambiguous;
    const photoRegion = acceptPhotoRegion(line.photoRegionOrNull, input.photo, regionSource);
    const rateMinor = chosen ? chosen.rateMinor : null;
    const catalogItemId = chosen ? chosen.catalogItemId : null;
    const unit = chosen ? chosen.unit : line.unitOrNull;
    const proposed = {
      description: line.description,
      quantity,
      unit: line.unitOrNull,
      rateMinor,
      catalogItemId,
      ownership,
    };
    return {
      id: input.idPrefix ? `${input.idPrefix}_line_${index + 1}` : createId("line"),
      sortOrder: index,
      description: chosen?.name ?? line.description,
      catalogQuery: line.catalogQuery || line.description,
      catalogItemId,
      quantity,
      unit,
      rateMinor,
      ownership,
      excluded,
      exclusionReason: excluded ? "Customer supplied" : null,
      transcriptQuote: supportedQuote ? span?.quote ?? null : line.transcriptQuoteOrNull,
      transcriptSpan: span,
      photoRegion,
      match: decision,
      provenance: {
        ...emptyProvenance,
        identity: photoRegion ? "photo" : supportedQuote ? "transcript" : "gemini",
        quantity: quantity ? (line.unitOrNull === "hr" ? "transcript" : "transcript") : "missing",
        duration: unit === "hr" ? (quantity ? "transcript" : "missing") : "missing",
        ownership: ownership === "unknown" ? "missing" : "transcript",
        rate: rateMinor !== null ? "catalog" : "missing",
      },
      reviewReason: line.reviewReasonOrNull,
      contractorConfirmed: false,
      duplicateConfirmed: false,
      proposed,
      corrections: [],
    } satisfies InvoiceLine;
  });

  const exclusions = input.extraction.exclusions.map((exclusion, index) => ({
    id: input.idPrefix ? `${input.idPrefix}_ex_${index + 1}` : createId("ex"),
    description: exclusion.description,
    reason: exclusion.reason,
    transcriptQuote: exclusion.transcriptQuoteOrNull,
    transcriptSpan: input.transcript
      ? resolveTranscriptSpan(input.transcript.text, input.transcript.revisionId, exclusion.transcriptQuoteOrNull)
      : null,
  }));

  return { lines, exclusions, questions: input.extraction.questions };
}

export function extractionIsStale(run: InputRevision, current: InputRevision): boolean {
  return run.photoVersion !== current.photoVersion || run.transcriptRevisionId !== current.transcriptRevisionId;
}
