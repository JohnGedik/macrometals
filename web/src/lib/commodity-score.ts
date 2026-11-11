export type Localized<T> = { en: T; tr: T };
export type ScoreStatus = "bullish" | "neutral" | "bearish";

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
};

export type CommodityConfiguration = {
  commodity: string;
  name: Localized<string>;
  dashboardTitle: Localized<string>;
  scoreTitle: Localized<string>;
  summaryTone?: Localized<string>;
  priceRelationships?: Readonly<Record<string, number>>;
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
  current: number;
  previous: number;
  change: number;
  score: number;
  weight: number;
  weightedScore: number;
  contribution: number;
  status: ScoreStatus;
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
  const indicators = config.indicators.map((indicator): ScoredIndicator => {
    const rule = factors[indicator.id];
    if (!rule || !Number.isFinite(rule.scale) || rule.scale <= 0
      || !Number.isFinite(rule.trendThreshold) || rule.trendThreshold < 0
      || (rule.direction !== -1 && rule.direction !== 1)
      || indicator.values.length !== config.years.length || !indicator.values.every(Number.isFinite)) {
      throw new Error(`Invalid indicator configuration: ${config.commodity}/${indicator.id}`);
    }
    const current = indicator.values.at(-1)!;
    const previous = indicator.values.at(-2)!;
    const delta = current - previous;
    const change = indicator.changeKind !== "percentage" ? delta : previous === 0 ? 0 : delta / Math.abs(previous) * 100;
    const score = Math.max(0, Math.min(100, baseline + change * rule.direction / rule.scale * sensitivity));
    const weight = config.weights[indicator.id];
    return {
      id: indicator.id, current, previous, change, score, weight,
      weightedScore: score * weight / 100,
      contribution: (score - baseline) * weight / 100,
      status: statusOf(score),
    };
  });
  const score = Math.round(indicators.reduce((total, indicator) => total + indicator.weightedScore, 0));
  const drivers = (positive: boolean) => indicators
    .filter((indicator) => positive ? indicator.contribution > 1e-10 : indicator.contribution < -1e-10)
    .sort((first, second) => (positive ? second.contribution - first.contribution : first.contribution - second.contribution)
      || first.id.localeCompare(second.id))
    .slice(0, 3);
  return { score, status: statusOf(score), indicators, positiveDrivers: drivers(true), negativeDrivers: drivers(false) };
}