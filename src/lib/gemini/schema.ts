/** JSON schema sent to Gemini structured output. Quantities stay decimal strings. */
export const extractionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["lines", "exclusions", "questions"],
  properties: {
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "description",
          "catalogQuery",
          "quantityDecimalOrNull",
          "unitOrNull",
          "ownership",
          "transcriptQuoteOrNull",
          "photoRegionOrNull",
          "reviewReasonOrNull",
        ],
        properties: {
          description: { type: "string" },
          catalogQuery: { type: "string" },
          quantityDecimalOrNull: { type: ["string", "null"] },
          unitOrNull: { type: ["string", "null"] },
          ownership: { type: "string", enum: ["contractor", "customer", "unknown"] },
          transcriptQuoteOrNull: { type: ["string", "null"] },
          photoRegionOrNull: {
            type: ["object", "null"],
            additionalProperties: false,
            required: ["label", "box_2d"],
            properties: {
              label: { type: "string" },
              box_2d: { type: "array", items: { type: "integer" }, minItems: 4, maxItems: 4 },
            },
          },
          reviewReasonOrNull: { type: ["string", "null"] },
        },
      },
    },
    exclusions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "reason", "transcriptQuoteOrNull"],
        properties: {
          description: { type: "string" },
          reason: { type: "string" },
          transcriptQuoteOrNull: { type: ["string", "null"] },
        },
      },
    },
    questions: { type: "array", items: { type: "string" } },
  },
} as const;
