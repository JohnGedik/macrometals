import type { IndicatorDataHealth, Observation } from "@/lib/commodity-score";

export type DerivedDependency = {
  id: string;
  source: string;
  points: readonly Observation[];
  maxAgeDays: number;
};

function validPoints(input: DerivedDependency, asOf: number) {
  return input.points.filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value) && point.time <= asOf)
    .toSorted((first, second) => first.time - second.time);
}

export function derivedDataHealth(inputs: readonly DerivedDependency[], checkedAt = Date.now() / 1000): IndicatorDataHealth {
  const dependencies = inputs.map((input) => {
    const observedAt = validPoints(input, checkedAt).at(-1)?.time ?? null;
    const validPolicy = Number.isFinite(input.maxAgeDays) && input.maxAgeDays > 0;
    const status = observedAt === null || !validPolicy ? "unavailable" as const
      : checkedAt - observedAt > input.maxAgeDays * 86400 ? "stale" as const : "fresh" as const;
    return { id: input.id, source: input.source, observedAt, status, maxAgeDays: input.maxAgeDays };
  });
  const unavailable = !dependencies.length || dependencies.some((input) => input.status === "unavailable");
  return {
    kind: "sourced", frequency: "derived", checkedAt,
    source: `Derived · ${inputs.map((input) => input.source).join(" / ")}`,
    status: unavailable ? "unavailable" : dependencies.some((input) => input.status === "stale") ? "stale" : "fresh",
    observedAt: unavailable ? null : Math.min(...dependencies.map((input) => input.observedAt!)),
    dependencies,
  };
}

function observationAt(input: DerivedDependency, time: number) {
  const point = validPoints(input, time).at(-1);
  return point && Number.isFinite(input.maxAgeDays) && input.maxAgeDays > 0 && time - point.time <= input.maxAgeDays * 86400 ? point : null;
}

export function stressIndexAt(inputs: readonly DerivedDependency[], time: number) {
  const gold = inputs.find((input) => input.id === "gold");
  const dollar = inputs.find((input) => input.id === "dxy");
  const rates = inputs.find((input) => input.id === "real-rates");
  if (!gold || !dollar || !rates || !Number.isFinite(time)) return null;
  const change = (input: DerivedDependency, percent: boolean) => {
    const current = observationAt(input, time);
    const previous = observationAt(input, time - 90 * 86400);
    if (!current || !previous || (percent && (current.value <= 0 || previous.value <= 0))) return null;
    return percent ? (current.value - previous.value) / previous.value * 100 : current.value - previous.value;
  };
  const goldChange = change(gold, true);
  const dollarChange = change(dollar, true);
  const rateChange = change(rates, false);
  if (goldChange === null || dollarChange === null || rateChange === null) return null;
  const normalize = (value: number, scale: number) => Math.max(0, Math.min(100, 50 + value / scale * 50));
  return Math.round(normalize(goldChange, 12) * 0.4 + normalize(-rateChange, 0.75) * 0.35 + normalize(-dollarChange, 5) * 0.25);
}

export function currentStressIndex(inputs: readonly DerivedDependency[], checkedAt = Date.now() / 1000) {
  const requiredIds = ["gold", "dxy", "real-rates"];
  const required = requiredIds.map((id) => inputs.find((input) => input.id === id) ?? { id, source: id, points: [], maxAgeDays: 5 });
  const health = derivedDataHealth(required, checkedAt);
  const asOf = health.observedAt;
  if (health.status !== "fresh" || asOf === null) return { score: null, asOf, health };
  const aligned = required.map((input) => ({ ...input, points: validPoints(input, asOf) }));
  const alignedHealth = derivedDataHealth(aligned, checkedAt);
  const score = alignedHealth.status === "fresh" ? stressIndexAt(aligned, asOf) : null;
  return { score, asOf, health: score === null && alignedHealth.status === "fresh" ? { ...alignedHealth, status: "unavailable" as const } : alignedHealth };
}