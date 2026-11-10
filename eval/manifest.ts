export type ExpectedLine = {
  sku: string | null;
  description: string;
  quantity: string | null;
  unit: string | null;
  rateMinor: number | null;
  excluded: boolean;
};

export type StagedJob = {
  id: string;
  title: string;
  note: string;
  category: "clean" | "abstain" | "noisy" | "customer_supplied" | "near_duplicate" | "occlusion" | "missing_duration" | "other";
  hasPhoto: boolean;
  hasVoice: boolean;
  expected: ExpectedLine[];
  expectedTotalMinor: number | null;
};

const tap = (quantity = "1"): ExpectedLine => ({ sku: "cat_tap", description: "Standard mixer tap", quantity, unit: "each", rateMinor: 4000, excluded: false });
const labor = (quantity: string | null): ExpectedLine => ({ sku: "cat_labor", description: "Plumbing labor", quantity, unit: "hr", rateMinor: quantity ? 6000 : null, excluded: false });
const connectors: ExpectedLine = { sku: null, description: "Connectors", quantity: null, unit: null, rateMinor: 0, excluded: true };
const boiler: ExpectedLine = { sku: "cat_boiler", description: "Boiler service", quantity: "1", unit: "each", rateMinor: 18000, excluded: false };
const garden: ExpectedLine = { sku: "cat_garden", description: "Garden tidy", quantity: "1", unit: "each", rateMinor: 8000, excluded: false };

export const STAGED_JOBS: StagedJob[] = [
  { id: "job-01-clean-tap", title: "Kitchen tap", category: "clean", hasPhoto: true, hasVoice: false, expectedTotalMinor: 10000, note: "Replaced the kitchen tap with a standard mixer tap. One hour of labor. The customer supplied the connectors.", expected: [tap(), labor("1"), connectors] },
  { id: "job-02-missing-duration", title: "Tap, duration missing", category: "missing_duration", hasPhoto: true, hasVoice: false, expectedTotalMinor: null, note: "Replaced the kitchen tap with a standard mixer tap. Labor. The customer supplied the connectors.", expected: [tap(), labor(null), connectors] },
  { id: "job-03-ambiguous-tap", title: "Ambiguous tap", category: "near_duplicate", hasPhoto: false, hasVoice: false, expectedTotalMinor: null, note: "Fitted a tap. One hour of labor.", expected: [{ sku: null, description: "Tap", quantity: "1", unit: "each", rateMinor: null, excluded: false }, labor("1")] },
  { id: "job-04-thermostatic", title: "Thermostatic tap", category: "near_duplicate", hasPhoto: false, hasVoice: false, expectedTotalMinor: 15500, note: "Installed a thermostatic mixer tap. One hour of labor.", expected: [{ sku: "cat_thermo", description: "Thermostatic mixer tap", quantity: "1", unit: "each", rateMinor: 9500, excluded: false }, labor("1")] },
  { id: "job-05-one-point-five", title: "1.5 hours", category: "clean", hasPhoto: false, hasVoice: false, expectedTotalMinor: 13000, note: "Replaced the kitchen tap with a standard mixer tap. 1.5 hours of plumbing labor.", expected: [tap(), labor("1.5")] },
  { id: "job-06-customer-washers", title: "Customer washers", category: "customer_supplied", hasPhoto: false, hasVoice: false, expectedTotalMinor: 6000, note: "One hour of labor. The customer supplied the washers.", expected: [labor("1"), { ...connectors, description: "Washers" }] },
  { id: "job-07-noisy", title: "Noisy speech", category: "noisy", hasPhoto: false, hasVoice: false, expectedTotalMinor: 10000, note: "um replaced the kitchen tap, standard mixer tap. one hour of labor. customer supplied the connectors", expected: [tap(), labor("1"), connectors] },
  { id: "job-08-boiler", title: "Boiler service", category: "other", hasPhoto: false, hasVoice: false, expectedTotalMinor: 18000, note: "Annual boiler service.", expected: [boiler] },
  { id: "job-09-garden", title: "Garden tidy", category: "other", hasPhoto: false, hasVoice: false, expectedTotalMinor: 8000, note: "Garden tidy up for the front beds.", expected: [garden] },
  { id: "job-10-occlusion", title: "Occluded tap", category: "occlusion", hasPhoto: false, hasVoice: false, expectedTotalMinor: 6000, note: "The tap was behind stored boxes, so I could not see the model. One hour of labor.", expected: [labor("1")] },
  { id: "job-11-two-hours", title: "Two hours", category: "clean", hasPhoto: false, hasVoice: false, expectedTotalMinor: 12000, note: "Two hours of plumbing labor.", expected: [labor("2")] },
  { id: "job-12-mixer-alias", title: "Mixer alias", category: "clean", hasPhoto: false, hasVoice: false, expectedTotalMinor: 4000, note: "Fitted a mixer tap.", expected: [tap()] },
  { id: "job-13-kitchen-alias", title: "Kitchen alias", category: "clean", hasPhoto: false, hasVoice: false, expectedTotalMinor: 4000, note: "Replaced the kitchen tap.", expected: [tap()] },
  { id: "job-14-no-work", title: "Empty note", category: "abstain", hasPhoto: false, hasVoice: false, expectedTotalMinor: null, note: "Call back tomorrow.", expected: [] },
  { id: "job-15-labor-only", title: "Labor only", category: "clean", hasPhoto: false, hasVoice: false, expectedTotalMinor: 6000, note: "One hour of labor.", expected: [labor("1")] },
  { id: "job-16-customer-only", title: "Nothing billed", category: "customer_supplied", hasPhoto: false, hasVoice: false, expectedTotalMinor: 0, note: "The customer supplied the connectors.", expected: [connectors] },
  { id: "job-17-hours-decimal", title: "0.5 hours", category: "clean", hasPhoto: false, hasVoice: false, expectedTotalMinor: 3000, note: "0.5 hours of labor.", expected: [labor("0.5")] },
  { id: "job-18-boiler-labor", title: "Boiler plus labor", category: "other", hasPhoto: false, hasVoice: false, expectedTotalMinor: 24000, note: "Boiler service. One hour of labor.", expected: [boiler, labor("1")] },
  { id: "job-19-garden-supplied", title: "Garden, customer bags", category: "customer_supplied", hasPhoto: false, hasVoice: false, expectedTotalMinor: 8000, note: "Garden tidy. The customer supplied the bags.", expected: [garden, { ...connectors, description: "Bags" }] },
  { id: "job-20-duplicate-units", title: "Repeated labor mention", category: "other", hasPhoto: false, hasVoice: false, expectedTotalMinor: 6000, note: "One hour of labor. Labor was plumbing only.", expected: [labor("1")] },
  { id: "job-21-question-qty", title: "Tap quantity unstated", category: "abstain", hasPhoto: false, hasVoice: false, expectedTotalMinor: 4000, note: "Standard mixer tap.", expected: [tap()] },
  { id: "job-22-three-hours", title: "3 hours", category: "clean", hasPhoto: false, hasVoice: false, expectedTotalMinor: 18000, note: "3 hours of plumbing labor.", expected: [labor("3")] },
  { id: "job-23-thermo-supplied", title: "Thermostatic, customer parts", category: "customer_supplied", hasPhoto: false, hasVoice: false, expectedTotalMinor: 15500, note: "Thermostatic mixer tap. One hour of labor. The customer supplied the connectors.", expected: [{ sku: "cat_thermo", description: "Thermostatic mixer tap", quantity: "1", unit: "each", rateMinor: 9500, excluded: false }, labor("1"), connectors] },
  { id: "job-24-unknown-part", title: "Unknown part", category: "abstain", hasPhoto: false, hasVoice: false, expectedTotalMinor: null, note: "Replaced the outside stopcock.", expected: [] },
];
