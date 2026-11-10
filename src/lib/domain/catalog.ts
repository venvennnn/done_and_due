import type { CatalogCandidate, CatalogItem, MatchDecision } from "./types";

/**
 * Pilot heuristics, frozen before evaluation.
 * Exact alias: unique and unit-compatible → auto-select.
 * Fuzzy: score >= fuzzyMinScore and top-two margin >= fuzzyMinMargin.
 */
export const CATALOG_MATCH_THRESHOLDS = {
  fuzzyMinScore: 0.72,
  fuzzyMinMargin: 0.12,
  maxSuggestions: 3,
} as const;

export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalUnit(unit: string | null | undefined): string | null {
  if (!unit) return null;
  const value = unit.toLowerCase().trim();
  if (["hr", "hrs", "hour", "hours"].includes(value)) return "hr";
  if (["ea", "each", "qty", "quantity", "item"].includes(value)) return "each";
  return value;
}

export function unitsCompatible(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = canonicalUnit(left);
  const b = canonicalUnit(right);
  if (!a || !b) return true;
  return a === b;
}

function tokens(value: string): string[] {
  return normalizeName(value).split(" ").filter(Boolean);
}

function jaccard(left: string[], right: string[]): number {
  const a = new Set(left);
  const b = new Set(right);
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function trigrams(value: string): string[] {
  const padded = `  ${normalizeName(value)}  `;
  const grams: string[] = [];
  for (let index = 0; index < padded.length - 2; index += 1) grams.push(padded.slice(index, index + 3));
  return grams;
}

function dice(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const gram of left) counts.set(gram, (counts.get(gram) ?? 0) + 1);
  let overlap = 0;
  for (const gram of right) {
    const count = counts.get(gram) ?? 0;
    if (count > 0) {
      overlap += 1;
      counts.set(gram, count - 1);
    }
  }
  return (2 * overlap) / (left.length + right.length);
}

export function lexicalScore(query: string, candidate: string): number {
  if (normalizeName(query) === normalizeName(candidate) && normalizeName(query).length > 0) return 1;
  const tokenScore = jaccard(tokens(query), tokens(candidate));
  const charScore = dice(trigrams(query), trigrams(candidate));
  return 0.55 * tokenScore + 0.45 * charScore;
}

type Scored = CatalogCandidate & { compatible: boolean; exact: boolean };

function scoreItem(query: string, item: CatalogItem, unit: string | null): Scored | null {
  const names = [item.name, ...item.aliases];
  let best = 0;
  let reason = "fuzzy";
  let exact = false;
  for (const name of names) {
    if (normalizeName(name) === normalizeName(query) && normalizeName(query).length > 0) {
      best = 1;
      reason = "exact_alias";
      exact = true;
      break;
    }
    const score = lexicalScore(query, name);
    if (score > best) {
      best = score;
      reason = "fuzzy";
    }
  }
  const compatible = unitsCompatible(unit, item.unit);
  return {
    catalogItemId: item.id,
    name: item.name,
    unit: item.unit,
    rateMinor: item.rateMinor,
    score: Number(best.toFixed(4)),
    reason: compatible ? reason : "unit_conflict",
    compatible,
    exact,
  };
}

export function matchCatalog(query: string, unit: string | null, catalog: CatalogItem[]): MatchDecision {
  const active = catalog.filter((item) => item.active);
  const trimmed = query.trim();
  if (!trimmed) {
    return { status: "unresolved", reason: "empty_query", score: null, margin: null, candidates: [] };
  }
  const scored = active
    .map((item) => scoreItem(trimmed, item, unit))
    .filter((item): item is Scored => item !== null)
    .sort((a, b) => b.score - a.score || a.catalogItemId.localeCompare(b.catalogItemId));

  const suggestions = scored.slice(0, CATALOG_MATCH_THRESHOLDS.maxSuggestions).map((item) => ({
    catalogItemId: item.catalogItemId,
    name: item.name,
    unit: item.unit,
    rateMinor: item.rateMinor,
    score: item.score,
    reason: item.reason,
  }));
  if (scored.length === 0) {
    return { status: "unresolved", reason: "no_catalog", score: null, margin: null, candidates: [] };
  }

  const top = scored[0];
  const second = scored[1];
  const margin = second ? Number((top.score - second.score).toFixed(4)) : 1;
  const exactHits = scored.filter((item) => item.exact && item.compatible);
  if (exactHits.length === 1) {
    const hit = exactHits[0];
    return {
      status: "exact",
      reason: "exact_alias",
      score: hit.score,
      margin,
      candidates: suggestions,
    };
  }
  if (scored.filter((item) => item.exact).length > 1) {
    return { status: "abstain", reason: "ambiguous_exact", score: top.score, margin, candidates: suggestions };
  }
  if (!top.compatible) {
    return { status: "abstain", reason: "unit_conflict", score: top.score, margin, candidates: suggestions };
  }
  const fuzzyOk = top.score >= CATALOG_MATCH_THRESHOLDS.fuzzyMinScore && margin >= CATALOG_MATCH_THRESHOLDS.fuzzyMinMargin;
  if (fuzzyOk && !top.exact) {
    return { status: "fuzzy", reason: "fuzzy_auto", score: top.score, margin, candidates: suggestions };
  }
  return {
    status: "abstain",
    reason: top.score < CATALOG_MATCH_THRESHOLDS.fuzzyMinScore ? "weak_score" : "narrow_margin",
    score: top.score,
    margin,
    candidates: suggestions,
  };
}

export function chosenCandidate(decision: MatchDecision): CatalogCandidate | null {
  if (decision.status !== "exact" && decision.status !== "fuzzy") return null;
  return decision.candidates.find((candidate) => candidate.score === decision.score) ?? decision.candidates[0] ?? null;
}
