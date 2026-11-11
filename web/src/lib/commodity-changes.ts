import type { CommodityConfiguration, CommodityIndicatorConfig } from "@/lib/commodity-score";

export type ChangePeriod = "monthly" | "quarterly" | "yoy";
export type ChangeObservation = { time: number; value: number };
export type ChangeIndicator = CommodityIndicatorConfig & { favorableDirection: -1 | 1 };
export type CommodityChangesInput = {
  commodity: string;
  indicators: readonly ChangeIndicator[];
  weights: Readonly<Record<string, number>>;
  currentValues: Readonly<Record<string, ChangeObservation | undefined>>;
  historicalValues: Readonly<Record<string, readonly ChangeObservation[] | undefined>>;
  scoringRestricted?: boolean;
};
export type IndicatorChange = {
  id: string;
  changes: Record<ChangePeriod, number | null>;
};
export type RankedChange = { id: string; change: number; impact: number; positive: boolean };

const periods: Record<ChangePeriod, { months: number; toleranceDays: number }> = {
  monthly: { months: 1, toleranceDays: 7 },
  quarterly: { months: 3, toleranceDays: 14 },
  yoy: { months: 12, toleranceDays: 31 },
};

export function commodityChangesInput(config: CommodityConfiguration): CommodityChangesInput {
  const scoringRestricted = config.scoringPolicy?.mode !== "research";
  const historicalValues = Object.fromEntries(config.indicators.map((indicator) => [indicator.id,
    indicator.observations ?? config.years.map((year, index) => ({ time: Date.UTC(year, 6, 1) / 1000, value: indicator.values[index] })),
  ]));
  return {
    commodity: config.commodity,
    scoringRestricted,
    indicators: config.indicators.map((indicator) => ({ ...indicator, favorableDirection: config.scoreRules.factors[indicator.id].direction })),
    weights: config.weights,
    currentValues: Object.fromEntries(config.indicators.map((indicator) => [indicator.id,
      scoringRestricted && (indicator.dataHealth?.kind !== "sourced" || !config.scoringPolicy?.approvedIndicators.includes(indicator.id))
        ? undefined : indicator.dataHealth?.kind === "sourced" && indicator.dataHealth.status !== "fresh" ? undefined : historicalValues[indicator.id].at(-1),
    ])),
    historicalValues,
  };
}

function monthsBefore(time: number, months: number) {
  const date = new Date(time * 1000);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - months + 1, 0)).getUTCDate();
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - months, Math.min(date.getUTCDate(), lastDay),
    date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()) / 1000;
}

export function comparisonObservation(current: ChangeObservation, history: readonly ChangeObservation[], period: ChangePeriod): ChangeObservation | null {
  if (!Number.isFinite(current.time) || !Number.isFinite(new Date(current.time * 1000).getTime())) return null;
  const target = monthsBefore(current.time, periods[period].months);
  const previous = history.filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value) && point.time <= target)
    .toSorted((first, second) => first.time - second.time).at(-1);
  return previous && target - previous.time <= periods[period].toleranceDays * 86400 ? previous : null;
}

export function calculateCommodityChanges(input: CommodityChangesInput): IndicatorChange[] {
  return input.indicators.map((indicator) => {
    const current = input.currentValues[indicator.id];
    const history = (input.historicalValues[indicator.id] ?? [])
      .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value))
      .toSorted((first, second) => first.time - second.time);
    const changeFor = (period: ChangePeriod): number | null => {
      if (!current || !Number.isFinite(current.time) || !Number.isFinite(current.value)
        || !Number.isFinite(new Date(current.time * 1000).getTime())) return null;
      const previous = comparisonObservation(current, history, period);
      if (!previous) return null;
      const delta = current.value - previous.value;
      if (indicator.changeKind !== "percentage") return delta;
      if (previous.value === 0) return null;
      const change = delta / Math.abs(previous.value) * 100;
      return Number.isFinite(change) ? change : null;
    };
    return { id: indicator.id, changes: { monthly: changeFor("monthly"), quarterly: changeFor("quarterly"), yoy: changeFor("yoy") } };
  });
}

export function rankCommodityChanges(input: CommodityChangesInput, changes: readonly IndicatorChange[], period: ChangePeriod) {
  const ranked = changes.flatMap((item): RankedChange[] => {
    const indicator = input.indicators.find((candidate) => candidate.id === item.id);
    const change = item.changes[period];
    const weight = input.weights[item.id];
    if (!indicator || change === null || !Number.isFinite(change) || Math.abs(change) < 1e-10
      || !Number.isFinite(weight) || weight <= 0) return [];
    const impact = weight * Math.abs(change);
    if (!Number.isFinite(impact)) return [];
    return [{ id: item.id, change, impact, positive: change * indicator.favorableDirection > 0 }];
  });
  const drivers = (positive: boolean) => ranked.filter((item) => item.positive === positive)
    .sort((first, second) => second.impact - first.impact || first.id.localeCompare(second.id))
    .slice(0, 3);
  return { positive: drivers(true), negative: drivers(false) };
}