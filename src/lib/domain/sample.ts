import type { CatalogItem } from "./types";

export const SAMPLE_TRANSCRIPT =
  "Replaced the kitchen tap with a standard mixer tap for $110. Labor was $120. Used $10 of consumables. The customer supplied the connectors.";

export const SAMPLE_PHOTO = {
  id: "sample-kitchen-tap",
  url: "/demo/kitchen-tap.jpg",
  width: 1152,
  height: 864,
  mimeType: "image/jpeg",
  /**
   * [yMin, xMin, yMax, xMax] on the shipped kitchen-tap.jpg.
   * Tuned against a 0–1000 grid so the ellipse contains the mixer tap.
   */
  box2d: [100, 430, 780, 810] as [number, number, number, number],
  label: "Standard mixer tap",
};

/** Visible parts on kitchen-tap.jpg. Only the tap is billed. [yMin, xMin, yMax, xMax]. */
export const SAMPLE_OBJECTS = [
  { label: "Potted herb", box2d: [250, 10, 860, 320] as [number, number, number, number], billed: false },
  { label: "Standard mixer tap", box2d: [100, 430, 780, 810] as [number, number, number, number], billed: true },
  { label: "Soap dispenser", box2d: [300, 770, 690, 940] as [number, number, number, number], billed: false },
] as const;

export const SAMPLE_CUSTOMER = {
  name: "Alex Morgan",
  demoEmail: "alex.morgan@example.com",
};

export function normalizeTranscript(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function isSampleTranscript(value: string): boolean {
  return normalizeTranscript(value) === normalizeTranscript(SAMPLE_TRANSCRIPT);
}

export function defaultCatalog(): CatalogItem[] {
  const now = null;
  return [
    item("cat_tap", "Standard mixer tap", "each", 4000, ["standard mixer tap", "mixer tap", "kitchen tap"]),
    item("cat_labor", "Plumbing labor", "hr", 6000, ["plumbing labor", "labor", "plumbing", "one hour of labor"]),
    item("cat_thermo", "Thermostatic mixer tap", "each", 9500, ["thermostatic mixer tap", "thermostatic tap"]),
    item("cat_boiler", "Boiler service", "each", 18000, ["boiler service", "boiler"]),
    item("cat_garden", "Garden tidy", "each", 8000, ["garden tidy", "garden tidy up"]),
    item("cat_consumables", "Consumables", "each", 1000, ["consumables"]),
  ];
  function item(id: string, name: string, unit: string, rateMinor: number, aliases: string[]): CatalogItem {
    return { id, name, unit, rateMinor, aliases, active: true, retiredAt: now };
  }
}
