import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyExtraction } from "../src/lib/domain/extraction";
import { lineAmountMinor } from "../src/lib/domain/money";
import { defaultCatalog } from "../src/lib/domain/sample";
import { lineTotal } from "../src/lib/domain/invoice-math";
import type { InvoiceLine } from "../src/lib/domain/types";
import { parseDemoTranscript } from "../src/lib/demo/parser";
import { STAGED_JOBS, type StagedJob } from "./manifest";

type Score = {
  id: string;
  arm: string;
  skuCorrect: number;
  skuDenom: number;
  qtyCorrect: number;
  qtyDenom: number;
  unsupportedCharges: number;
  abstentions: number;
  missingItems: number;
  incorrectDollarsMinor: number;
  unresolvedMinor: number;
  edits: number;
  note: string;
};

function amount(quantity: string | null, rateMinor: number | null): number | null {
  if (!quantity || rateMinor === null) return null;
  return lineAmountMinor(quantity, rateMinor);
}

function scoreJob(job: StagedJob, proposed: InvoiceLine[], arm: string, note: string): Score {
  const expectedBillable = job.expected.filter((line) => !line.excluded);
  const proposedBillable = proposed.filter((line) => !line.excluded);
  const used = new Set<string>();
  let skuCorrect = 0;
  let qtyCorrect = 0;
  let missing = 0;
  let incorrect = 0;
  let unresolved = 0;
  let abstentions = 0;
  for (const expected of expectedBillable) {
    const match = proposedBillable.find((line) => !used.has(line.id) && (expected.sku ? line.catalogItemId === expected.sku : line.description.toLowerCase() === expected.description.toLowerCase()));
    if (!match) {
      missing += 1;
      const expectedAmount = amount(expected.quantity, expected.rateMinor);
      if (expectedAmount === null) unresolved += 1;
      else incorrect += expectedAmount;
      continue;
    }
    used.add(match.id);
    if (expected.sku && match.catalogItemId === expected.sku) skuCorrect += 1;
    if (!expected.sku && match.match.status === "abstain") abstentions += 1;
    if (expected.quantity && match.quantity === expected.quantity) qtyCorrect += 1;
    const expectedAmount = amount(expected.quantity, expected.rateMinor);
    const proposedAmount = lineTotal(match);
    if (expectedAmount === null || proposedAmount === null) unresolved += 1;
    else incorrect += Math.abs(expectedAmount - proposedAmount);
  }
  let unsupported = 0;
  for (const line of proposedBillable) {
    if (used.has(line.id)) continue;
    unsupported += 1;
    const proposedAmount = lineTotal(line);
    if (proposedAmount === null) unresolved += 1;
    else incorrect += proposedAmount;
  }
  return {
    id: job.id,
    arm,
    skuCorrect,
    skuDenom: expectedBillable.filter((line) => line.sku).length,
    qtyCorrect,
    qtyDenom: expectedBillable.filter((line) => line.quantity).length,
    unsupportedCharges: unsupported,
    abstentions,
    missingItems: missing,
    incorrectDollarsMinor: incorrect,
    unresolvedMinor: unresolved,
    edits: 0,
    note,
  };
}

function fixtureArm(job: StagedJob): Score {
  const extraction = parseDemoTranscript(job.note);
  const applied = applyExtraction({
    extraction,
    catalog: defaultCatalog(),
    transcript: { revisionId: "eval", text: job.note, source: "typed", createdAt: new Date(0).toISOString() },
    photo: null,
    regionSource: "sample",
  });
  const score = scoreJob(job, applied.lines, "fixture-catalog", "Deterministic parser plus catalog. Not a Gemini result.");
  const expectedExclusions = job.expected.filter((line) => line.excluded).length;
  if (applied.exclusions.length < expectedExclusions) score.missingItems += expectedExclusions - applied.exclusions.length;
  return score;
}

function pendingArm(job: StagedJob, arm: string, reason: string): Score {
  return { id: job.id, arm, skuCorrect: 0, skuDenom: 0, qtyCorrect: 0, qtyDenom: 0, unsupportedCharges: 0, abstentions: 0, missingItems: 0, incorrectDollarsMinor: 0, unresolvedMinor: 0, edits: 0, note: reason };
}

function csv(rows: Score[]): string {
  const header = "id,arm,sku_correct,sku_denom,qty_correct,qty_denom,unsupported_charges,abstentions,missing_items,incorrect_dollars_minor,unresolved_count,edits,note";
  const body = rows.map((row) => [row.id, row.arm, row.skuCorrect, row.skuDenom, row.qtyCorrect, row.qtyDenom, row.unsupportedCharges, row.abstentions, row.missingItems, row.incorrectDollarsMinor, row.unresolvedMinor, row.edits, JSON.stringify(row.note)].join(","));
  return [header, ...body].join("\n");
}

function sum(rows: Score[], key: keyof Score): number {
  return rows.reduce((total, row) => total + Number(row[key]), 0);
}

const live = process.env.EVAL_LIVE === "1";
const rows = STAGED_JOBS.flatMap((job) => [
  pendingArm(job, "voice-only", live ? "No staged voice recording is in the repo. Pilot call skipped." : "Pilot pending. Set EVAL_LIVE=1 only when staged recordings and GEMINI_API_KEY are available."),
  pendingArm(job, "photo-voice", live ? "Only kitchen-tap.jpg is published, and no voice file is paired with it. Pilot call skipped." : "Pilot pending. Photo-plus-voice Gemini is opt-in."),
  fixtureArm(job),
]);

const fixtureRows = rows.filter((row) => row.arm === "fixture-catalog");
const clean = fixtureRows.find((row) => row.id === "job-01-clean-tap");
const abstain = fixtureRows.find((row) => row.id === "job-02-missing-duration");
const report = `# Done & Due fixture evaluation

Jobs: ${STAGED_JOBS.length}
Arms: voice-only, photo-plus-voice, fixture catalog match
Provider: ${live ? "EVAL_LIVE=1 but staged voice files are not in the repo, so Gemini was not called" : "not called"}
Pilot results: pending
Media: public/demo/kitchen-tap.jpg is the only redistributable job photo. No voice recordings are committed.

## Fixture catalog arm

- SKU correct: ${sum(fixtureRows, "skuCorrect")} / ${sum(fixtureRows, "skuDenom")}
- Quantity correct: ${sum(fixtureRows, "qtyCorrect")} / ${sum(fixtureRows, "qtyDenom")}
- Unsupported charges: ${sum(fixtureRows, "unsupportedCharges")}
- Missing items (including missing exclusions): ${sum(fixtureRows, "missingItems")}
- Incorrect minor units: ${sum(fixtureRows, "incorrectDollarsMinor")}
- Unresolved field count: ${sum(fixtureRows, "unresolvedMinor")}

Clean case job-01 incorrect minor units: ${clean?.incorrectDollarsMinor ?? "n/a"} (expected $40 tap, $60 labor, connectors excluded, $100).
Abstention case job-02 unresolved count: ${abstain?.unresolvedMinor ?? "n/a"} (labor duration must stay unresolved).

These figures score the local parser. They are not a Gemini pilot.
`;

const out = join(process.cwd(), "eval", "output");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "jobs.csv"), csv(rows));
writeFileSync(join(out, "report.md"), report);
console.log(report);
