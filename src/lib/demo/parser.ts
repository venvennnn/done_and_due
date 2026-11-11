import { isSampleTranscript, SAMPLE_TRANSCRIPT } from "@/lib/domain/sample";
import type { Extraction } from "@/lib/domain/types";

function sentenceContaining(text: string, pattern: RegExp): string | null {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences.find((sentence) => pattern.test(sentence)) ?? null;
}

/**
 * Deterministic demo fixture parser. It does not call a model and it does not invent prices.
 * Prices are attached later by the catalog matcher.
 */
export function parseDemoTranscript(text: string): Extraction {
  const source = text.trim();
  const lines: Extraction["lines"] = [];
  const exclusions: Extraction["exclusions"] = [];
  const questions: string[] = [];

  const supplied = /customer supplied (?:the |their )?([^.]+)/i.exec(source);
  if (supplied) {
    const description = supplied[1].replace(/\.$/, "").trim();
    const label = description.charAt(0).toUpperCase() + description.slice(1);
    exclusions.push({
      description: label,
      reason: "Customer supplied",
      transcriptQuoteOrNull: sentenceContaining(source, /customer supplied/i),
    });
  }

  if (/standard mixer tap|mixer tap|kitchen tap/i.test(source)) {
    const quote = sentenceContaining(source, /tap/i);
    lines.push({
      description: "Standard mixer tap",
      catalogQuery: /standard mixer tap/i.test(source) ? "standard mixer tap" : /mixer tap/i.test(source) ? "mixer tap" : "kitchen tap",
      quantityDecimalOrNull: "1",
      unitOrNull: "each",
      ownership: "contractor",
      transcriptQuoteOrNull: quote,
      photoRegionOrNull: null,
      reviewReasonOrNull: null,
    });
  } else if (/\btap\b/i.test(source)) {
    lines.push({
      description: "Tap",
      catalogQuery: "tap",
      quantityDecimalOrNull: "1",
      unitOrNull: "each",
      ownership: "contractor",
      transcriptQuoteOrNull: sentenceContaining(source, /\btap\b/i),
      photoRegionOrNull: null,
      reviewReasonOrNull: "The note says tap without naming which catalog item.",
    });
  }

  if (/consumable/i.test(source)) {
    lines.push({
      description: "Consumables",
      catalogQuery: "consumables",
      quantityDecimalOrNull: "1",
      unitOrNull: "each",
      ownership: "contractor",
      transcriptQuoteOrNull: sentenceContaining(source, /consumable/i),
      photoRegionOrNull: null,
      reviewReasonOrNull: null,
    });
  }

  const hours = /(\d+(?:\.\d+)?)\s+hours?\s+of\s+(?:plumbing\s+)?labor/i.exec(source);
  const oneHour = /one hour of labor/i.test(source);
  const statedLabor = /labor was \$/i.test(source);
  const laborMention = /\blabor\b/i.test(source);
  if (hours || oneHour || laborMention) {
    const quantity = hours ? hours[1] : oneHour || statedLabor ? "1" : null;
    lines.push({
      description: "Plumbing labor",
      catalogQuery: "plumbing labor",
      quantityDecimalOrNull: quantity,
      unitOrNull: "hr",
      ownership: "contractor",
      transcriptQuoteOrNull: sentenceContaining(source, /labor/i),
      photoRegionOrNull: null,
      reviewReasonOrNull: quantity ? null : "The note mentions labor without a duration.",
    });
    if (!quantity) questions.push("How many hours of plumbing labor should be billed?");
  }

  if (lines.length === 0 && exclusions.length === 0) {
    questions.push("Add invoice lines manually. The note did not match a sample billing pattern.");
  }

  if (isSampleTranscript(source) && lines.length > 0) {
    return { lines, exclusions, questions };
  }

  if (source === SAMPLE_TRANSCRIPT) return { lines, exclusions, questions };
  return { lines, exclusions, questions };
}
