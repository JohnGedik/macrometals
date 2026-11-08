import { messages, type Locale } from "@/lib/i18n";
import { getOilInventory } from "@/lib/oil-inventory";

type Point = { time: number; value: number };
type Series = { current: number; points: Point[]; currentTime?: number };
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
  provenance?: string;
};

type MarketResponse = {
  chart?: {
    result?: Array<{
      meta?: { regularMarketPrice?: number; regularMarketTime?: number };
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
  };
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

async function getMarketSeries(symbol: string, interval = "1wk"): Promise<Series | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=${interval}`;
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

    return finite(current) && points.length ? { current, points, currentTime: finite(result?.meta?.regularMarketTime) ? result.meta.regularMarketTime : undefined } : null;
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
  subject: "gold" | "silver" | "copper" | "oil",
  id: string,
  name: string,
  value: string,
  direction: Trend,
  impact: Impact,
  explanation: string,
  extra?: Pick<IndicatorCardData, "comparison" | "score" | "severity" | "provenance">,
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
    subject: subject === "gold" ? t.onGold : subject === "silver" ? t.onSilver : subject === "copper" ? t.onCopper : locale === "tr" ? "Petrol üzerindeki etkisi" : "on Oil",
    explanation,
    ...extra,
  };
}

export async function getMacroIndicators(metal: "gold" | "silver" | "copper" | "oil", locale: Locale) {
  const t = messages[locale].macro;
  if (metal === "oil") return getOilIndicators(locale);
  const [dollar, gold, silver, oil, sp500, realYields, copper] = await Promise.all([
    getMarketSeries("DX-Y.NYB"),
    getMarketSeries("GC=F"),
    metal === "copper" ? Promise.resolve(null) : getMarketSeries("SI=F"),
    metal === "copper" ? Promise.resolve(null) : getMarketSeries("CL=F"),
    metal === "copper" ? Promise.resolve(null) : getMarketSeries("^GSPC"),
    getRealYieldSeries(),
    metal === "copper" ? getMarketSeries("HG=F") : Promise.resolve(null),
  ]);

  const goldMomentum = percentageChange(gold?.points ?? null);
  const dollarChange = percentageChange(dollar?.points ?? null);
  const realYieldChange = periodChange(realYields?.points ?? null);
  const dollarImpact = impactFromChange(dollarChange, -1, 0.75);
  const realYieldImpact = impactFromChange(realYieldChange, -1, 0.1);

  if (metal === "copper") {
    const copperChange = percentageChange(copper?.points ?? null);
    const copperHistory = alignRatio(copper, gold);
    const copperGoldAverage = mean(copperHistory);
    const copperGoldCurrent = copper && gold && gold.current > 0 ? copper.current / gold.current : null;
    const copperImpact = impactFromChange(copperChange, 1, 1);
    const relativeImpact = ratioImpact(copperGoldCurrent, copperGoldAverage, true);

    return {
      cards: [
        makeCard(locale, metal, "copper-price", t.names.copperPrice, copper ? `$${number(copper.current, locale)}/lb` : "—", trend(copperChange, 1), copperImpact, t.explanations.copperPrice[copperImpact]),
        makeCard(locale, metal, "real-rates", t.names.realRates, realYields ? `${number(realYields.current, locale)}%` : "—", trend(realYieldChange, 0.1), realYieldImpact, t.explanations.copperRates[realYieldImpact]),
        makeCard(locale, metal, "dxy", t.names.dxy, dollar ? number(dollar.current, locale) : "—", trend(dollarChange, 0.75), dollarImpact, t.explanations.copperDxy[dollarImpact]),
        makeCard(locale, metal, "copper-gold", t.names.copperGold, copperGoldCurrent === null ? "—" : number(copperGoldCurrent, locale, 5), trend(percentageChange(copperHistory), 1), relativeImpact, t.explanations.copperGold[relativeImpact], {
          comparison: { label: t.fiveYearAverage, value: copperGoldAverage === null ? "—" : number(copperGoldAverage, locale, 5) },
        }),
      ],
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
      }),
      makeCard(locale, "oil", "oil-inventory", turkish ? "ABD ham petrol stok değişimi" : "U.S. crude inventory change", inventory ? `${inventory.change > 0 ? "+" : ""}${number(inventory.change, locale)} ${turkish ? "milyon varil" : "million barrels"}` : missing, trend(inventory?.change ?? null, 0.1), inventoryImpact, inventoryText, {
        comparison: { label: turkish ? "5 yıllık mevsimsel ortalama" : "5-year seasonal average", value: inventory?.average == null ? missing : `${number(inventory.average, locale)} ${turkish ? "milyon varil" : "million barrels"}` },
        provenance: `EIA (WCESTUS1) · ${turkish ? "Hafta sonu" : "Week ending"}: ${inventory?.date ?? missing}${stale(inventory ? Date.parse(inventory.date) / 1000 : undefined, 14)}`,
      }),
      makeCard(locale, "oil", "oil-dxy", t.names.dxy, dollar ? number(dollar.current, locale) : missing, trend(dollarChange, 0.75), dollarImpact, explain(dollarImpact,
        turkish ? "Zayıflayan dolar petrol talebini destekleyebilir." : "A weaker dollar can support demand for oil.",
        turkish ? "Doların 90 günlük değişimi sınırlı." : "The dollar's 90-day change is modest.",
        turkish ? "Güçlenen dolar petrol talebini baskılayabilir." : "A stronger dollar can weigh on demand for oil.",
        turkish ? "Dolar verisi alınamadı." : "Dollar data is unavailable."), { provenance: marketSource("DX-Y.NYB", dollar?.currentTime) }),
      makeCard(locale, "oil", "oil-curve", turkish ? "WTI vadeli işlem farkı" : "WTI futures spread", missing, "unavailable", "unavailable", turkish ? "Güncel, doğrulanmış iki vadeli kontrat kaynağı mevcut değil. Pozitif fark backwardation, negatif fark contango gösterir." : "A current, verified source for two futures maturities is unavailable. A positive spread indicates backwardation; a negative spread indicates contango.", { provenance: turkish ? "Kaynak: mevcut değil · Gözlem: —" : "Source: unavailable · Observed: —" }),
      makeCard(locale, "oil", "oil-gold-ratio", t.names.goldOil, latestRatio ? number(latestRatio.value, locale) : missing, trend(percentageChange(ratioHistory), 1), ratioImpactValue, ratioText, {
        comparison: { label: t.fiveYearAverage, value: ratioAverage === null ? missing : number(ratioAverage, locale) },
        provenance: `Yahoo Finance (GC=F, CL=F) · ${turkish ? "Eşleşen kapanış" : "Matched close"}: ${date(latestRatio?.time)}${stale(latestRatio?.time, 5)}`,
      }),
    ],
    source: turkish ? "Vadeli işlem fiyatları gecikmeli olabilir; spot fiyat değildir." : "Futures quotes may be delayed and are not spot prices.",
  };
}