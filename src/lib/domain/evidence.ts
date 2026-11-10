import { validBox } from "./geometry";
import type { JobPhoto, PhotoRegion, TranscriptSpan } from "./types";

export function findQuoteSpans(transcript: string, quote: string): Array<{ start: number; end: number }> {
  const needle = quote.trim();
  if (!needle) return [];
  const spans: Array<{ start: number; end: number }> = [];
  let from = 0;
  const haystack = transcript;
  const lowerHaystack = haystack.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  while (from <= haystack.length) {
    const index = lowerHaystack.indexOf(lowerNeedle, from);
    if (index === -1) break;
    spans.push({ start: index, end: index + needle.length });
    from = index + Math.max(needle.length, 1);
  }
  return spans;
}

export function resolveTranscriptSpan(
  transcript: string,
  revisionId: string,
  quote: string | null,
): TranscriptSpan | null {
  if (!quote || !quote.trim()) return null;
  const spans = findQuoteSpans(transcript, quote);
  if (spans.length === 0) return null;
  const occurrence = 0;
  return {
    revisionId,
    quote: transcript.slice(spans[0].start, spans[0].end),
    start: spans[0].start,
    end: spans[0].end,
    occurrence,
    ambiguous: spans.length > 1,
  };
}

export function selectOccurrence(span: TranscriptSpan, transcript: string, occurrence: number): TranscriptSpan | null {
  const spans = findQuoteSpans(transcript, span.quote);
  const chosen = spans[occurrence];
  if (!chosen) return null;
  return {
    ...span,
    start: chosen.start,
    end: chosen.end,
    occurrence,
    ambiguous: false,
  };
}

export function acceptPhotoRegion(
  region: { label: string; box_2d: [number, number, number, number] } | null,
  photo: JobPhoto | null,
  source: PhotoRegion["source"],
): PhotoRegion | null {
  if (!region || !photo) return null;
  if (!validBox(region.box_2d)) return null;
  const label = region.label.trim().slice(0, 80);
  if (!label) return null;
  return {
    label,
    box2d: region.box_2d,
    source,
    photoId: photo.id,
    photoVersion: photo.version,
  };
}

export function isCurrentRegion(region: PhotoRegion | null, photo: JobPhoto | null): region is PhotoRegion {
  if (!region || !photo) return false;
  if (region.photoId !== photo.id || region.photoVersion !== photo.version) return false;
  return validBox(region.box2d);
}
