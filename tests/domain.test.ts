import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { matchCatalog } from "@/lib/domain/catalog";
import { isCurrentRegion } from "@/lib/domain/evidence";
import { applyExtraction, parseExtraction } from "@/lib/domain/extraction";
import { displayRect, sourceRect } from "@/lib/domain/geometry";
import { approvalBlockers, reviewFlags } from "@/lib/domain/invoice-math";
import { lineAmountMinor } from "@/lib/domain/money";
import { defaultCatalog, SAMPLE_TRANSCRIPT } from "@/lib/domain/sample";
import { GEMINI_FIXTURES } from "@/lib/gemini/fixtures";
import { parseDemoTranscript } from "@/lib/demo/parser";
import { draftFromTranscript } from "@/lib/demo/sample-draft";
import { samplePhoto } from "@/lib/demo/seed";

const catalog = defaultCatalog();
const photo = { ...samplePhoto(), id: "photo_1", version: 2, url: null };
const transcript = { revisionId: "rev_1", text: SAMPLE_TRANSCRIPT, source: "typed" as const, createdAt: "2026-11-10T00:00:00.000Z" };

describe("money and geometry", () => {
  it("rounds 1.5 hours at $60 to $90 and keeps the $40 tap", () => {
    expect(lineAmountMinor("1", 4000)).toBe(4000);
    expect(lineAmountMinor("1.5", 6000)).toBe(9000);
    expect(lineAmountMinor("1", 4000) + lineAmountMinor("1.5", 6000)).toBe(13000);
  });

  it("places Gemini box [100, 300, 500, 800] on a 1000×500 image inside a 400×400 contain frame", () => {
    expect(sourceRect([100, 300, 500, 800], 1000, 500)).toEqual({ x: 300, y: 50, width: 500, height: 200 });
    expect(displayRect([100, 300, 500, 800], 1000, 500, 400, 400)).toEqual({ x: 120, y: 120, width: 200, height: 80 });
  });
});

describe("catalog abstention", () => {
  it("auto-selects an exact alias and abstains on a bare tap", () => {
    const exact = matchCatalog("standard mixer tap", "each", catalog);
    expect(exact.status).toBe("exact");
    expect(exact.candidates[0]?.rateMinor).toBe(4000);
    const labor = matchCatalog("plumbing labor", "hr", catalog);
    expect(labor.status).toBe("exact");
    expect(labor.candidates[0]?.rateMinor).toBe(6000);
    const ambiguous = matchCatalog("tap", "each", catalog);
    expect(ambiguous.status).toBe("abstain");
    expect(ambiguous.candidates.length).toBeGreaterThan(1);
    expect(ambiguous.candidates.length).toBeLessThanOrEqual(3);
  });
});

describe("extraction contract", () => {
  it("keeps a valid region, drops an invalid one, and accepts a null region", () => {
    const valid = applyExtraction({ extraction: parseExtraction(GEMINI_FIXTURES.valid), catalog, transcript, photo, regionSource: "gemini" });
    expect(valid.lines[0]?.photoRegion?.box2d).toEqual([100, 300, 500, 800]);
    expect(valid.lines[0]?.photoRegion?.photoVersion).toBe(2);
    expect(valid.lines[0]?.rateMinor).toBe(4000);
    const invalid = applyExtraction({ extraction: GEMINI_FIXTURES.invalid, catalog, transcript, photo });
    expect(invalid.lines).toHaveLength(1);
    expect(invalid.lines[0]?.photoRegion).toBeNull();
    expect(invalid.lines[0]?.rateMinor).toBe(4000);
    const missing = applyExtraction({ extraction: GEMINI_FIXTURES.nullRegion, catalog, transcript, photo });
    expect(missing.lines[0]?.photoRegion).toBeNull();
    expect(missing.exclusions[0]?.description).toMatch(/Connectors/i);
  });

  it("marks a region stale when the photo version changes", () => {
    const applied = applyExtraction({ extraction: GEMINI_FIXTURES.valid, catalog, transcript, photo });
    expect(isCurrentRegion(applied.lines[0]!.photoRegion, photo)).toBe(true);
    expect(isCurrentRegion(applied.lines[0]!.photoRegion, { ...photo, version: photo.version + 1 })).toBe(false);
  });

  it("asks the contractor to choose when a quote appears twice", () => {
    const doubled = {
      ...transcript,
      text: "One hour of labor. Then another note. One hour of labor.",
    };
    const extraction = parseDemoTranscript("One hour of labor. Then another note. One hour of labor.");
    const applied = applyExtraction({ extraction, catalog, transcript: doubled, photo: null });
    const labor = applied.lines.find((line) => line.unit === "hr");
    expect(labor?.transcriptSpan?.ambiguous).toBe(true);
  });
});

describe("sample draft", () => {
  it("bills the tap and labor and excludes connectors", () => {
    const drafted = draftFromTranscript({ text: SAMPLE_TRANSCRIPT, catalog, transcript, photo: samplePhoto(), idPrefix: "sample" });
    const tap = drafted.lines.find((line) => line.unit === "each");
    const labor = drafted.lines.find((line) => line.unit === "hr");
    expect(tap?.rateMinor).toBe(4000);
    expect(tap?.quantity).toBe("1");
    expect(tap?.photoRegion?.box2d).toEqual([100, 430, 780, 810]);
    expect(labor?.rateMinor).toBe(6000);
    expect(labor?.photoRegion).toBeNull();
    expect(drafted.lines.filter((line) => line.photoRegion).map((line) => line.photoRegion?.label)).toEqual(["Standard mixer tap", "Potted herb", "Soap dispenser"]);
    expect(drafted.lines.filter((line) => line.description === "Potted herb" || line.description === "Soap dispenser").every((line) => line.excluded)).toBe(true);
    expect(labor?.transcriptQuote?.toLowerCase()).toContain("one hour of labor");
    expect(drafted.exclusions[0]?.description.toLowerCase()).toContain("connector");
    const flags = reviewFlags({
      invoice: {
        lines: drafted.lines,
        exclusions: drafted.exclusions,
        recipientEmail: "emma.wilson@example.com",
        revision: 1,
      },
      catalog,
      transcriptText: SAMPLE_TRANSCRIPT,
    });
    expect(approvalBlockers(flags)).toHaveLength(0);
  });

  it("blocks a missing duration", () => {
    const text = "Replaced the kitchen tap with a standard mixer tap. Labor. The customer supplied the connectors.";
    const drafted = draftFromTranscript({
      text,
      catalog,
      transcript: { ...transcript, text },
      photo: samplePhoto(),
    });
    const flags = approvalBlockers(
      reviewFlags({
        invoice: { lines: drafted.lines, exclusions: drafted.exclusions, recipientEmail: "a@example.com", revision: 1 },
        catalog,
        transcriptText: text,
      }),
    );
    expect(flags.some((flag) => flag.code === "MISSING_DURATION")).toBe(true);
  });
});

describe("demo isolation", () => {
  it("does not reference provider hosts from the demo engine", () => {
    const source = [
      readFileSync("src/lib/demo/engine.ts", "utf8"),
      readFileSync("src/lib/demo/parser.ts", "utf8"),
      readFileSync("src/lib/demo/seed.ts", "utf8"),
    ].join("\n");
    expect(source).not.toMatch(/paypal\.com|supabase|generativelanguage|googleapis/);
  });
});
