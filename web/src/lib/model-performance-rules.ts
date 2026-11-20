import type { ScoredIndicator } from "@/lib/commodity-score";
import type { ModelWeights } from "@/lib/metal-model";

export const scoringEngineVersion = "1.0.0";

export type PerformanceSignal =
  | "strong_bullish"
  | "bullish"
  | "neutral"
  | "bearish"
  | "strong_bearish";

export type SnapshotIndicatorContribution = {
  indicator_name: string;
  indicator_weight: number;
  indicator_value: number | null;
  normalized_indicator_score: number | null;
  contribution_to_model_score: number;
};

export function classifyPerformanceSignal(score: number | null): PerformanceSignal | null {
  if (score === null || !Number.isFinite(score)) return null;
  if (score >= 90) return "strong_bullish";
  if (score >= 60) return "bullish";
  if (score > 40) return "neutral";
  if (score > 10) return "bearish";
  return "strong_bearish";
}

export function calculateSnapshotScore(
  indicators: readonly ScoredIndicator[],
  weights: ModelWeights,
  baseline: number,
  publicationBlocked: boolean,
): { score: number | null; contributions: SnapshotIndicatorContribution[] } {
  const eligibleWeight = indicators.reduce((total, indicator) =>
    total + (indicator.score !== null && weights[indicator.id] > 0 ? weights[indicator.id] : 0), 0);
  const canScore = eligibleWeight > 0 && !publicationBlocked;
  const contributions = indicators.map((indicator) => {
    const weight = weights[indicator.id] ?? 0;
    const normalized = canScore
      ? indicator.score === null ? 0 : weight / eligibleWeight
      : 0;
    return {
      indicator_name: indicator.id,
      indicator_weight: weight,
      indicator_value: indicator.current,
      normalized_indicator_score: indicator.score,
      contribution_to_model_score: indicator.score === null
        ? 0
        : (indicator.score - baseline) * normalized,
    };
  });
  if (!canScore) return { score: null, contributions };
  const score = Math.round(indicators.reduce((total, indicator) =>
    total + (indicator.score === null ? 0 : indicator.score * (weights[indicator.id] ?? 0) / eligibleWeight), 0));
  return { score, contributions };
}

export function predictionIsCorrect(
  signal: PerformanceSignal,
  forwardReturn: number,
  neutralBandPercent = 2,
): boolean {
  if (signal === "bullish" || signal === "strong_bullish") return forwardReturn > 0;
  if (signal === "bearish" || signal === "strong_bearish") return forwardReturn < 0;
  return forwardReturn >= -neutralBandPercent && forwardReturn <= neutralBandPercent;
}
