export const metalModelCommodities = ["gold", "silver", "copper", "oil"] as const;
export type MetalModelCommodity = typeof metalModelCommodities[number];
export type ModelWeights = Record<string, number>;
export type SavedMetalModel = {
  id: string;
  name: string;
  weights: ModelWeights;
  definition_version: number;
  revision: number;
};

export function isMetalModelCommodity(value: unknown): value is MetalModelCommodity {
  return metalModelCommodities.some((commodity) => commodity === value);
}

export function validModelWeights(value: unknown, ids: readonly string[]): value is ModelWeights {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== ids.length) return false;
  const weights = value as Record<string, unknown>;
  let total = 0;
  for (const id of ids) {
    const weight = weights[id];
    if (!Object.hasOwn(weights, id) || typeof weight !== "number" || !Number.isInteger(weight) || weight < 0 || weight > 100) return false;
    total += weight;
  }
  return total === 100;
}

export function rebalanceModelWeights(weights: ModelWeights, id: string, value: number): ModelWeights {
  if (!Object.hasOwn(weights, id) || !Number.isFinite(value)) return weights;
  const next = Math.min(100, Math.max(0, Math.round(value)));
  if (next === weights[id]) return weights;
  const others = Object.entries(weights).filter(([key]) => key !== id);
  if (!others.length) return weights;
  const remaining = 100 - next;
  const previous = 100 - weights[id];
  const divisor = previous || others.length;
  const shares = others.map(([key, weight]) => {
    const scaled = (previous ? weight : 1) * remaining;
    return { key, quotient: Math.floor(scaled / divisor), remainder: scaled % divisor };
  });
  let leftover = remaining - shares.reduce((sum, share) => sum + share.quotient, 0);
  // Largest remainder keeps integer totals exact and breaks ties in dashboard order.
  shares.sort((a, b) => b.remainder - a.remainder);
  const result = { ...weights, [id]: next };
  for (const share of shares) result[share.key] = share.quotient + (leftover-- > 0 ? 1 : 0);
  return result;
}

export function previewMetalModel(weights: ModelWeights, factors: readonly { id: string; score: number | null }[]) {
  let coverage = 0;
  let weighted = 0;
  for (const { id, score } of factors) {
    if (score === null || !Number.isFinite(score)) continue;
    const weight = weights[id] ?? 0;
    coverage += weight;
    weighted += weight * score;
  }
  return { coverage, score: coverage ? Math.round(weighted / coverage) : null };
}
