import { unstable_cache } from "next/cache";
import { getSourceRights } from "@/lib/source-rights";
import { getMarketComparisonSeries } from "@/lib/indicators";
import { marketComparisonAssets, normalizeMarketComparison, type MarketComparisonAssetId } from "@/lib/market-comparison";
import { messages, type Locale } from "@/lib/i18n";
import { HomeMarketComparisonChart } from "@/components/home-market-comparison-chart";

const getCachedMarketComparison = unstable_cache(
  async () => {
    const results = await Promise.all(marketComparisonAssets.map(async ({ id, symbol }) => ({
      id,
      series: await getMarketComparisonSeries(symbol),
    })));
    const seriesByAsset = Object.fromEntries(results.map(({ id, series }) => [id, series])) as Record<
      MarketComparisonAssetId,
      Awaited<ReturnType<typeof getMarketComparisonSeries>>
    >;

    const unavailable = results.filter(({ series }) => !series).map(({ id }) => id);
    if (unavailable.length) {
      throw new Error(`Home market comparison data unavailable: ${unavailable.join(", ")}`);
    }

    const points = normalizeMarketComparison({
      gold: seriesByAsset.gold?.points ?? null,
      silver: seriesByAsset.silver?.points ?? null,
      copper: seriesByAsset.copper?.points ?? null,
      oil: seriesByAsset.oil?.points ?? null,
      nasdaq: seriesByAsset.nasdaq?.points ?? null,
      sp500: seriesByAsset.sp500?.points ?? null,
    });
    if (!points.length) {
      throw new Error("Home market comparison could not align the requested ten-year series");
    }
    return { points, observedAt: points.at(-1)?.time ?? null };
  },
  ["home-market-comparison-v3"],
  { revalidate: 3600 },
);

export async function HomeMarketComparison({ locale }: { locale: Locale }) {
  const rights = getSourceRights("yahoo");
  const t = messages[locale].home;
  let comparison: { points: ReturnType<typeof normalizeMarketComparison>; observedAt: number | null } = {
    points: [], observedAt: null,
  };
  if (rights.allowed) {
    try {
      comparison = await getCachedMarketComparison();
    } catch (error) {
      console.error("Home market comparison failed", error instanceof Error ? error.message : "Unknown error");
    }
  } else {
    console.error("Home market comparison unavailable: Yahoo access or distribution permission is not enabled");
  }

  return (
    <section className="home-market-comparison content-width" aria-labelledby="home-market-comparison-title">
      <HomeMarketComparisonChart
        points={comparison.points}
        locale={locale}
        labels={t.marketComparisonAssets}
        observedAt={comparison.observedAt}
        sourceNote={t.marketComparisonSource}
        noSelectionLabel={t.marketComparisonNoSelection}
        seriesLabel={t.marketComparisonSeriesLabel}
        titles={t.marketComparisonTitles}
        ranges={t.marketComparisonRanges}
        rangeLabel={t.marketComparisonRangeLabel}
        unavailableLabel={t.marketComparisonUnavailable}
        eyebrow={t.macroSnapshot}
        note={t.marketComparisonNote}
      />
    </section>
  );
}
