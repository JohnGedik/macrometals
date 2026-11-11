import { messages, type Locale } from "@/lib/i18n";

export type SummaryTrend = "up" | "down" | "flat" | "unavailable";
export type SummaryIndicator = { id: string; name: string; score: number; trend: SummaryTrend };
export type MacroSummaryInput = {
  commodity: string;
  commodityName: string;
  score: number;
  indicatorScores: readonly SummaryIndicator[];
  indicatorWeights: Readonly<Record<string, number>>;
  topPositiveDrivers: readonly { id: string; name: string }[];
  topNegativeDrivers: readonly { id: string; name: string }[];
  tone?: string;
  rules?: { baseline: number; bullish: number; bearish: number };
};
export type MacroSummaryResult = {
  outlook: "strongly-bullish" | "bullish" | "neutral" | "bearish" | "strongly-bearish";
  confidence: "high" | "medium" | "low";
  agreement: number;
  summary: string;
  positiveDrivers: string[];
  negativeDrivers: string[];
};

export function generateMacroSummary(input: MacroSummaryInput, locale: Locale): MacroSummaryResult {
  if (!Number.isFinite(input.score) || input.score < 0 || input.score > 100) throw new Error("Invalid macro summary score");
  const t = messages[locale].macro;
  const outlook = input.score > 80 ? "strongly-bullish" : input.score >= 60 ? "bullish"
    : input.score >= 40 ? "neutral" : input.score >= 20 ? "bearish" : "strongly-bearish";
  const direction = input.score >= 60 ? "bullish" : input.score >= 40 ? "neutral" : "bearish";
  const rules = input.rules ?? { baseline: 50, bullish: 60, bearish: 40 };
  const totalWeight = Object.values(input.indicatorWeights).reduce((total, weight) => total + (Number.isFinite(weight) && weight > 0 ? weight : 0), 0);
  const indicators = input.indicatorScores.filter((indicator) => Number.isFinite(indicator.score) && indicator.score >= 0 && indicator.score <= 100);
  const agreeingWeight = indicators.reduce((total, indicator) => {
    const status = indicator.score >= rules.bullish ? "bullish" : indicator.score <= rules.bearish ? "bearish" : "neutral";
    const weight = input.indicatorWeights[indicator.id];
    return total + (status === direction && Number.isFinite(weight) && weight > 0 ? weight : 0);
  }, 0);
  const agreement = totalWeight ? agreeingWeight / totalWeight * 100 : 0;
  const confidence = agreement >= 70 ? "high" : agreement >= 50 ? "medium" : "low";
  const driverNames = new Map([...input.topPositiveDrivers, ...input.topNegativeDrivers].map((driver) => [driver.id, driver.name]));
  const drivers = (positive: boolean, limit: number) => indicators
    .map((indicator) => ({ ...indicator, impact: (indicator.score - rules.baseline) * (input.indicatorWeights[indicator.id] ?? 0) / 100 }))
    .filter((indicator) => Number.isFinite(indicator.impact) && (positive ? indicator.impact > 1e-10 : indicator.impact < -1e-10))
    .sort((first, second) => Math.abs(second.impact) - Math.abs(first.impact) || first.id.localeCompare(second.id))
    .slice(0, limit);
  const positive = drivers(true, 3);
  const negative = drivers(false, 2);
  const listFormat = new Intl.ListFormat(locale === "tr" ? "tr-TR" : "en-US", { style: "long", type: "conjunction" });
  const describe = (indicator: SummaryIndicator) => {
    const name = driverNames.get(indicator.id) ?? indicator.name;
    return (indicator.trend === "up" ? t.summaryRising : indicator.trend === "down" ? t.summaryFalling : t.summaryFactor).replace("{indicator}", name);
  };
  const backdrop = direction === "bullish" ? t.summaryConstructive : direction === "bearish" ? t.summaryUnderPressure : t.summaryBalanced;
  const sentences = [backdrop.replace("{commodity}", input.commodityName)];
  if (input.tone) sentences.push(input.tone);
  if (positive.length) sentences.push(t.summarySupport.replace("{drivers}", listFormat.format(positive.map(describe))));
  if (negative.length) sentences.push(t.summaryHeadwinds.replace("{drivers}", listFormat.format(negative.map(describe))));
  if (!positive.length && !negative.length) sentences.push(t.summaryNoDrivers);
  else if (!negative.length) sentences.push(t.summaryNoHeadwinds);
  else if (!positive.length) sentences.push(t.summaryNoSupport);
  return { outlook, confidence, agreement, summary: sentences.join(" "), positiveDrivers: positive.map((indicator) => indicator.id), negativeDrivers: negative.map((indicator) => indicator.id) };
}