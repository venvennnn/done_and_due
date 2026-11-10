import type { CatalogItem } from "./types";

export const SAMPLE_TRANSCRIPT =
  "Replaced the kitchen tap with a standard mixer tap. One hour of labor. The customer supplied the connectors.";

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

export const SAMPLE_CUSTOMER = {
  name: "Emma Wilson",
  demoEmail: "emma.wilson@example.com",
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
  ];
  function item(id: string, name: string, unit: string, rateMinor: number, aliases: string[]): CatalogItem {
    return { id, name, unit, rateMinor, aliases, active: true, retiredAt: now };
  }
}
