import { comparisonObservation } from "@/lib/commodity-changes";

export type Localized<T> = { en: T; tr: T };
export type ScoreStatus = "bullish" | "neutral" | "bearish";
export type Observation = { time: number; value: number };
export type IndicatorDataHealth = {
  kind: "sample" | "sourced";
  status: "sample" | "fresh" | "stale" | "unavailable";
  source: string;
  url?: string;
  frequency: "annual" | "daily" | "weekly" | "monthly" | "unknown";
  observedAt: number | null;
  checkedAt: number;
  maxAgeDays?: number;
};

export type CommodityIndicatorConfig = {
  id: string;
  name: Localized<string>;
  explanation: Localized<string | Record<ScoreStatus | "unavailable", string>>;
  unit: Localized<string>;
  prefix: string;
  tier: 1 | 2;
  digits: number;
  changeKind: "percentage" | "points" | "index-points";
  values: readonly number[];
  observations?: readonly Observation[];
  dataHealth?: IndicatorDataHealth;
};

export type CommodityConfiguration = {
  commodity: string;
  name: Localized<string>;
  dashboardTitle: Localized<string>;
  scoreTitle: Localized<string>;
  summaryTone?: Localized<string>;
  priceRelationships?: Readonly<Record<string, number>>;
  scoreSources?: Readonly<Record<string, "dxy" | "real-yields">>;
  disclosure: Localized<string>;
  source: Localized<string>;
  refresh: Localized<string>;
  methodology: Localized<{ title: string; description: string; formulas: readonly string[]; sources: string }>;
  market: { symbol: string; unit: string };
  contextProvider?: "gold" | "silver" | "copper" | "oil";
  years: readonly number[];
  chartStartYear: number;
  indicators: readonly CommodityIndicatorConfig[];
  weights: Readonly<Record<string, number>>;
  scoreRules: {
    baseline: number;
    sensitivity: number;
    bullish: number;
    bearish: number;
    factors: Readonly<Record<string, { direction: -1 | 1; scale: number; trendThreshold: number }>>;
  };
};

export type ScoredIndicator = {
  id: string;
  current: number | null;
  previous: number | null;
  change: number | null;
  score: number | null;
  weight: number;
  weightedScore: number;
  contribution: number;
  status: ScoreStatus | "unavailable";
};

export function scoreCommodity(config: CommodityConfiguration) {
  const { baseline, sensitivity, bullish, bearish, factors } = config.scoreRules;
  const ids = config.indicators.map((indicator) => indicator.id);
  const validRules = [baseline, sensitivity, bullish, bearish].every(Number.isFinite)
    && baseline >= 0 && baseline <= 100 && sensitivity > 0
    && bearish >= 0 && bearish < baseline && bullish > baseline && bullish <= 100;
  const validWeights = ids.length > 0 && new Set(ids).size === ids.length
    && Object.keys(config.weights).length === ids.length && Object.keys(factors).length === ids.length
    && ids.every((id) => Number.isFinite(config.weights[id]) && config.weights[id] >= 0)
    && Math.abs(ids.reduce((total, id) => total + config.weights[id], 0) - 100) < 1e-8;
  const validYears = config.years.length >= 2 && config.years.every((year, index) =>
    Number.isInteger(year) && (index === 0 || year > config.years[index - 1]))
    && Number.isInteger(config.chartStartYear) && config.years.some((year) => year >= config.chartStartYear);
  if (!validRules || !validWeights || !validYears) throw new Error(`Invalid commodity configuration: ${config.commodity}`);

  const statusOf = (score: number): ScoreStatus => score >= bullish ? "bullish" : score <= bearish ? "bearish" : "neutral";
  const rawIndicators = config.indicators.map((indicator): ScoredIndicator => {
    const rule = factors[indicator.id];
    if (!rule || !Number.isFinite(rule.scale) || rule.scale <= 0
      || !Number.isFinite(rule.trendThreshold) || rule.trendThreshold < 0
      || (rule.direction !== -1 && rule.direction !== 1)
      || indicator.values.length !== config.years.length || !indicator.values.every(Number.isFinite)) {
      throw new Error(`Invalid indicator configuration: ${config.commodity}/${indicator.id}`);
    }
    const observations = indicator.observations?.filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value))
      .toSorted((first, second) => first.time - second.time);
    const latest = observations?.at(-1);
    const reference = latest ? comparisonObservation(latest, observations!, "yoy") : null;
    const current = observations === undefined ? indicator.values.at(-1)! : latest?.value ?? null;
    const previous = observations === undefined ? indicator.values.at(-2)! : reference?.value ?? null;
    const change = current === null || previous === null ? null : indicator.changeKind !== "percentage" ? current - previous
      : previous === 0 ? (observations === undefined ? 0 : null) : (current - previous) / Math.abs(previous) * 100;
    const excluded = indicator.dataHealth?.kind === "sourced" && indicator.dataHealth.status !== "fresh";
    const score = change === null || excluded ? null : Math.max(0, Math.min(100, baseline + change * rule.direction / rule.scale * sensitivity));
    const weight = config.weights[indicator.id];
    return {
      id: indicator.id, current, previous, change, score, weight,
      weightedScore: score === null ? 0 : score * weight / 100,
      contribution: score === null ? 0 : (score - baseline) * weight / 100,
      status: score === null ? "unavailable" : statusOf(score),
    };
  });
  const coverage = rawIndicators.reduce((total, indicator) => total + (indicator.score === null ? 0 : indicator.weight), 0);
  const indicators = rawIndicators.map((indicator) => ({ ...indicator,
    weightedScore: coverage ? indicator.weightedScore * 100 / coverage : 0,
    contribution: coverage ? indicator.contribution * 100 / coverage : 0,
  }));
  const score = coverage ? Math.round(indicators.reduce((total, indicator) => total + indicator.weightedScore, 0)) : null;
  const drivers = (positive: boolean) => indicators
    .filter((indicator) => positive ? indicator.contribution > 1e-10 : indicator.contribution < -1e-10)
    .sort((first, second) => (positive ? second.contribution - first.contribution : first.contribution - second.contribution)
      || first.id.localeCompare(second.id))
    .slice(0, 3);
  return { score, coverage, status: score === null ? "unavailable" as const : statusOf(score), indicators, positiveDrivers: drivers(true), negativeDrivers: drivers(false) };
}