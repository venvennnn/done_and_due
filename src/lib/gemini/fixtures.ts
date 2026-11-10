import type { Extraction } from "@/lib/domain/types";

/** Known Gemini-shaped fixtures: one valid region, one invalid region, one null region. */
export const GEMINI_FIXTURES: Record<"valid" | "invalid" | "nullRegion", Extraction> = {
  valid: {
    lines: [
      {
        description: "Standard mixer tap",
        catalogQuery: "standard mixer tap",
        quantityDecimalOrNull: "1",
        unitOrNull: "each",
        ownership: "contractor",
        transcriptQuoteOrNull: "standard mixer tap",
        photoRegionOrNull: { label: "Standard mixer tap", box_2d: [100, 300, 500, 800] },
        reviewReasonOrNull: null,
      },
    ],
    exclusions: [],
    questions: [],
  },
  invalid: {
    lines: [
      {
        description: "Standard mixer tap",
        catalogQuery: "standard mixer tap",
        quantityDecimalOrNull: "1",
        unitOrNull: "each",
        ownership: "contractor",
        transcriptQuoteOrNull: "standard mixer tap",
        photoRegionOrNull: { label: "Standard mixer tap", box_2d: [100, 300, 100, 800] },
        reviewReasonOrNull: null,
      },
    ],
    exclusions: [],
    questions: [],
  },
  nullRegion: {
    lines: [
      {
        description: "Plumbing labor",
        catalogQuery: "plumbing labor",
        quantityDecimalOrNull: "1",
        unitOrNull: "hr",
        ownership: "contractor",
        transcriptQuoteOrNull: "One hour of labor",
        photoRegionOrNull: null,
        reviewReasonOrNull: null,
      },
    ],
    exclusions: [{ description: "Connectors", reason: "Customer supplied", transcriptQuoteOrNull: "The customer supplied the connectors." }],
    questions: [],
  },
};

export const KNOWN_BOX = [100, 300, 500, 800] as const;
