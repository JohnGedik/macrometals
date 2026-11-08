import { messages, type Locale } from "@/lib/i18n";

type Point = { time: number; value: number };
type Series = { current: number; points: Point[] };
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
  comparison?: { label: string; value: string };
  score?: number;
  severity?: string;
};

type MarketResponse = {
  chart?: {
    result?: Array<{
      meta?: { regularMarketPrice?: number };
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
  };
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

async function getMarketSeries(symbol: string): Promise<Series | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1wk`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as MarketResponse;
    const result = payload.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    const points = timestamps.flatMap((time, index) => {
      const value = closes[index];
      return finite(value) ? [{ time, value }] : [];
    });
    const current = finite(result?.meta?.regularMarketPrice)
      ? result.meta.regularMarketPrice
      : points.at(-1)?.value;

    return finite(current) && points.length ? { current, points } : null;
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizedScore(change: number | null, scale: number) {
  return change === null ? null : clamp(50 + (change / scale) * 50, 0, 100);
}

function stressScore(goldChange: number | null, realYieldChange: number | null, dollarChange: number | null) {
  if (goldChange === null || realYieldChange === null || dollarChange === null) return null;
  const score =
    normalizedScore(goldChange, 12)! * 0.4 +
    normalizedScore(-realYieldChange, 0.75)! * 0.35 +
    normalizedScore(-dollarChange, 5)! * 0.25;
  return Math.round(score);
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

function makeCard(
  locale: Locale,
  subject: "gold" | "silver",
  id: string,
  name: string,
  value: string,
  direction: Trend,
  impact: Impact,
  explanation: string,
  extra?: Pick<IndicatorCardData, "comparison" | "score" | "severity">,
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
    subject: subject === "gold" ? t.onGold : t.onSilver,
    explanation,
    ...extra,
  };
}

export async function getMacroIndicators(metal: "gold" | "silver", locale: Locale) {
  const t = messages[locale].macro;
  const [dollar, gold, silver, oil, sp500, realYields] = await Promise.all([
    getMarketSeries("DX-Y.NYB"),
    getMarketSeries("GC=F"),
    getMarketSeries("SI=F"),
    getMarketSeries("CL=F"),
    getMarketSeries("^GSPC"),
    getRealYieldSeries(),
  ]);

  const goldMomentum = percentageChange(gold?.points ?? null);
  const dollarChange = percentageChange(dollar?.points ?? null);
  const realYieldChange = periodChange(realYields?.points ?? null);
  const dollarImpact = impactFromChange(dollarChange, -1, 0.75);
  const realYieldImpact = impactFromChange(realYieldChange, -1, 0.1);
  const goldSpHistory = alignRatio(gold, sp500);
  const goldOilHistory = alignRatio(gold, oil);
  const goldSilverHistory = alignRatio(gold, silver);
  const goldSpAverage = mean(goldSpHistory);
  const goldOilAverage = mean(goldOilHistory);
  const goldSilverAverage = mean(goldSilverHistory);
  const goldSpCurrent = gold && sp500 ? gold.current / sp500.current : null;
  const goldOilCurrent = gold && oil ? gold.current / oil.current : null;
  const goldSilverCurrent = gold && silver ? gold.current / silver.current : null;
  const score = stressScore(goldMomentum, realYieldChange, dollarChange);
  const previousTime = Math.min(
    gold?.points.at(-1)?.time ?? Infinity,
    dollar?.points.at(-1)?.time ?? Infinity,
    realYields?.points.at(-1)?.time ?? Infinity,
  ) - 90 * 86400;
  const previousStress = Number.isFinite(previousTime)
    ? stressScore(
        (() => {
          const current = valueAt(gold?.points ?? [], previousTime);
          const previous = valueAt(gold?.points ?? [], previousTime - 90 * 86400);
          return current && previous ? ((current - previous) / previous) * 100 : null;
        })(),
        (() => {
          const current = valueAt(realYields?.points ?? [], previousTime);
          const previous = valueAt(realYields?.points ?? [], previousTime - 90 * 86400);
          return current !== null && previous !== null ? current - previous : null;
        })(),
        (() => {
          const current = valueAt(dollar?.points ?? [], previousTime);
          const previous = valueAt(dollar?.points ?? [], previousTime - 90 * 86400);
          return current && previous ? ((current - previous) / previous) * 100 : null;
        })(),
      )
    : null;
  const scoreTrend = score === null || previousStress === null ? "unavailable" : trend(score - previousStress, 4);
  const severity = score === null
    ? t.unavailable
    : score < 25
      ? t.severity.low
      : score < 50
        ? t.severity.moderate
        : score < 75
          ? t.severity.elevated
          : t.severity.high;
  const stressImpact: Impact = score === null ? "unavailable" : score >= 65 ? "bullish" : score <= 35 ? "bearish" : "neutral";
  const direction = metal === "gold" ? "gold" : "silver";
  const marketTrend = dollarChange === null ? "unavailable" : trend(dollarChange, 0.75);
  const realTrend = trend(realYieldChange, 0.1);
  const dxyCard = makeCard(locale, direction, "dxy", t.names.dxy, dollar ? number(dollar.current, locale) : "—", marketTrend, dollarImpact, t.explanations.dxy[dollarImpact]);
  const realRateCard = makeCard(locale, direction, "real-rates", t.names.realRates, realYields ? `${number(realYields.current, locale)}%` : "—", realTrend, realYieldImpact, t.explanations.realRates[realYieldImpact]);
  const stressCard = makeCard(
    locale,
    direction,
    "stress-index",
    t.names.stress,
    score === null ? "—" : `${score}/100`,
    scoreTrend,
    stressImpact,
    t.explanations.stress,
    { score: score ?? undefined, severity },
  );

  if (metal === "silver") {
    const silverImpact = ratioImpact(goldSilverCurrent, goldSilverAverage, true);
    return {
      cards: [
        realRateCard,
        dxyCard,
        makeCard(locale, direction, "gold-silver", t.names.goldSilver, goldSilverCurrent === null ? "—" : number(goldSilverCurrent, locale), trend(percentageChange(goldSilverHistory), 1), silverImpact, t.explanations.goldSilver["silver"][silverImpact], {
          comparison: { label: t.historicalAverage, value: goldSilverAverage === null ? "—" : number(goldSilverAverage, locale) },
        }),
        stressCard,
      ],
      source: t.source,
    };
  }

  const goldSpImpact = ratioImpact(goldSpCurrent, goldSpAverage, true);
  const goldOilImpact = ratioImpact(goldOilCurrent, goldOilAverage, true);
  const goldSilverImpact = ratioImpact(goldSilverCurrent, goldSilverAverage, true);

  return {
    cards: [
      realRateCard,
      dxyCard,
      makeCard(locale, direction, "gold-sp", t.names.goldSp, goldSpCurrent === null ? "—" : number(goldSpCurrent, locale, 3), trend(percentageChange(goldSpHistory), 1), goldSpImpact, t.explanations.goldSp[goldSpImpact], {
        comparison: { label: t.fiveYearAverage, value: goldSpAverage === null ? "—" : number(goldSpAverage, locale, 3) },
      }),
      makeCard(locale, direction, "gold-oil", t.names.goldOil, goldOilCurrent === null ? "—" : number(goldOilCurrent, locale, 2), trend(percentageChange(goldOilHistory), 1), goldOilImpact, t.explanations.goldOil[goldOilImpact], {
        comparison: { label: t.fiveYearAverage, value: goldOilAverage === null ? "—" : number(goldOilAverage, locale, 2) },
      }),
      makeCard(locale, direction, "gold-silver", t.names.goldSilver, goldSilverCurrent === null ? "—" : number(goldSilverCurrent, locale, 2), trend(percentageChange(goldSilverHistory), 1), goldSilverImpact, t.explanations.goldSilver["gold"][goldSilverImpact], {
        comparison: { label: t.historicalAverage, value: goldSilverAverage === null ? "—" : number(goldSilverAverage, locale, 2) },
      }),
      stressCard,
    ],
    source: t.source,
  };
}