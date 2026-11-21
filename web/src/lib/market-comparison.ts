export const marketComparisonAssets = [
  { id: "gold", symbol: "GC=F", color: "#D4AF37" },
  { id: "silver", symbol: "SI=F", color: "#8797A1" },
  { id: "copper", symbol: "HG=F", color: "#B95337" },
  { id: "oil", symbol: "CL=F", color: "#39745E" },
  { id: "nasdaq", symbol: "^IXIC", color: "#6A71A8" },
  { id: "sp500", symbol: "^GSPC", color: "#248E9B" },
] as const;

export type MarketComparisonAssetId = (typeof marketComparisonAssets)[number]["id"];
export type MarketComparisonSeriesPoint = { time: number; value: number };
export type MarketComparisonRange = "10y" | "5y" | "1y" | "6m" | "1m";
export const marketComparisonRanges: readonly MarketComparisonRange[] = ["10y", "5y", "1y", "6m", "1m"];
export type MarketComparisonPoint = {
  time: number;
  gold: number;
  silver: number;
  copper: number;
  oil: number;
  nasdaq: number;
  sp500: number;
};

export function marketComparisonForRange(
  points: readonly MarketComparisonPoint[],
  range: MarketComparisonRange,
): MarketComparisonPoint[] {
  const end = points.at(-1);
  if (!end) return [];

  const months = { "10y": 120, "5y": 60, "1y": 12, "6m": 6, "1m": 1 }[range];
  const endDate = new Date(end.time * 1000);
  const day = endDate.getUTCDate();
  endDate.setUTCDate(1);
  endDate.setUTCMonth(endDate.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() + 1, 0)).getUTCDate();
  endDate.setUTCDate(Math.min(day, lastDay));
  const start = endDate.getTime() / 1000;
  const firstIndex = points.findIndex((point) => point.time >= start);
  if (firstIndex < 0 || firstIndex === points.length - 1 || points[firstIndex].time > start + 7 * 86400) return [];

  const baseline = points[firstIndex];
  if (marketComparisonAssets.some(({ id }) => !Number.isFinite(baseline[id]) || baseline[id] <= 0)) return [];

  return points.slice(firstIndex).map((point) => ({
    time: point.time,
    gold: point.gold / baseline.gold * 100,
    silver: point.silver / baseline.silver * 100,
    copper: point.copper / baseline.copper * 100,
    oil: point.oil / baseline.oil * 100,
    nasdaq: point.nasdaq / baseline.nasdaq * 100,
    sp500: point.sp500 / baseline.sp500 * 100,
  }));
}

export function normalizeMarketComparison(
  seriesByAsset: Record<MarketComparisonAssetId, readonly MarketComparisonSeriesPoint[] | null>,
): MarketComparisonPoint[] {
  const series = marketComparisonAssets.map(({ id }) => seriesByAsset[id]);
  if (series.some((points) => !points?.length)) return [];

  const availableSeries = series as readonly (readonly MarketComparisonSeriesPoint[])[];
  const startTime = Math.max(...availableSeries.map((points) => points[0].time));
  const endTime = Math.min(...availableSeries.map((points) => points.at(-1)!.time));
  if (endTime <= startTime) return [];

  const baselines = Object.fromEntries(marketComparisonAssets.map(({ id }) => {
    const points = seriesByAsset[id]!;
    const baseline = points.findLast((point) => point.time <= startTime)?.value;
    return [id, baseline];
  })) as Record<MarketComparisonAssetId, number | undefined>;
  if (marketComparisonAssets.some(({ id }) => !Number.isFinite(baselines[id]) || baselines[id]! <= 0)) return [];

  const times = new Set<number>([startTime]);
  for (const points of availableSeries) {
    for (const point of points) {
      if (point.time > startTime && point.time <= endTime) times.add(point.time);
    }
  }

  const indexes = Object.fromEntries(marketComparisonAssets.map(({ id }) => [
    id,
    seriesByAsset[id]!.findIndex((point) => point.time > startTime),
  ])) as Record<MarketComparisonAssetId, number>;
  const latest = Object.fromEntries(marketComparisonAssets.map(({ id }) => [
    id,
    seriesByAsset[id]!.findLast((point) => point.time <= startTime)!.value,
  ])) as Record<MarketComparisonAssetId, number>;

  return [...times].sort((first, second) => first - second).map((time) => {
    for (const { id } of marketComparisonAssets) {
      const points = seriesByAsset[id]!;
      while (indexes[id] < points.length && points[indexes[id]].time <= time) {
        latest[id] = points[indexes[id]].value;
        indexes[id] += 1;
      }
    }
    return {
      time,
      gold: latest.gold / baselines.gold! * 100,
      silver: latest.silver / baselines.silver! * 100,
      copper: latest.copper / baselines.copper! * 100,
      oil: latest.oil / baselines.oil! * 100,
      nasdaq: latest.nasdaq / baselines.nasdaq! * 100,
      sp500: latest.sp500 / baselines.sp500! * 100,
    };
  });
}
