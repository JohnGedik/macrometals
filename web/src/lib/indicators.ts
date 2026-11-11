import { messages, type Locale } from "@/lib/i18n";
import { getOilInventory } from "@/lib/oil-inventory";
import { getCommodityConfiguration } from "@/lib/commodity-config";
import { scoreCommodity, type CommodityConfiguration, type IndicatorDataHealth } from "@/lib/commodity-score";
import { hydrateCommodityObservations } from "@/lib/commodity-data";
import { currentStressIndex, derivedDataHealth, stressIndexAt, type DerivedDependency } from "@/lib/derived-data";

export type { CommodityKey } from "@/lib/commodity-config";

type Point = { time: number; value: number };
export type IndicatorChartPoint = Point & { label?: string };
type Series = { current: number; points: Point[]; currentTime?: number; highs?: Point[]; lows?: Point[] };
type Impact = "bullish" | "neutral" | "bearish" | "unavailable";
type Trend = "up" | "down" | "flat" | "unavailable";

export type IndicatorCardData = {
  id: string;
  name: string;
  value: string;
  trend: Trend;
  trendLabel: string;
  impact: Impact;
  impactLabel: string;
  subject: string;
  explanation: string;
  group?: "tier1" | "tier2" | "context";
  previousValue?: string;
  yoyChange?: string;
  ninetyDayChange?: string;
  comparison?: { label: string; value: string };
  score?: number;
  factorScore?: number | null;
  scoreExclusion?: "sample" | "unapproved" | "unavailable" | null;
  commodityName?: string;
  priceCorrelation?: number;
  dataHealth?: IndicatorDataHealth;
  severity?: string;
  provenance?: string;
  chart?: { points: IndicatorChartPoint[]; unit: string; digits: number; axisDigits?: number; label: string; zeroBaseline: boolean };
};

export type MacroScoreSummary = {
  score: number | null;
  coverage: number;
  dataMix: { sourcedWeight: number; sampleWeight: number; excludedWeight: number };
  release: { mode: "sourced-only" | "research"; minimumCoverage: number; missingRequired: string[]; approvedCount: number; referenceSampleWeight: number };
  status: Impact;
  statusLabel: string;
  classification: string;
  note: string;
  weights: string;
  disclosure: string;
  positiveDrivers: { id: string; name: string; contribution: number; weight: number; score: number }[];
  negativeDrivers: { id: string; name: string; contribution: number; weight: number; score: number }[];
};

export type CommodityHeaderData = {
  price: number | null;
  dailyChange: number | null;
  oneYearReturn: number | null;
  high52Week: number | null;
  low52Week: number | null;
  observedAt: number | null;
  unit: string;
  points: IndicatorChartPoint[];
};

type MarketResponse = {
  chart?: {
    result?: Array<{
      meta?: { regularMarketPrice?: number; regularMarketTime?: number };
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null>; high?: Array<number | null>; low?: Array<number | null> }> };
    }>;
  };
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

async function getMarketSeries(symbol: string, interval = "1wk", range = "5y"): Promise<Series | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as MarketResponse;
    const result = payload.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const quote = result?.indicators?.quote?.[0];
    const closes = quote?.close ?? [];
    const points = timestamps.flatMap((time, index) => {
      const value = closes[index];
      return finite(value) ? [{ time, value }] : [];
    });
    const highs = timestamps.flatMap((time, index) => finite(quote?.high?.[index]) ? [{ time, value: quote!.high![index]! }] : []);
    const lows = timestamps.flatMap((time, index) => finite(quote?.low?.[index]) ? [{ time, value: quote!.low![index]! }] : []);
    const current = finite(result?.meta?.regularMarketPrice)
      ? result.meta.regularMarketPrice
      : points.at(-1)?.value;

    return finite(current) && points.length ? { current, points, currentTime: finite(result?.meta?.regularMarketTime) ? result.meta.regularMarketTime : undefined, highs, lows } : null;
  } catch {
    return null;
  }
}

async function getRealYieldSeries(): Promise<Series | null> {
  try {
    const response = await fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFII10", {
      next: { revalidate: 21600 },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;

    const rows = (await response.text()).trim().split(/\r?\n/).slice(1);
    const points = rows.flatMap((row) => {
      const [date, rawValue] = row.split(",");
      if (!rawValue?.trim() || rawValue.trim() === ".") return [];
      const value = Number(rawValue);
      const time = Date.parse(`${date}T12:00:00Z`) / 1000;
      return date && finite(value) && Number.isFinite(time) ? [{ time, value }] : [];
    });

    return points.length ? { current: points.at(-1)!.value, points } : null;
  } catch {
    return null;
  }
}

function valueAt(points: Point[], time: number) {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (points[index].time <= time) return points[index].value;
  }
  return null;
}

function periodChange(points: Point[] | null, days = 90) {
  if (!points?.length) return null;
  const latest = points.at(-1)!;
  const previous = valueAt(points, latest.time - days * 86400);
  return previous && previous !== 0 ? latest.value - previous : null;
}

function percentageChange(points: Point[] | null, days = 90) {
  if (!points?.length) return null;
  const latest = points.at(-1)!;
  const previous = valueAt(points, latest.time - days * 86400);
  return previous && previous !== 0 ? ((latest.value - previous) / previous) * 100 : null;
}

function trend(change: number | null, threshold: number): Trend {
  if (change === null) return "unavailable";
  if (change > threshold) return "up";
  if (change < -threshold) return "down";
  return "flat";
}

function impactFromChange(change: number | null, favorableDirection: -1 | 1, threshold: number): Impact {
  if (change === null) return "unavailable";
  const favorableChange = change * favorableDirection;
  if (favorableChange > threshold) return "bullish";
  if (favorableChange < -threshold) return "bearish";
  return "neutral";
}

function alignRatio(left: Series | null, right: Series | null): Point[] {
  if (!left || !right) return [];
  const rightByDay = new Map(
    right.points.map((point) => [new Date(point.time * 1000).toISOString().slice(0, 10), point.value]),
  );

  return left.points.flatMap((point) => {
    const day = new Date(point.time * 1000).toISOString().slice(0, 10);
    const denominator = rightByDay.get(day);
    return denominator ? [{ time: point.time, value: point.value / denominator }] : [];
  });
}

function lastYearPoints(points: Point[], endTime = points.at(-1)?.time ?? 0): IndicatorChartPoint[] {
  return points.filter((point) => point.time >= endTime - 365 * 86400 && point.time <= endTime);
}

function lastTenYearPoints(points: Point[], endTime = points.at(-1)?.time ?? 0): IndicatorChartPoint[] {
  return points.filter((point) => point.time >= endTime - 3652 * 86400 && point.time <= endTime);
}

function yearComparison(points: Point[]) {
  const latest = points.at(-1);
  if (!latest) return null;
  const previous = valueAt(points, latest.time - 365 * 86400);
  if (previous === null || previous === 0) return null;
  return { previous, change: ((latest.value - previous) / Math.abs(previous)) * 100 };
}

function mean(points: Point[]) {
  if (!points.length) return null;
  return points.reduce((total, point) => total + point.value, 0) / points.length;
}

function ratioImpact(current: number | null, average: number | null, favorableWhenAbove: boolean): Impact {
  if (current === null || average === null || average === 0) return "unavailable";
  const difference = (current - average) / average;
  if (difference > 0.05) return favorableWhenAbove ? "bullish" : "bearish";
  if (difference < -0.05) return favorableWhenAbove ? "bearish" : "bullish";
  return "neutral";
}

function number(value: number | null, locale: Locale, digits = 2) {
  if (value === null) return "—";
  return new Intl.NumberFormat(locale === "tr" ? "tr-TR" : "en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function impactLabel(impact: Impact, locale: Locale) {
  return messages[locale].macro.impact[impact];
}

function trendLabel(direction: Trend, locale: Locale) {
  return messages[locale].macro.trend[direction];
}

function macroScoreCards(locale: Locale, config: CommodityConfiguration) {
  const t = messages[locale].macro;
  const result = scoreCommodity(config);
  const cards = config.indicators.map((metric, index) => {
    const { current, previous, change: yoy, status: impact } = result.indicators[index];
    const unitLabel = metric.unit[locale];
    const value = (amount: number | null) => amount === null ? "—" : `${metric.prefix}${number(amount, locale, metric.digits)}${unitLabel}`;
    const formatChange = (change: number | null) => change === null ? "—" : `${change > 0 ? "+" : ""}${number(change, locale, metric.changeKind === "points" ? 2 : 1)}${metric.changeKind === "points" ? (locale === "tr" ? " yüzde puan" : " pp") : metric.changeKind === "index-points" ? (locale === "tr" ? " endeks puanı" : " index points") : "%"}`;
    const latest = metric.observations?.at(-1);
    const target = latest ? latest.time - 90 * 86400 : 0;
    const prior90 = metric.observations?.findLast((point) => point.time <= target);
    const valid90 = metric.dataHealth?.status === "fresh" && latest && prior90 && target - prior90.time <= 7 * 86400;
    const change90 = valid90 ? metric.changeKind === "percentage" ? prior90.value === 0 ? null : (latest.value - prior90.value) / Math.abs(prior90.value) * 100 : latest.value - prior90.value : null;
    const points = metric.observations ? lastTenYearPoints([...metric.observations]) : config.years
      .filter((year) => year >= config.chartStartYear)
      .map((year) => {
        const index = config.years.findIndex((value) => value === year);
        return { time: Date.UTC(year, 6, 1) / 1000, value: metric.values[index], label: String(year) };
      });
    const explanation = metric.explanation[locale];
    const exclusion = result.indicators[index].exclusionReason;
    const interpretation = exclusion === "sample" ? t.sampleReferenceInterpretation : exclusion === "unapproved" ? t.unapprovedReferenceInterpretation
      : typeof explanation === "string" ? explanation : explanation[impact];
    return { ...makeCard(locale, config.commodity, metric.id, metric.name[locale], value(current), trend(yoy, config.scoreRules.factors[metric.id].trendThreshold), impact, interpretation, {
        previousValue: value(previous),
        yoyChange: formatChange(yoy),
        group: metric.tier === 1 ? "tier1" : "tier2",
        chart: { points, unit: unitLabel, digits: metric.digits, label: metric.dataHealth?.kind === "sourced" ? t.sourcedHistory : t.lastTenYears, zeroBaseline: false },
      }), factorScore: result.indicators[index].score, scoreExclusion: result.indicators[index].exclusionReason, dataHealth: metric.dataHealth,
      ninetyDayChange: metric.dataHealth?.kind === "sourced" ? formatChange(change90) : undefined };
  });
  const { score, status } = result;
  const classification = score === null ? t.unavailable : score <= 25 ? t.severity.low : score <= 50 ? t.severity.moderate : score <= 75 ? t.severity.elevated : t.severity.high;
  const driverLabel = (driver: (typeof result.indicators)[number]) => ({
    id: driver.id, name: config.indicators.find((indicator) => indicator.id === driver.id)!.name[locale],
    contribution: driver.contribution, weight: driver.weight, score: driver.score!,
  });
  const sourcedWeight = result.indicators.reduce((total, item, index) => total + (item.score !== null && config.indicators[index].dataHealth?.kind === "sourced" ? item.weight : 0), 0);
  const sampleWeight = result.coverage - sourcedWeight;
  return {
    cards,
    summary: {
      score,
      coverage: result.coverage,
      dataMix: { sourcedWeight, sampleWeight, excludedWeight: 100 - result.coverage },
      release: {
        mode: result.policy.mode, minimumCoverage: result.policy.minimumCoverage,
        missingRequired: result.missingRequired.map((id) => config.indicators.find((indicator) => indicator.id === id)!.name[locale]),
        approvedCount: result.policy.approvedIndicators.length,
        referenceSampleWeight: config.indicators.reduce((total, indicator) => total + (indicator.dataHealth?.kind !== "sourced" ? config.weights[indicator.id] : 0), 0),
      },
      status,
      statusLabel: impactLabel(status, locale),
      classification,
      note: (result.policy.mode === "sourced-only" ? t.scoreModelNote : t.macroScoreNote).replace("{count}", String(config.indicators.length)),
      weights: `${t.weightsLabel}: ${config.indicators.map((indicator) => `${indicator.name[locale]} ${number(config.weights[indicator.id], locale, 0)}%`).join(" · ")}`,
      disclosure: result.policy.mode === "sourced-only" ? t.sourcedOnlyDisclosure : config.disclosure[locale],
      positiveDrivers: result.positiveDrivers.map(driverLabel),
      negativeDrivers: result.negativeDrivers.map(driverLabel),
    },
  };
}

function makeCard(
  locale: Locale,
  subject: string,
  id: string,
  name: string,
  value: string,
  direction: Trend,
  impact: Impact,
  explanation: string,
  extra?: Pick<IndicatorCardData, "previousValue" | "yoyChange" | "group" | "comparison" | "score" | "severity" | "provenance" | "chart" | "dataHealth">,
): IndicatorCardData {
  const t = messages[locale].macro;
  return {
    id,
    name,
    value,
    trend: direction,
    trendLabel: trendLabel(direction, locale),
    impact,
    impactLabel: impactLabel(impact, locale),
    subject: t.onCommodity.replace("{commodity}", getCommodityConfiguration(subject)?.name[locale] ?? subject),
    explanation,
    ...extra,
  };
}

export async function getMacroIndicators(config: CommodityConfiguration, locale: Locale) {
  const requestedSources = new Set(Object.values(config.scoreSources ?? {}));
  const [dxy, realYields] = await Promise.all([
    requestedSources.has("dxy") ? getMarketSeries("DX-Y.NYB", "1d", "10y") : Promise.resolve(null),
    requestedSources.has("real-yields") ? getRealYieldSeries() : Promise.resolve(null),
  ]);
  const resolvedConfig = hydrateCommodityObservations(config, { dxy: dxy?.points ?? null, "real-yields": realYields?.points ?? null });
  const macro = macroScoreCards(locale, resolvedConfig);
  const context = config.contextProvider
    ? await getContextIndicators(config.contextProvider, locale)
    : { cards: [], source: config.source[locale] };
  const contextSources: Record<string, "dxy" | "real-yields"> = { "live-dxy": "dxy", "oil-dxy": "dxy", "live-real-rates": "real-yields" };
  const contextCards = context.cards.filter((card) => !requestedSources.has(contextSources[card.id]));
  return {
    cards: [...macro.cards, ...contextCards.map((card) => ({ ...card, group: "context" as const, dataHealth: card.dataHealth ?? contextDataHealth(card, config.commodity) }))].map((card) => ({
      ...card,
      commodityName: config.name[locale],
      priceCorrelation: config.priceRelationships?.[card.id],
    })),
    summary: macro.summary,
    config: resolvedConfig,
    source: context.source,
  };
}

function contextDataHealth(card: IndicatorCardData, commodity: string): IndicatorDataHealth {
  const checkedAt = Date.now() / 1000;
  if (card.id === "gold-seasonality") return { kind: "sample", status: "sample", source: "Monthly sample dataset", frequency: "monthly", observedAt: null, checkedAt };
  if (card.id === "oil-curve") return { kind: "sourced", status: "unavailable", source: "unconfigured", frequency: "unknown", observedAt: null, checkedAt };
  const realRates = card.id.includes("real-rates");
  const inventory = card.id === "oil-inventory";
  const frequency = inventory ? "weekly" : realRates || commodity === "oil" ? "daily" : "weekly";
  const maxAgeDays = inventory ? 14 : frequency === "daily" ? 5 : 10;
  const observedAt = card.chart?.points.at(-1)?.time ?? null;
  return {
    kind: "sourced", frequency, observedAt, checkedAt, maxAgeDays,
    source: realRates ? "FRED / U.S. Treasury · DFII10" : inventory ? "EIA · WCESTUS1" : card.id === "stress-index" ? "Derived · Yahoo Finance / FRED" : "Yahoo Finance",
    url: realRates ? "https://fred.stlouisfed.org/series/DFII10" : inventory ? "https://www.eia.gov/petroleum/supply/weekly/" : "https://finance.yahoo.com/",
    status: observedAt === null ? "unavailable" : checkedAt - observedAt > maxAgeDays * 86400 ? "stale" : "fresh",
  };
}

function quoteDependency(id: string, source: string, series: Series | null, maxAgeDays: number): DerivedDependency {
  const time = series?.currentTime ?? series?.points.at(-1)?.time;
  return { id, source, maxAgeDays, points: series && time !== undefined ? [{ time, value: series.current }] : [] };
}

function protectDerivedCard(card: IndicatorCardData, inputs: readonly DerivedDependency[], locale: Locale): IndicatorCardData {
  const health = card.dataHealth ?? derivedDataHealth([...inputs, {
    id: "matched-history", source: "Aligned historical observations", points: card.chart?.points ?? [],
    maxAgeDays: Math.min(...inputs.map((input) => input.maxAgeDays)),
  }]);
  if (health.status === "fresh") return { ...card, dataHealth: health };
  return { ...card, value: "—", trend: "unavailable", trendLabel: trendLabel("unavailable", locale), impact: "unavailable",
    impactLabel: impactLabel("unavailable", locale), explanation: messages[locale].macro.derivedUnavailable,
    previousValue: undefined, yoyChange: undefined, score: undefined, severity: undefined, dataHealth: health };
}

async function getContextIndicators(metal: "gold" | "silver" | "copper" | "oil", locale: Locale) {
  const t = messages[locale].macro;
  if (metal === "oil") return getOilIndicators(locale);
  const historyRange = metal === "gold" ? "10y" : "5y";
  const [dollar, gold, silver, oil, sp500, realYields, copper] = await Promise.all([
    getMarketSeries("DX-Y.NYB", "1wk", historyRange),
    getMarketSeries("GC=F", "1wk", historyRange),
    metal === "copper" ? Promise.resolve(null) : getMarketSeries("SI=F", "1wk", historyRange),
    metal === "copper" ? Promise.resolve(null) : getMarketSeries("CL=F", "1wk", historyRange),
    metal === "copper" ? Promise.resolve(null) : getMarketSeries("^GSPC", "1wk", historyRange),
    getRealYieldSeries(),
    metal === "copper" ? getMarketSeries("HG=F") : Promise.resolve(null),
  ]);

  const dollarChange = percentageChange(dollar?.points ?? null);
  const realYieldChange = periodChange(realYields?.points ?? null);
  const dollarImpact = impactFromChange(dollarChange, -1, 0.75);
  const realYieldImpact = impactFromChange(realYieldChange, -1, 0.1);
  const quoteInputs = {
    gold: quoteDependency("gold", "Yahoo Finance · GC=F", gold, 10),
    silver: quoteDependency("silver", "Yahoo Finance · SI=F", silver, 10),
    oil: quoteDependency("oil", "Yahoo Finance · CL=F", oil, 10),
    sp500: quoteDependency("sp500", "Yahoo Finance · ^GSPC", sp500, 10),
    copper: quoteDependency("copper", "Yahoo Finance · HG=F", copper, 10),
  };
  const ratioInputs: Record<string, DerivedDependency[]> = {
    "gold-sp": [quoteInputs.gold, quoteInputs.sp500],
    "gold-oil": [quoteInputs.gold, quoteInputs.oil],
    "gold-silver": [quoteInputs.gold, quoteInputs.silver],
    "copper-gold": [quoteInputs.copper, quoteInputs.gold],
  };

  if (metal === "copper") {
    const copperChange = percentageChange(copper?.points ?? null);
    const copperHistory = alignRatio(copper, gold);
    const copperGoldAverage = mean(copperHistory);
    const copperGoldCurrent = copper && gold && gold.current > 0 ? copper.current / gold.current : null;
    const copperImpact = impactFromChange(copperChange, 1, 1);
    const relativeImpact = ratioImpact(copperGoldCurrent, copperGoldAverage, true);
    const chartLabel = t.lastYear;

    return {
      cards: [
        makeCard(locale, metal, "copper-price", t.names.copperPrice, copper ? `$${number(copper.current, locale)}/lb` : "—", trend(copperChange, 1), copperImpact, t.explanations.copperPrice[copperImpact], { group: "context", chart: { points: lastYearPoints(copper?.points ?? []), unit: " USD/lb", digits: 3, label: chartLabel, zeroBaseline: false } }),
        makeCard(locale, metal, "live-real-rates", t.names.realRates, realYields ? `${number(realYields.current, locale)}%` : "—", trend(realYieldChange, 0.1), realYieldImpact, t.explanations.copperRates[realYieldImpact], { group: "context", chart: { points: lastYearPoints(realYields?.points ?? []), unit: "%", digits: 2, axisDigits: 1, label: chartLabel, zeroBaseline: false } }),
        makeCard(locale, metal, "live-dxy", t.names.dxy, dollar ? number(dollar.current, locale) : "—", trend(dollarChange, 0.75), dollarImpact, t.explanations.copperDxy[dollarImpact], { group: "context", chart: { points: lastYearPoints(dollar?.points ?? []), unit: "", digits: 0, label: chartLabel, zeroBaseline: false } }),
        makeCard(locale, metal, "copper-gold", t.names.copperGold, copperGoldCurrent === null ? "—" : number(copperGoldCurrent, locale, 5), trend(percentageChange(copperHistory), 1), relativeImpact, t.explanations.copperGold[relativeImpact], {
          group: "context",
          comparison: { label: t.fiveYearAverage, value: copperGoldAverage === null ? "—" : number(copperGoldAverage, locale, 5) },
          chart: { points: lastYearPoints(copperHistory), unit: "", digits: 5, label: chartLabel, zeroBaseline: false },
        }),
      ].map((card) => ratioInputs[card.id] ? protectDerivedCard(card, ratioInputs[card.id], locale) : card),
      source: t.copperSource,
    };
  }

  const goldSpHistory = alignRatio(gold, sp500);
  const goldOilHistory = alignRatio(gold, oil);
  const goldSilverHistory = alignRatio(gold, silver);
  const goldSpAverage = mean(goldSpHistory);
  const goldOilAverage = mean(goldOilHistory);
  const goldSilverAverage = mean(goldSilverHistory);
  const goldSpCurrent = gold && sp500 ? gold.current / sp500.current : null;
  const goldOilCurrent = gold && oil ? gold.current / oil.current : null;
  const goldSilverCurrent = gold && silver ? gold.current / silver.current : null;
  const stressInputs: DerivedDependency[] = [
    { id: "gold", source: "Yahoo Finance · GC=F", points: gold?.points ?? [], maxAgeDays: 10 },
    { id: "dxy", source: "Yahoo Finance · DX-Y.NYB", points: dollar?.points ?? [], maxAgeDays: 10 },
    { id: "real-rates", source: "FRED / U.S. Treasury · DFII10", points: realYields?.points ?? [], maxAgeDays: 5 },
  ];
  const stressState = currentStressIndex(stressInputs);
  const score = stressState.score;
  const previousStress = stressState.asOf === null ? null : stressIndexAt(stressInputs, stressState.asOf - 90 * 86400);
  const scoreTrend = score === null || previousStress === null ? "unavailable" : trend(score - previousStress, 4);
  const goldChart = lastYearPoints(gold?.points ?? []);
  const dollarChart = lastYearPoints(dollar?.points ?? []);
  const realRateChart = lastYearPoints(realYields?.points ?? []);
  const goldSpChart = metal === "gold" ? lastTenYearPoints(goldSpHistory) : lastYearPoints(goldSpHistory);
  const goldOilChart = metal === "gold" ? lastTenYearPoints(goldOilHistory) : lastYearPoints(goldOilHistory);
  const goldSilverChart = metal === "gold" ? lastTenYearPoints(goldSilverHistory) : lastYearPoints(goldSilverHistory);
  const stressChart: IndicatorChartPoint[] = goldChart.filter((point) => point.time <= stressState.health.checkedAt).flatMap(({ time }) => {
    const value = stressIndexAt(stressInputs, time);
    return value === null ? [] : [{ time, value }];
  });
  const severity = score === null
    ? t.unavailable
    : score <= 25
      ? t.severity.low
      : score <= 50
        ? t.severity.moderate
        : score <= 75
          ? t.severity.elevated
          : t.severity.high;
  const stressImpact: Impact = score === null ? "unavailable" : score >= 65 ? "bullish" : score <= 35 ? "bearish" : "neutral";
  const direction = metal === "gold" ? "gold" : "silver";
  const marketTrend = dollarChange === null ? "unavailable" : trend(dollarChange, 0.75);
  const realTrend = trend(realYieldChange, 0.1);
  const chartLabel = t.lastYear;
  const dxyCard = makeCard(locale, direction, "dxy", t.names.dxy, dollar ? number(dollar.current, locale) : "—", marketTrend, dollarImpact, t.explanations.dxy[dollarImpact], { chart: { points: dollarChart, unit: "", digits: 0, label: chartLabel, zeroBaseline: false } });
  const realRateCard = makeCard(locale, direction, "real-rates", t.names.realRates, realYields ? `${number(realYields.current, locale)}%` : "—", realTrend, realYieldImpact, t.explanations.realRates[realYieldImpact], { chart: { points: realRateChart, unit: "%", digits: 2, axisDigits: 1, label: chartLabel, zeroBaseline: false } });
  const stressCard = makeCard(
    locale,
    direction,
    "stress-index",
    t.names.stress,
    score === null ? "—" : `${score}/100`,
    scoreTrend,
    stressImpact,
    score === null ? t.derivedUnavailable : t.explanations.stress,
    { score: score ?? undefined, severity, dataHealth: stressState.health, chart: { points: lastYearPoints(stressChart), unit: "", digits: 0, label: chartLabel, zeroBaseline: true } },
  );

  if (metal === "silver") {
    const silverImpact = ratioImpact(goldSilverCurrent, goldSilverAverage, true);
    const ratioYear = yearComparison(goldSilverHistory);
    return {
      cards: [
        makeCard(locale, direction, "gold-silver", t.names.goldSilver, goldSilverCurrent === null ? "—" : number(goldSilverCurrent, locale), trend(percentageChange(goldSilverHistory), 1), silverImpact, t.explanations.goldSilver["silver"][silverImpact], {
          group: "context",
          previousValue: ratioYear ? number(ratioYear.previous, locale) : "—",
          yoyChange: ratioYear ? `${ratioYear.change > 0 ? "+" : ""}${number(ratioYear.change, locale, 1)}%` : "—",
          comparison: { label: t.historicalAverage, value: goldSilverAverage === null ? "—" : number(goldSilverAverage, locale) },
          chart: { points: goldSilverChart, unit: "", digits: 0, label: chartLabel, zeroBaseline: false },
        }),
        { ...realRateCard, id: "live-real-rates", group: "context" as const },
        { ...dxyCard, id: "live-dxy", group: "context" as const },
        { ...stressCard, group: "context" as const },
      ].map((card) => ratioInputs[card.id] ? protectDerivedCard(card, ratioInputs[card.id], locale) : card),
      source: t.source,
    };
  }

  const goldSpImpact = ratioImpact(goldSpCurrent, goldSpAverage, true);
  const goldOilImpact = ratioImpact(goldOilCurrent, goldOilAverage, true);
  const goldSilverImpact = ratioImpact(goldSilverCurrent, goldSilverAverage, true);
  const seasonalReturns = [1.1, 0.8, -0.4, 0.5, 0.1, -0.6, 1.0, 1.8, 1.4, 0.3, 1.9, 1.2];
  const currentMonth = new Date().getUTCMonth();
  const seasonalityImpact = (value: number): Exclude<Impact, "unavailable"> =>
    value >= 0.5 ? "bullish" : value >= 0 ? "neutral" : "bearish";
  const currentSeasonality = seasonalReturns[currentMonth];
  const currentSeasonalityImpact = seasonalityImpact(currentSeasonality);
  const monthFormatter = new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", { month: "short", timeZone: "UTC" });
  const seasonalityMonths = seasonalReturns.map((_, month) =>
    monthFormatter.format(new Date(Date.UTC(2020, month, 1))),
  );
  const goldSpYear = yearComparison(goldSpHistory);
  const goldOilYear = yearComparison(goldOilHistory);
  const goldSilverYear = yearComparison(goldSilverHistory);
  const seasonalPrevious = t.notApplicable;
  const seasonalChange = t.notApplicable;

  return {
    cards: [
      makeCard(locale, direction, "gold-sp", t.names.goldSp, goldSpCurrent === null ? "—" : number(goldSpCurrent, locale, 3), trend(goldSpYear?.change ?? null, 1), goldSpImpact, t.explanations.goldSp[goldSpImpact], {
        group: "context",
        previousValue: goldSpYear ? number(goldSpYear.previous, locale, 3) : "—",
        yoyChange: goldSpYear ? `${goldSpYear.change > 0 ? "+" : ""}${number(goldSpYear.change, locale, 1)}%` : "—",
        comparison: { label: t.fiveYearAverage, value: goldSpAverage === null ? "—" : number(goldSpAverage, locale, 3) },
        chart: { points: goldSpChart, unit: "", digits: 3, label: chartLabel, zeroBaseline: false },
      }),
      makeCard(locale, direction, "gold-oil", t.names.goldOil, goldOilCurrent === null ? "—" : number(goldOilCurrent, locale, 2), trend(goldOilYear?.change ?? null, 1), goldOilImpact, t.explanations.goldOil[goldOilImpact], {
        group: "context",
        previousValue: goldOilYear ? number(goldOilYear.previous, locale, 2) : "—",
        yoyChange: goldOilYear ? `${goldOilYear.change > 0 ? "+" : ""}${number(goldOilYear.change, locale, 1)}%` : "—",
        comparison: { label: t.fiveYearAverage, value: goldOilAverage === null ? "—" : number(goldOilAverage, locale, 2) },
        chart: { points: goldOilChart, unit: "", digits: 0, label: chartLabel, zeroBaseline: false },
      }),
      makeCard(locale, direction, "gold-silver", t.names.goldSilver, goldSilverCurrent === null ? "—" : number(goldSilverCurrent, locale, 2), trend(goldSilverYear?.change ?? null, 1), goldSilverImpact, t.explanations.goldSilver["gold"][goldSilverImpact], {
        group: "context",
        previousValue: goldSilverYear ? number(goldSilverYear.previous, locale, 2) : "—",
        yoyChange: goldSilverYear ? `${goldSilverYear.change > 0 ? "+" : ""}${number(goldSilverYear.change, locale, 1)}%` : "—",
        comparison: { label: t.historicalAverage, value: goldSilverAverage === null ? "—" : number(goldSilverAverage, locale, 2) },
        chart: { points: goldSilverChart, unit: "", digits: 0, label: chartLabel, zeroBaseline: false },
      }),
      makeCard(locale, direction, "gold-seasonality", t.names.goldSeasonality, `${seasonalityMonths[currentMonth]} ${currentSeasonality > 0 ? "+" : ""}${number(currentSeasonality, locale, 1)}%`, trend(currentSeasonality - seasonalReturns[(currentMonth + 11) % 12], 0.05), currentSeasonalityImpact, t.explanations.goldSeasonality, {
        group: "context",
        previousValue: seasonalPrevious,
        yoyChange: seasonalChange,
        severity: currentSeasonality < 0 ? t.severity.low : currentSeasonality < 0.5 ? t.seasonalityLevel.neutral : currentSeasonality <= 1 ? t.severity.elevated : t.severity.high,
        chart: {
          points: seasonalityMonths.map((month, index) => ({
            time: Date.UTC(new Date().getUTCFullYear(), index, 1) / 1000,
            value: seasonalReturns[index],
            label: month,
          })),
          unit: "%",
          digits: 1,
          label: t.seasonalityChartDescription,
          zeroBaseline: true,
        },
      }),
    ].map((card) => ratioInputs[card.id] ? protectDerivedCard(card, ratioInputs[card.id], locale) : card),
    source: t.source,
  };
}

async function getOilIndicators(locale: Locale) {
  const t = messages[locale].macro;
  const turkish = locale === "tr";
  const [wti, brent, dollar, gold, inventory] = await Promise.all([
    getMarketSeries("CL=F", "1d"),
    getMarketSeries("BZ=F", "1d"),
    getMarketSeries("DX-Y.NYB", "1d"),
    getMarketSeries("GC=F", "1d"),
    getOilInventory(),
  ]);
  const missing = "—";
  const date = (time?: number) => time ? new Date(time * 1000).toISOString().slice(0, 10) : missing;
  const stale = (time: number | undefined, days: number) => time && Date.now() - time * 1000 > days * 86400000 ? (turkish ? " · Eski veri" : " · Stale") : "";
  const percent = (value: number | null) => value === null ? missing : `${value > 0 ? "+" : ""}${number(value, locale)}%`;
  const wtiChange = percentageChange(wti?.points ?? null);
  const brentChange = percentageChange(brent?.points ?? null);
  const dollarChange = percentageChange(dollar?.points ?? null);
  const priceImpact = impactFromChange(wtiChange, 1, 1);
  const dollarImpact = impactFromChange(dollarChange, -1, 0.75);
  const ratioHistory = alignRatio(gold, wti);
  const chartLabel = t.lastYear;
  const wtiChart = lastYearPoints(wti?.points ?? []);
  const dollarChart = lastYearPoints(dollar?.points ?? []);
  const ratioChart = lastYearPoints(ratioHistory);
  const latestRatio = ratioHistory.at(-1);
  const ratioAverage = mean(ratioHistory);
  const ratioImpactValue = ratioImpact(latestRatio?.value ?? null, ratioAverage, false);
  const inventoryImpact = inventory?.average === null || !inventory ? "unavailable" : impactFromChange(inventory.change - inventory.average, -1, 0.1);
  const explain = (impact: Impact, bullish: string, neutral: string, bearish: string, unavailable: string) => ({ bullish, neutral, bearish, unavailable })[impact];
  const marketSource = (symbol: string, time?: number) => `Yahoo Finance (${symbol}) · ${turkish ? "Gözlem" : "Observed"}: ${date(time)}${stale(time, 5)}`;
  const priceText = explain(priceImpact,
    turkish ? "WTI son 90 günde yükseldi." : "WTI rose over the last 90 days.",
    turkish ? "WTI son 90 günde fazla değişmedi." : "WTI changed little over the last 90 days.",
    turkish ? "WTI son 90 günde düştü." : "WTI fell over the last 90 days.",
    turkish ? "WTI geçmişi alınamadı." : "WTI history is unavailable.");
  const inventoryText = explain(inventoryImpact,
    turkish ? "Stok değişimi mevsimsel ortalamanın altında." : "The inventory change is below its seasonal average.",
    turkish ? "Stok değişimi mevsimsel ortalamaya yakın." : "The inventory change is near its seasonal average.",
    turkish ? "Stok değişimi mevsimsel ortalamanın üzerinde." : "The inventory change is above its seasonal average.",
    turkish ? "EIA verisi veya beş yıllık karşılaştırma mevcut değil." : "EIA data or the five-year comparison is unavailable.");
  const ratioText = explain(ratioImpactValue,
    turkish ? "Petrol, beş yıllık ortalamaya göre altın karşısında güçlü." : "Oil is strong relative to gold versus the five-year average.",
    turkish ? "Oran beş yıllık ortalamaya yakın." : "The ratio is near its five-year average.",
    turkish ? "Petrol, beş yıllık ortalamaya göre altın karşısında zayıf." : "Oil is weak relative to gold versus the five-year average.",
    turkish ? "Eşleşen altın ve petrol verisi alınamadı." : "Matching gold and oil data is unavailable.");
  return {
    cards: [
      makeCard(locale, "oil", "oil-prices", "WTI / Brent (USD/bbl)", `WTI ${wti ? `$${number(wti.current, locale)}` : missing} / Brent ${brent ? `$${number(brent.current, locale)}` : missing}`, trend(wtiChange, 1), priceImpact, priceText, {
        comparison: { label: turkish ? "90 günlük değişim" : "90-day change", value: `WTI ${percent(wtiChange)} / Brent ${percent(brentChange)}` },
        provenance: `${marketSource("CL=F", wti?.currentTime)}; ${marketSource("BZ=F", brent?.currentTime)}`,
        chart: { points: wtiChart, unit: " USD/bbl", digits: 2, label: `WTI · ${chartLabel}`, zeroBaseline: false },
      }),
      makeCard(locale, "oil", "oil-inventory", turkish ? "ABD ham petrol stok değişimi" : "U.S. crude inventory change", inventory ? `${inventory.change > 0 ? "+" : ""}${number(inventory.change, locale)} ${turkish ? "milyon varil" : "million barrels"}` : missing, trend(inventory?.change ?? null, 0.1), inventoryImpact, inventoryText, {
        comparison: { label: turkish ? "5 yıllık mevsimsel ortalama" : "5-year seasonal average", value: inventory?.average == null ? missing : `${number(inventory.average, locale)} ${turkish ? "milyon varil" : "million barrels"}` },
        provenance: `EIA (WCESTUS1) · ${turkish ? "Hafta sonu" : "Week ending"}: ${inventory?.date ?? missing}${stale(inventory ? Date.parse(inventory.date) / 1000 : undefined, 14)}`,
        chart: inventory?.history ? { points: lastYearPoints(inventory.history), unit: turkish ? " mn varil" : " mn bbl", digits: 1, label: chartLabel, zeroBaseline: true } : undefined,
      }),
      makeCard(locale, "oil", "oil-dxy", t.names.dxy, dollar ? number(dollar.current, locale) : missing, trend(dollarChange, 0.75), dollarImpact, explain(dollarImpact,
        turkish ? "Zayıflayan dolar petrol talebini destekleyebilir." : "A weaker dollar can support demand for oil.",
        turkish ? "Doların 90 günlük değişimi sınırlı." : "The dollar's 90-day change is modest.",
        turkish ? "Güçlenen dolar petrol talebini baskılayabilir." : "A stronger dollar can weigh on demand for oil.",
        turkish ? "Dolar verisi alınamadı." : "Dollar data is unavailable."), { provenance: marketSource("DX-Y.NYB", dollar?.currentTime), chart: { points: dollarChart, unit: "", digits: 0, label: chartLabel, zeroBaseline: false } }),
      makeCard(locale, "oil", "oil-curve", turkish ? "WTI vadeli işlem farkı" : "WTI futures spread", missing, "unavailable", "unavailable", turkish ? "Güncel, doğrulanmış iki vadeli kontrat kaynağı mevcut değil. Pozitif fark backwardation, negatif fark contango gösterir." : "A current, verified source for two futures maturities is unavailable. A positive spread indicates backwardation; a negative spread indicates contango.", { provenance: turkish ? "Kaynak: mevcut değil · Gözlem: —" : "Source: unavailable · Observed: —" }),
      makeCard(locale, "oil", "oil-gold-ratio", t.names.goldOil, latestRatio ? number(latestRatio.value, locale) : missing, trend(percentageChange(ratioHistory), 1), ratioImpactValue, ratioText, {
        comparison: { label: t.fiveYearAverage, value: ratioAverage === null ? missing : number(ratioAverage, locale) },
        provenance: `Yahoo Finance (GC=F, CL=F) · ${turkish ? "Eşleşen kapanış" : "Matched close"}: ${date(latestRatio?.time)}${stale(latestRatio?.time, 5)}`,
        chart: { points: ratioChart, unit: "", digits: 1, label: chartLabel, zeroBaseline: false },
      }),
    ].map((card) => card.id === "oil-gold-ratio" ? protectDerivedCard(card, [
      quoteDependency("gold", "Yahoo Finance · GC=F", gold, 5),
      quoteDependency("wti", "Yahoo Finance · CL=F", wti, 5),
    ], locale) : card),
    source: turkish ? "Vadeli işlem fiyatları gecikmeli olabilir; spot fiyat değildir." : "Futures quotes may be delayed and are not spot prices.",
  };
}

export async function getCommodityHeaderData(config: CommodityConfiguration): Promise<CommodityHeaderData> {
  const spec = config.market;
  const series = await getMarketSeries(spec.symbol, "1d", "1y");
  if (!series) return { price: null, dailyChange: null, oneYearReturn: null, high52Week: null, low52Week: null, observedAt: null, unit: spec.unit, points: [] };

  const last = series.points.at(-1);
  const previous = series.points.at(-2);
  const first = series.points[0];
  const dailyChange = previous && previous.value !== 0 ? ((series.current - previous.value) / previous.value) * 100 : null;
  const oneYearReturn = first && first.value !== 0 ? ((series.current - first.value) / first.value) * 100 : null;
  const high52Week = series.highs?.length ? Math.max(...series.highs.map((point) => point.value)) : last?.value ?? null;
  const low52Week = series.lows?.length ? Math.min(...series.lows.map((point) => point.value)) : last?.value ?? null;

  return {
    price: series.current,
    dailyChange,
    oneYearReturn,
    high52Week,
    low52Week,
    observedAt: series.currentTime ?? last?.time ?? null,
    unit: spec.unit,
    points: series.points,
  };
}