import type { CommodityConfiguration, IndicatorDataHealth, Observation } from "@/lib/commodity-score";

type ScoreSource = "dxy" | "real-yields";
const sources = {
  dxy: { source: "Yahoo Finance · DX-Y.NYB", url: "https://finance.yahoo.com/quote/DX-Y.NYB/", maxAgeDays: 5 },
  "real-yields": { source: "FRED / U.S. Treasury · DFII10", url: "https://fred.stlouisfed.org/series/DFII10", maxAgeDays: 5 },
};

export function hydrateCommodityObservations(config: CommodityConfiguration, feeds: Partial<Record<ScoreSource, readonly Observation[] | null>>, checkedAt = Date.now() / 1000): CommodityConfiguration {
  return {
    ...config,
    indicators: config.indicators.map((indicator) => {
      const sourceId = config.scoreSources?.[indicator.id];
      if (!sourceId) return { ...indicator, dataHealth: indicator.dataHealth ?? {
        kind: "sample", status: "sample", source: "Annual sample dataset", frequency: "annual",
        observedAt: Date.UTC(config.years.at(-1)!, 6, 1) / 1000, checkedAt,
      } satisfies IndicatorDataHealth };
      const source = sources[sourceId];
      const observations = [...new Map((feeds[sourceId] ?? [])
        .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value) && point.time <= checkedAt)
        .map((point) => [point.time, point])).values()].sort((first, second) => first.time - second.time);
      const observedAt = observations.at(-1)?.time ?? null;
      const status = observedAt === null ? "unavailable" : checkedAt - observedAt > source.maxAgeDays * 86400 ? "stale" : "fresh";
      return { ...indicator, observations, dataHealth: {
        ...source, kind: "sourced", frequency: "daily", status, observedAt, checkedAt,
      } satisfies IndicatorDataHealth };
    }),
  };
}