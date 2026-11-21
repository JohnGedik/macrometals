import "server-only";
import * as XLSX from "@e965/xlsx";
import { messages, type Locale } from "@/lib/i18n";
import { currentGoldSeasonality, goldSeasonalityProfile } from "@/lib/gold-macro-data";
import { getOilInventory } from "@/lib/oil-inventory";
import { getCommodityConfiguration } from "@/lib/commodity-config";
import { scoreCommodity, type CommodityConfiguration, type IndicatorDataHealth, type Observation } from "@/lib/commodity-score";
import { fredApiResponseToCsv, fredSeriesDefinitions, parseFredObservations } from "@/lib/observation-data";
import { createSourceSnapshot } from "@/lib/source-snapshots";
import { archiveSourceSnapshot } from "@/lib/snapshot-archive";
import { getH6ReleaseEvidence } from "@/lib/release-evidence";
import { fredArchivePermitted, getSourceRights, type SourceRightsDisclosure } from "@/lib/source-rights";
import { hydrateCommodityObservations } from "@/lib/commodity-data";
import { wgcCentralBankCountryObservations, wgcObservationFeeds } from "@/lib/wgc-gold-observations";
import { silverIndustrialFeed, silverSolarFeed, silverMineFeed, silverEtpFeed } from "@/lib/silver-industrial-observations";
import { cftcGoldCotApiUrl, cftcCotDefinitions, parseCftcManagedMoney } from "@/lib/cftc-cot";
import { gprDownloadUrl, gprSeriesId, parseRecentGprRows } from "@/lib/gpr";
import { currentStressIndex, derivedDataHealth, stressIndexAt, type DerivedDependency } from "@/lib/derived-data";
import { getEiaOilFeeds } from "@/lib/eia-oil";
import { getCopperFeeds } from "@/lib/copper-data";

export type { CommodityKey } from "@/lib/commodity-config";

type Point = Observation;
export type IndicatorChartPoint = Point & { label?: string };
type Series = { current: number; points: Point[]; currentTime?: number; exchangeTimezoneName?: string; hasLiveQuote?: boolean; highs?: Point[]; lows?: Point[] } & Pick<IndicatorDataHealth, "archive" | "release">;
let gprSeriesCache: { expiresAt: number; series: Series } | null = null;
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
  chart?: {
    points: IndicatorChartPoint[];
    unit: string;
    digits: number;
    axisDigits?: number;
    label: string;
    zeroBaseline: boolean;
    series?: { label: string; points: IndicatorChartPoint[] }[];
  };
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
  rights: SourceRightsDisclosure[];
};

type MarketResponse = {
  chart?: {
    result?: Array<{
      meta?: { regularMarketPrice?: number; regularMarketTime?: number; exchangeTimezoneName?: string };
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null>; high?: Array<number | null>; low?: Array<number | null> }> };
    }>;
  };
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function marketSessionDate(time: number | undefined, timeZone: string | undefined) {
  if (!finite(time) || !timeZone) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date(time * 1000));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch { return null; }
}

function previousCloseForQuote(series: Series) {
  const latest = series.points.at(-1);
  const previous = series.points.at(-2);
  if (!latest) return null;
  if (!series.hasLiveQuote) return previous?.value ?? null;
  const quoteSession = marketSessionDate(series.currentTime, series.exchangeTimezoneName);
  const latestSession = marketSessionDate(latest.time, series.exchangeTimezoneName);
  if (!quoteSession || !latestSession) return null;
  if (quoteSession === latestSession) return previous?.value ?? null;
  if (quoteSession > latestSession) return latest.value;
  return null;
}

async function getMarketSeries(symbol: string, interval = "1wk", range = "5y", reportErrors = false): Promise<Series | null> {
  if (!getSourceRights("yahoo").allowed) return null;
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) {
      if (reportErrors) console.error("Market comparison request failed", { symbol, status: response.status });
      return null;
    }

    const payload = (await response.json()) as MarketResponse;
    const result = payload.chart?.result?.[0];
    const meta = result?.meta;
    const timestamps = result?.timestamp ?? [];
    const quote = result?.indicators?.quote?.[0];
    const closes = quote?.close ?? [];
    const points = timestamps.flatMap((time, index) => {
      const value = closes[index];
      return finite(value) ? [{ time, value }] : [];
    });
    const highs = timestamps.flatMap((time, index) => finite(quote?.high?.[index]) ? [{ time, value: quote!.high![index]! }] : []);
    const lows = timestamps.flatMap((time, index) => finite(quote?.low?.[index]) ? [{ time, value: quote!.low![index]! }] : []);
    const livePrice = meta?.regularMarketPrice;
    const hasLiveQuote = finite(livePrice);
    const current = hasLiveQuote
      ? livePrice
      : points.at(-1)?.value;

    if ((!finite(current) || !points.length) && reportErrors) {
      console.error("Market comparison response has no usable data", { symbol });
    }
    return finite(current) && points.length ? { current, points,
      currentTime: finite(meta?.regularMarketTime) ? meta.regularMarketTime : undefined,
      exchangeTimezoneName: meta?.exchangeTimezoneName, hasLiveQuote, highs, lows } : null;
  } catch (error) {
    if (reportErrors) {
      console.error("Market comparison request failed", { symbol, error: error instanceof Error ? error.name : "Unknown error" });
    }
    return null;
  }
}
  function quoteSessionsMatch(left: Series | null, right: Series | null) {
    if (!left || !right) return false;
    const leftTime = left.currentTime ?? left.points.at(-1)?.time;
    const rightTime = right.currentTime ?? right.points.at(-1)?.time;
    const leftSession = marketSessionDate(leftTime, left.exchangeTimezoneName);
    const rightSession = marketSessionDate(rightTime, right.exchangeTimezoneName);
    return leftSession !== null && leftSession === rightSession;
  }

  function currentRatio(numerator: Series | null, denominator: Series | null) {
    if (!numerator || !denominator || denominator.current <= 0 || !quoteSessionsMatch(numerator, denominator)) return null;
    return numerator.current / denominator.current;
  }

  function quoteSessionDependency(left: Series | null, right: Series | null): DerivedDependency {
    const leftTime = left?.currentTime ?? left?.points.at(-1)?.time;
    const rightTime = right?.currentTime ?? right?.points.at(-1)?.time;
    const time = finite(leftTime) && finite(rightTime) ? Math.min(leftTime, rightTime) : undefined;
    return { id: "matched-quote-session", source: "Matched exchange sessions",
      points: time !== undefined && quoteSessionsMatch(left, right) ? [{ time, value: 1 }] : [], maxAgeDays: 10 };
  }

  export async function getMarketComparisonSeries(symbol: string): Promise<Series | null> {
    return getMarketSeries(symbol, "1d", "10y", true);
  }

async function getFredSeries(seriesId: keyof typeof fredSeriesDefinitions): Promise<Series | null> {
  if (!getSourceRights("fred", seriesId).allowed) return null;
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    console.error("FRED_API_KEY is not configured");
    return null;
  }
  try {
    const url = new URL("https://api.stlouisfed.org/fred/series/observations");
    url.search = new URLSearchParams({ series_id: seriesId, api_key: apiKey, file_type: "json" }).toString();
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) {
      console.error("FRED API request failed", { seriesId, status: response.status });
      return null;
    }

    const rawCsv = fredApiResponseToCsv(await response.json(), seriesId);
    if (!rawCsv) {
      console.error("FRED API response was invalid", { seriesId });
      return null;
    }
    const capturedAt = Date.now() / 1000;
    const points = parseFredObservations(rawCsv, fredSeriesDefinitions[seriesId], capturedAt);
    if (!points.length) {
      console.error("FRED API response contained no usable observations", { seriesId });
      return null;
    }
    const [archive, release] = await Promise.all([
      process.env.SOURCE_ARCHIVE_ENABLED === "true" && fredArchivePermitted(seriesId)
        ? archiveSourceSnapshot(createSourceSnapshot(rawCsv, fredSeriesDefinitions[seriesId], capturedAt))
        : Promise.resolve({ status: "disabled" as const }),
      seriesId === "M2SL" ? getH6ReleaseEvidence(points.at(-1)!) : Promise.resolve(undefined),
    ]);
    return { current: points.at(-1)!.value, currentTime: points.at(-1)!.time, points, archive, release };
  } catch {
    console.error("FRED API request failed", { seriesId });
    return null;
  }
}

async function getCftcCotSeries(commodity: keyof typeof cftcCotDefinitions): Promise<Series | null> {
  const definition = cftcCotDefinitions[commodity];
  if (!getSourceRights("cftc", definition.seriesId).allowed) return null;
  const url = new URL(cftcGoldCotApiUrl);
  url.search = new URLSearchParams({
    "$select": "report_date_as_yyyy_mm_dd,cftc_contract_market_code,m_money_positions_long_all,m_money_positions_short_all",
    "$where": `cftc_contract_market_code='${definition.contractCode}'`,
    "$order": "report_date_as_yyyy_mm_dd DESC",
    "$limit": "650",
  }).toString();
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) {
      console.error("CFTC COT request failed", { commodity, status: response.status });
      return null;
    }
    const points = parseCftcManagedMoney(await response.json(), definition);
    const latest = points.at(-1);
    if (!latest) {
      console.error("CFTC COT response was invalid or empty", { commodity });
      return null;
    }
    return { current: latest.value, currentTime: latest.time, points };
  } catch (error) {
    console.error("CFTC COT request failed", { commodity, error: error instanceof Error ? error.message : "Unknown error" });
    return null;
  }
}

async function getGprSeries(): Promise<Series | null> {
  if (!getSourceRights("gpr", gprSeriesId).allowed) return null;
  if (gprSeriesCache && gprSeriesCache.expiresAt > Date.now()) return gprSeriesCache.series;
  try {
    const response = await fetch(gprDownloadUrl, {
      headers: { Accept: "application/vnd.ms-excel" },
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      console.error("GPR workbook request failed", { status: response.status });
      return null;
    }
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > 8_000_000) {
      console.error("GPR workbook exceeds the size limit", { contentLength });
      return null;
    }
    const workbookBytes = new Uint8Array(await response.arrayBuffer());
    if (workbookBytes.length === 0 || workbookBytes.length > 8_000_000) {
      console.error("GPR workbook is empty or exceeds the size limit", { byteLength: workbookBytes.length });
      return null;
    }
    const workbook = XLSX.read(workbookBytes, { type: "array", raw: true });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!worksheet) {
      console.error("GPR workbook did not contain a worksheet");
      return null;
    }
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: true, defval: null });
    const points = parseRecentGprRows(rows);
    const latest = points.at(-1);
    if (!latest) {
      console.error("GPR workbook did not contain valid Recent GPR observations");
      return null;
    }
    const series = { current: latest.value, currentTime: latest.time, points };
    gprSeriesCache = { expiresAt: Date.now() + 60 * 60 * 1000, series };
    return series;
  } catch (error) {
    console.error("GPR workbook request failed", error instanceof Error ? error.message : "Unknown error");
    return null;
  }
}

async function getRealYieldSeries(): Promise<Series | null> {
  return getFredSeries("DFII10");
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
  return previous === null ? null : latest.value - previous;
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

function lastFiveYearPoints(points: Point[], endTime = points.at(-1)?.time ?? 0): Point[] {
  return points.filter((point) => point.time >= endTime - 5 * 365.25 * 86400 && point.time <= endTime);
}

function lastTenYearPoints(points: Point[], endTime = points.at(-1)?.time ?? 0): IndicatorChartPoint[] {
  return points.filter((point) => point.time >= endTime - 3652 * 86400 && point.time <= endTime);
}

function yearComparison(points: Point[]) {
  const latest = points.at(-1);
  if (!latest) return null;
  const targetTime = latest.time - 365 * 86400;
  const previous = points.findLast((point) => point.time <= targetTime);
  if (!previous || targetTime - previous.time > 10 * 86400 || previous.value === 0) return null;
  return { previous: previous.value, change: ((latest.value - previous.value) / Math.abs(previous.value)) * 100 };
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

function hideUnverifiedSampleCard(card: IndicatorCardData, locale: Locale): IndicatorCardData {
  if (card.dataHealth?.kind !== "sample" || !card.dataHealth.rights?.some((rights) => rights.status === "provenance-unverified")) return card;
  const t = messages[locale].macro;
  return { ...card, value: "—", trend: "unavailable", trendLabel: trendLabel("unavailable", locale),
    impact: "unavailable", impactLabel: impactLabel("unavailable", locale), explanation: t.sampleRightsPending,
    previousValue: undefined, yoyChange: undefined, ninetyDayChange: undefined, comparison: undefined,
    score: undefined, severity: undefined, chart: card.chart ? { ...card.chart, points: [] } : undefined };
}

function macroScoreCards(locale: Locale, config: CommodityConfiguration) {
  const t = messages[locale].macro;
  const result = scoreCommodity(config);
  const cards = config.indicators.map((metric, index) => {
    const { current, previous, change: yoy, status: impact } = result.indicators[index];
    const unitLabel = metric.unit[locale];
    const levelInput = metric.scoreMode === "level";
    const currentMonth = new Date().getUTCMonth();
    const currentYear = new Date().getUTCFullYear();
    const monthFormatter = new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", { month: "short", timeZone: "UTC" });
    const value = (amount: number | null) => amount === null ? "—" : levelInput
      ? `${monthFormatter.format(new Date(Date.UTC(currentYear, currentMonth, 1)))} ${amount > 0 ? "+" : ""}${number(amount, locale, metric.digits)}${unitLabel}`
      : `${metric.prefix}${number(amount, locale, metric.digits)}${unitLabel}`;
    const formatChange = (change: number | null) => change === null ? "—" : `${change > 0 ? "+" : ""}${number(change, locale, metric.changeKind === "points" ? 2 : 1)}${metric.changeKind === "points" ? (locale === "tr" ? " yüzde puan" : " pp") : metric.changeKind === "index-points" ? (locale === "tr" ? " endeks puanı" : " index points") : "%"}`;
    const latest = metric.observations?.at(-1);
    const target = latest ? latest.time - 90 * 86400 : 0;
    const prior90 = metric.observations?.findLast((point) => point.time <= target);
    const valid90 = metric.dataHealth?.status === "fresh" && latest && prior90 && target - prior90.time <= 7 * 86400;
    const change90 = valid90 ? metric.changeKind === "percentage" ? prior90.value === 0 ? null : (latest.value - prior90.value) / Math.abs(prior90.value) * 100 : latest.value - prior90.value : null;
    const points = levelInput ? goldSeasonalityProfile.map((seasonalReturn, month) => ({
      time: Date.UTC(currentYear, month, 1) / 1000,
      value: seasonalReturn,
      label: monthFormatter.format(new Date(Date.UTC(2020, month, 1))),
    })) : metric.observations ? lastTenYearPoints([...metric.observations]).map(({ time, value }) => ({ time, value })) : config.years
      .filter((year) => year >= config.chartStartYear)
      .map((year) => {
        const index = config.years.findIndex((value) => value === year);
        return { time: Date.UTC(year, 6, 1) / 1000, value: metric.values?.[index] ?? NaN, label: String(year) };
      }).filter((point) => finite(point.value));
    const explanation = metric.explanation[locale];
    const exclusion = result.indicators[index].exclusionReason;
    const interpretation = exclusion === "sample" ? t.sampleReferenceInterpretation : exclusion === "unapproved" ? t.unapprovedReferenceInterpretation
      : typeof explanation === "string" ? explanation : explanation[impact];
    return { ...makeCard(locale, config.commodity, metric.id, metric.name[locale], value(current), trend(levelInput ? current : yoy, config.scoreRules.factors[metric.id].trendThreshold), impact, interpretation, {
        previousValue: levelInput ? undefined : value(previous),
        yoyChange: levelInput ? undefined : formatChange(yoy),
        group: metric.tier === 1 ? "tier1" : "tier2",
        severity: levelInput && current !== null ? current < 0 ? t.severity.low : current < 0.5 ? t.seasonalityLevel.neutral : current <= 1 ? t.severity.elevated : t.severity.high : undefined,
        chart: { points, unit: unitLabel, digits: metric.digits, label: levelInput ? t.seasonalityChartDescription : metric.dataHealth?.kind === "sourced" ? t.sourcedHistory : t.lastTenYears, zeroBaseline: levelInput },
        ...(metric.id === "central-bank-purchases" ? {
          chart: {
            points,
            unit: unitLabel,
            digits: metric.digits,
            label: metric.dataHealth?.kind === "sourced" ? t.sourcedHistory : t.lastTenYears,
            zeroBaseline: true,
            series: Object.entries(wgcCentralBankCountryObservations).map(([label, observations]) => ({
              label,
              points: lastTenYearPoints(observations).map(({ time, value }) => ({ time, value })),
            })).filter((series) => series.points.length),
          },
        } : {}),
      }), factorScore: result.indicators[index].score, scoreExclusion: result.indicators[index].exclusionReason, dataHealth: metric.dataHealth,
      ninetyDayChange: metric.dataHealth?.kind === "sourced" && metric.dataHealth.frequency === "daily" ? formatChange(change90) : undefined };
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

export function loadCommodityIndicators(config: CommodityConfiguration, locale: Locale) {
  const requestedSources = new Set(Object.values(config.scoreSources ?? {}));
  let realYields: Promise<Series | null> | undefined;
  const loadRealYields = () => realYields ??= getRealYieldSeries();
  const present = (card: IndicatorCardData) => {
    const research = config.scoringPolicy?.mode === "research";
    const labeled = { ...card, commodityName: config.name[locale],
      priceCorrelation: research ? config.priceRelationships?.[card.id] : undefined };
    return research ? labeled : hideUnverifiedSampleCard(labeled, locale);
  };
  const model = loadMacroScore(config, locale, requestedSources, loadRealYields).then((result) => ({
    ...result, cards: result.cards.map(present),
  }));
  const context = (async () => {
    if (!config.contextProvider) return { cards: [], source: config.source[locale] };
    const result = await getContextIndicators(config.contextProvider, locale, loadRealYields);
    const contextSources: Record<string, "dxy" | "real-yields"> = { "live-dxy": "dxy", "oil-dxy": "dxy", "live-real-rates": "real-yields" };
    const macroIds = new Set(config.indicators.map(({ id }) => id));
    const cards = result.cards.filter((card) => !requestedSources.has(contextSources[card.id]) && !macroIds.has(card.id));
    return {
      source: result.source,
      cards: cards.map((card) => present({ ...card, group: "context", dataHealth: card.dataHealth ?? contextDataHealth(card, config.commodity) })),
    };
  })();
  return { model, context };
}

export async function getMacroIndicators(config: CommodityConfiguration, locale: Locale) {
  const { model, context } = loadCommodityIndicators(config, locale);
  const [macro, market] = await Promise.all([model, context]);
  return { ...macro, cards: [...macro.cards, ...market.cards], source: market.source };
}

async function loadMacroScore(config: CommodityConfiguration, locale: Locale,
  requestedSources: ReadonlySet<NonNullable<CommodityConfiguration["scoreSources"]>[string]>,
  loadRealYields: typeof getRealYieldSeries) {
  const currentDate = new Date();
  const requestStartedAt = currentDate.getTime() / 1000;
  const monthStart = Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth(), 1) / 1000;
  const activeConfig = config.commodity === "gold" ? {
    ...config,
    indicators: config.indicators.map((indicator) => indicator.id === "gold-seasonality"
      ? {
        ...indicator,
        currentValue: currentGoldSeasonality(currentDate),
        dataHealth: indicator.dataHealth ? { ...indicator.dataHealth, observedAt: monthStart, checkedAt: requestStartedAt } : indicator.dataHealth,
      } : indicator),
  } : config;
  const [dxy, realYields, m2, breakeven, cot, gpr, silverBreakeven, silverCot, wtiCot, oilFeeds, copperFeeds] = await Promise.all([
    requestedSources.has("dxy") ? getFredSeries("DTWEXBGS") : Promise.resolve(null),
    requestedSources.has("real-yields") ? loadRealYields() : Promise.resolve(null),
    requestedSources.has("m2") ? getFredSeries("M2SL") : Promise.resolve(null),
    requestedSources.has("breakeven-5y") ? getFredSeries("T5YIE") : Promise.resolve(null),
    requestedSources.has("cftc-gold-cot") ? getCftcCotSeries("gold") : Promise.resolve(null),
    requestedSources.has("gpr") ? getGprSeries() : Promise.resolve(null),
    requestedSources.has("breakeven-10y") ? getFredSeries("T10YIE") : Promise.resolve(null),
    requestedSources.has("cftc-silver-cot") ? getCftcCotSeries("silver") : Promise.resolve(null),
    requestedSources.has("cftc-wti-cot") ? getCftcCotSeries("oil") : Promise.resolve(null),
    [...requestedSources].some((source) => source.startsWith("eia-oil-")) ? getEiaOilFeeds() : Promise.resolve({}),
    [...requestedSources].some((source) => source.startsWith("copper-") || source === "china-pmi") ? getCopperFeeds() : Promise.resolve({}),
  ]);
  const checkedAt = Date.now() / 1000;
  const hydrationConfig = config.commodity === "gold" ? {
    ...activeConfig,
    indicators: activeConfig.indicators.map((indicator) => indicator.id === "gold-seasonality" && indicator.dataHealth
      ? { ...indicator, dataHealth: { ...indicator.dataHealth, checkedAt } } : indicator),
  } : activeConfig;
  const resolvedConfig = hydrateCommodityObservations(hydrationConfig, {
    ...oilFeeds,
    ...copperFeeds,
    dxy: dxy?.points ?? null,
    "real-yields": realYields?.points ?? null,
    m2: m2?.points ?? null,
    "breakeven-5y": breakeven?.points ?? null,
    "wgc-central-bank": wgcObservationFeeds["wgc-central-bank"],
    "wgc-etf-holdings": wgcObservationFeeds["wgc-etf-holdings"],
    "silver-industrial-demand": silverIndustrialFeed,
    "silver-solar-demand": silverSolarFeed,
    "silver-mine-supply": silverMineFeed,
    "silver-etp-holdings": silverEtpFeed,
    "breakeven-10y": silverBreakeven?.points ?? null,
    "cftc-silver-cot": silverCot?.points ?? null,
    "cftc-gold-cot": cot?.points ?? null,
    "cftc-wti-cot": wtiCot?.points ?? null,
    gpr: gpr?.points ?? null,
  }, checkedAt,
    { "real-yields": realYields ?? {}, m2: m2 ?? {}, "breakeven-5y": breakeven ?? {}, "breakeven-10y": silverBreakeven ?? {} });
  return { ...macroScoreCards(locale, resolvedConfig), config: resolvedConfig };
}

function contextDataHealth(card: IndicatorCardData, commodity: string): IndicatorDataHealth {
  const checkedAt = Date.now() / 1000;
  if (card.id === "oil-curve") return { kind: "sourced", status: "unavailable", source: "unconfigured", frequency: "unknown", observedAt: null, checkedAt };
  const realRates = card.id.includes("real-rates");
  const inventory = card.id === "oil-inventory";
  const frequency = inventory ? "weekly" : realRates || commodity === "oil" ? "daily" : "weekly";
  const maxAgeDays = inventory || realRates ? 14 : frequency === "daily" ? 5 : 10;
  const observedAt = card.chart?.points.at(-1)?.time ?? null;
  const rights = inventory ? getSourceRights("eia") : realRates ? getSourceRights("fred", "DFII10") : commodity === "gold" ? getSourceRights("public-domain") : getSourceRights("yahoo");
  return {
    kind: "sourced", frequency, observedAt, checkedAt, maxAgeDays,
    source: realRates ? "FRED / U.S. Treasury · DFII10" : inventory ? "U.S. Energy Information Administration · WCESTUS1" : card.id === "stress-index" ? "Derived · Yahoo Finance / FRED" : "Yahoo Finance",
    url: realRates ? "https://fred.stlouisfed.org/series/DFII10" : inventory ? "https://www.eia.gov/petroleum/supply/weekly/" : "https://finance.yahoo.com/",
    status: !rights.allowed || observedAt === null ? "unavailable" : checkedAt - observedAt > maxAgeDays * 86400 ? "stale" : "fresh",
    rights: [rights.disclosure],
  };
}

function quoteDependency(id: string, source: string, series: Series | null, maxAgeDays: number): DerivedDependency {
  const time = series?.currentTime ?? series?.points.at(-1)?.time;
  return { id, source, maxAgeDays, points: series && time !== undefined ? [{ time, value: series.current }] : [] };
}

function protectDerivedCard(card: IndicatorCardData, inputs: readonly DerivedDependency[], locale: Locale): IndicatorCardData {
  const baseHealth = card.dataHealth ?? derivedDataHealth([...inputs, {
    id: "matched-history", source: "Aligned historical observations", points: card.chart?.points ?? [],
    maxAgeDays: Math.min(...inputs.map((input) => input.maxAgeDays)),
  }]);
  const rights = [...new Map(inputs.flatMap((input) => input.source.includes("Yahoo Finance") ? [getSourceRights("yahoo").disclosure]
    : input.source.includes("FRED") ? [getSourceRights("fred", "DFII10").disclosure] : []).map((item) => [item.termsUrl, item])).values()];
  const blocked = inputs.some((input) => input.source.includes("Yahoo Finance") && !getSourceRights("yahoo").allowed
    || input.source.includes("FRED") && !getSourceRights("fred", "DFII10").allowed);
  const health = { ...baseHealth, rights, ...(blocked ? { status: "unavailable" as const } : {}) };
  if (health.status === "fresh") return { ...card, dataHealth: health };
  return { ...card, value: "—", trend: "unavailable", trendLabel: trendLabel("unavailable", locale), impact: "unavailable",
    impactLabel: impactLabel("unavailable", locale), explanation: messages[locale].macro.derivedUnavailable,
    previousValue: undefined, yoyChange: undefined, score: undefined, severity: undefined, dataHealth: health };
}

async function getContextIndicators(metal: "gold" | "silver" | "copper" | "oil", locale: Locale, loadRealYields: typeof getRealYieldSeries) {
  const t = messages[locale].macro;
  if (metal === "oil") return getOilIndicators(locale);
  const historyRange = metal === "gold" ? "10y" : "5y";
  const [dollar, gold, silver, oil, sp500, realYields, copper] = await Promise.all([
    getMarketSeries("DX-Y.NYB", "1wk", historyRange),
    getMarketSeries("GC=F", "1wk", historyRange),
    metal === "copper" ? Promise.resolve(null) : getMarketSeries("SI=F", "1wk", historyRange),
    metal === "copper" ? Promise.resolve(null) : getMarketSeries("CL=F", "1wk", historyRange),
    metal === "copper" ? Promise.resolve(null) : getMarketSeries("^GSPC", "1wk", historyRange),
    loadRealYields(),
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
    "gold-sp": [quoteInputs.gold, quoteInputs.sp500, quoteSessionDependency(gold, sp500)],
    "gold-oil": [quoteInputs.gold, quoteInputs.oil, quoteSessionDependency(gold, oil)],
    "gold-silver": [quoteInputs.gold, quoteInputs.silver, quoteSessionDependency(gold, silver)],
    "copper-gold": [quoteInputs.copper, quoteInputs.gold, quoteSessionDependency(copper, gold)],
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
  const goldSpAverage = mean(lastFiveYearPoints(goldSpHistory));
  const goldOilAverage = mean(lastFiveYearPoints(goldOilHistory));
  const goldSilverAverage = mean(goldSilverHistory);
  const goldSpCurrent = currentRatio(gold, sp500);
  const goldOilCurrent = currentRatio(gold, oil);
  const goldSilverCurrent = currentRatio(gold, silver);
  const stressInputs: DerivedDependency[] = [
    { id: "gold", source: "Yahoo Finance · GC=F", points: gold?.points ?? [], maxAgeDays: 10 },
    { id: "dxy", source: "Yahoo Finance · DX-Y.NYB", points: dollar?.points ?? [], maxAgeDays: 10 },
    { id: "real-rates", source: "FRED / U.S. Treasury · DFII10", points: realYields?.points ?? [], maxAgeDays: 14 },
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
  const ratioChartLabel = metal === "gold" ? t.lastTenYearsWeekly : t.lastYear;
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
    { score: score ?? undefined, severity, dataHealth: { ...stressState.health, rights: [getSourceRights("yahoo").disclosure, getSourceRights("fred", "DFII10").disclosure] }, chart: { points: lastYearPoints(stressChart), unit: "", digits: 0, label: chartLabel, zeroBaseline: true } },
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
  const goldSpYear = yearComparison(goldSpHistory);
  const goldOilYear = yearComparison(goldOilHistory);
  const goldSilverYear = yearComparison(goldSilverHistory);

  return {
    cards: [
      makeCard(locale, direction, "gold-sp", t.names.goldSp, goldSpCurrent === null ? "—" : number(goldSpCurrent, locale, 3), trend(goldSpYear?.change ?? null, 1), goldSpImpact, t.explanations.goldSp[goldSpImpact], {
        group: "context",
        previousValue: goldSpYear ? number(goldSpYear.previous, locale, 3) : "—",
        yoyChange: goldSpYear ? `${goldSpYear.change > 0 ? "+" : ""}${number(goldSpYear.change, locale, 1)}%` : "—",
        comparison: { label: t.fiveYearWeeklyAverage, value: goldSpAverage === null ? "—" : number(goldSpAverage, locale, 3) },
        chart: { points: goldSpChart, unit: "", digits: 3, label: ratioChartLabel, zeroBaseline: false },
      }),
      makeCard(locale, direction, "gold-oil", t.names.goldOil, goldOilCurrent === null ? "—" : number(goldOilCurrent, locale, 2), trend(goldOilYear?.change ?? null, 1), goldOilImpact, t.explanations.goldOil[goldOilImpact], {
        group: "context",
        previousValue: goldOilYear ? number(goldOilYear.previous, locale, 2) : "—",
        yoyChange: goldOilYear ? `${goldOilYear.change > 0 ? "+" : ""}${number(goldOilYear.change, locale, 1)}%` : "—",
        comparison: { label: t.fiveYearWeeklyAverage, value: goldOilAverage === null ? "—" : number(goldOilAverage, locale, 2) },
        chart: { points: goldOilChart, unit: "", digits: 0, label: ratioChartLabel, zeroBaseline: false },
      }),
      makeCard(locale, direction, "gold-silver", t.names.goldSilver, goldSilverCurrent === null ? "—" : number(goldSilverCurrent, locale, 2), trend(goldSilverYear?.change ?? null, 1), goldSilverImpact, t.explanations.goldSilver["gold"][goldSilverImpact], {
        group: "context",
        previousValue: goldSilverYear ? number(goldSilverYear.previous, locale, 2) : "—",
        yoyChange: goldSilverYear ? `${goldSilverYear.change > 0 ? "+" : ""}${number(goldSilverYear.change, locale, 1)}%` : "—",
        comparison: { label: t.historicalAverage, value: goldSilverAverage === null ? "—" : number(goldSilverAverage, locale, 2) },
        chart: { points: goldSilverChart, unit: "", digits: 0, label: chartLabel, zeroBaseline: false },
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
        provenance: `U.S. Energy Information Administration (WCESTUS1) · ${turkish ? "Hafta sonu" : "Week ending"}: ${inventory?.date ?? missing}${stale(inventory ? Date.parse(inventory.date) / 1000 : undefined, 14)}`,
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
  const rights = [getSourceRights("yahoo").disclosure];
  if (!series) return { price: null, dailyChange: null, oneYearReturn: null, high52Week: null, low52Week: null, observedAt: null, unit: spec.unit, points: [], rights };

  const last = series.points.at(-1);
  const previousClose = previousCloseForQuote(series);
  const first = series.points[0];
  const dailyChange = previousClose !== null && previousClose !== 0 ? ((series.current - previousClose) / previousClose) * 100 : null;
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
    rights,
  };
}