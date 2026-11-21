import type { CommodityConfiguration, IndicatorDataHealth, Observation } from "@/lib/commodity-score";
import { annualPeriodIsRecent, availableObservation, monthlyPeriodIsRecent } from "@/lib/observation-data";
import { getSourceRights } from "@/lib/source-rights";
import { unverifiedSampleRights } from "@/lib/source-rights";
import { wgcCentralBankSeriesId, wgcEtfSeriesId } from "@/lib/wgc-gold-observations";
import { cftcGoldCotSeriesId, cftcSilverCotSeriesId, cftcWtiCotSeriesId, cftcGoldCotSourceUrl } from "@/lib/cftc-cot";
import { eiaOilDefinitions, spareCapacitySeriesId, spareCapacityUrl, steoOilUrl } from "@/lib/eia-oil-parser";
import { gprSeriesId, gprSourceUrl } from "@/lib/gpr";
import { silverIndustrialSeriesId, silverSolarSeriesId, silverMineSeriesId, silverEtpSeriesId, silverEtpPdfPage, silverIndustrialUnit, silverSurveyUrl } from "@/lib/silver-industrial-parser";
import { chinaPmiSeriesId, copperIndustrialDemandSeriesId, copperMineSupplySeriesId, icsgCopperTableUrl } from "@/lib/copper-data-parser";

type ScoreSource = NonNullable<CommodityConfiguration["scoreSources"]>[string];
type SourceDefinition = {
  source: string;
  url: string;
  seriesId: string;
  provider: "yahoo" | "fred" | "wgc" | "cftc" | "gpr" | "silver-institute" | "icsg" | "nbs" | "eia";
  frequency: "daily" | "weekly" | "monthly" | "annual";
  measurement: "stock" | "flow" | "rate" | "index";
  normalizedUnit: string;
  maxAgeDays?: number;
  maxLagMonths?: number;
  geography?: string;
  aggregation?: NonNullable<Observation["provenance"]>["aggregation"];
};
const sources: Record<ScoreSource, SourceDefinition> = {
  dxy: { source: "Federal Reserve Board via FRED · Nominal Broad U.S. Dollar Index (DTWEXBGS)", url: "https://fred.stlouisfed.org/series/DTWEXBGS", seriesId: "DTWEXBGS", provider: "fred", frequency: "daily", measurement: "index", normalizedUnit: "index points", maxAgeDays: 14 },
  "real-yields": { source: "FRED / U.S. Treasury · DFII10", url: "https://fred.stlouisfed.org/series/DFII10", seriesId: "DFII10", provider: "fred", frequency: "daily", measurement: "rate", normalizedUnit: "percent", maxAgeDays: 14 },
  "breakeven-5y": { source: "FRED · T5YIE", url: "https://fred.stlouisfed.org/series/T5YIE", seriesId: "T5YIE", provider: "fred", frequency: "daily", measurement: "rate", normalizedUnit: "percent", maxAgeDays: 14 },
  "breakeven-10y": { source: "FRED / Federal Reserve Bank of St. Louis · T10YIE", url: "https://fred.stlouisfed.org/series/T10YIE", seriesId: "T10YIE", provider: "fred", frequency: "daily", measurement: "rate", normalizedUnit: "percent", maxAgeDays: 14 },
  m2: { source: "FRED / Federal Reserve H.6 · M2SL", url: "https://fred.stlouisfed.org/series/M2SL", seriesId: "M2SL", provider: "fred", frequency: "monthly", measurement: "stock", normalizedUnit: "USD trillions", maxLagMonths: 2 },
  "wgc-central-bank": { source: "World Gold Council · reported official reserve changes", url: "https://www.gold.org/goldhub/data/gold-reserves-by-country", seriesId: wgcCentralBankSeriesId, provider: "wgc", frequency: "monthly", measurement: "flow", normalizedUnit: "tonnes", maxLagMonths: 3 },
  "wgc-etf-holdings": { source: "World Gold Council · global gold ETF holdings", url: "https://www.gold.org/goldhub/data/gold-etfs-holdings-and-flows", seriesId: wgcEtfSeriesId, provider: "wgc", frequency: "monthly", measurement: "stock", normalizedUnit: "tonnes", maxLagMonths: 2 },
  "cftc-gold-cot": { source: "CFTC · COMEX Gold Disaggregated Futures Only, Managed Money net", url: cftcGoldCotSourceUrl, seriesId: cftcGoldCotSeriesId, provider: "cftc", frequency: "weekly", measurement: "stock", normalizedUnit: "thousand contracts", maxAgeDays: 14 },
  "cftc-silver-cot": { source: "CFTC · COMEX Silver Disaggregated Futures Only, Managed Money net", url: cftcGoldCotSourceUrl, seriesId: cftcSilverCotSeriesId, provider: "cftc", frequency: "weekly", measurement: "stock", normalizedUnit: "thousand contracts", maxAgeDays: 14 },
  gpr: { source: "Caldara and Iacoviello · Recent GPR (CC BY 4.0)", url: gprSourceUrl, seriesId: gprSeriesId, provider: "gpr", frequency: "monthly", measurement: "index", normalizedUnit: "index points", maxLagMonths: 2 },
  "silver-industrial-demand": { source: "The Silver Institute / Metals Focus - World Silver Survey 2026, Industrial (total)", url: `${silverSurveyUrl}#page=11`, seriesId: silverIndustrialSeriesId, provider: "silver-institute", frequency: "annual", measurement: "flow", normalizedUnit: silverIndustrialUnit, maxLagMonths: 16 },
  "silver-solar-demand": { source: "The Silver Institute / Metals Focus - World Silver Survey 2026, of which photovoltaics (included in industrial demand)", url: `${silverSurveyUrl}#page=11`, seriesId: silverSolarSeriesId, provider: "silver-institute", frequency: "annual", measurement: "flow", normalizedUnit: silverIndustrialUnit, maxLagMonths: 16 },
  "silver-mine-supply": { source: "The Silver Institute / Metals Focus - World Silver Survey 2026, global mine production", url: `${silverSurveyUrl}#page=11`, seriesId: silverMineSeriesId, provider: "silver-institute", frequency: "annual", measurement: "flow", normalizedUnit: silverIndustrialUnit, maxLagMonths: 16 },
  "silver-etp-holdings": { source: "The Silver Institute / Metals Focus - World Silver Survey 2026, global physically backed ETP year-end holdings (rounded Moz; respective ETP providers / Bloomberg)", url: `${silverSurveyUrl}#page=${silverEtpPdfPage}`, seriesId: silverEtpSeriesId, provider: "silver-institute", frequency: "annual", measurement: "stock", normalizedUnit: silverIndustrialUnit, maxLagMonths: 16 },
  "copper-industrial-demand": { source: "International Copper Study Group · world refined copper usage", url: icsgCopperTableUrl, seriesId: copperIndustrialDemandSeriesId, provider: "icsg", frequency: "annual", measurement: "flow", normalizedUnit: "million metric tonnes", maxLagMonths: 16, geography: "Global", aggregation: "annual-total" },
  "copper-mine-supply": { source: "International Copper Study Group · world copper mine production", url: icsgCopperTableUrl, seriesId: copperMineSupplySeriesId, provider: "icsg", frequency: "annual", measurement: "flow", normalizedUnit: "million metric tonnes", maxLagMonths: 16, geography: "Global", aggregation: "annual-total" },
  "china-pmi": { source: "National Bureau of Statistics of China / CFLP · manufacturing PMI", url: "https://www.stats.gov.cn/english/PressRelease/", seriesId: chinaPmiSeriesId, provider: "nbs", frequency: "monthly", measurement: "index", normalizedUnit: "index points", maxLagMonths: 2, geography: "China", aggregation: "monthly-index" },
  "cftc-wti-cot": { source: "CFTC - NYMEX WTI Physical, Disaggregated Futures Only, Managed Money net", url: cftcGoldCotSourceUrl, seriesId: cftcWtiCotSeriesId, provider: "cftc", frequency: "weekly", measurement: "stock", normalizedUnit: "thousand contracts", maxAgeDays: 14 },
  "eia-oil-demand": { source: "EIA STEO - world petroleum and other liquids consumption (historical estimates)", url: steoOilUrl, seriesId: eiaOilDefinitions["eia-oil-demand"].seriesId, provider: "eia", frequency: "monthly", measurement: "rate", normalizedUnit: "million barrels/day", maxLagMonths: 2, geography: "Global", aggregation: "monthly-average" },
  "eia-oil-supply": { source: "EIA STEO - world petroleum and other liquids production (historical estimates)", url: steoOilUrl, seriesId: eiaOilDefinitions["eia-oil-supply"].seriesId, provider: "eia", frequency: "monthly", measurement: "rate", normalizedUnit: "million barrels/day", maxLagMonths: 2, geography: "Global", aggregation: "monthly-average" },
  "eia-oil-inventories": { source: "EIA STEO - OECD end-of-period commercial crude oil and other liquids inventories", url: steoOilUrl, seriesId: eiaOilDefinitions["eia-oil-inventories"].seriesId, provider: "eia", frequency: "monthly", measurement: "stock", normalizedUnit: "million barrels", maxLagMonths: 2, geography: "OECD", aggregation: "month-end" },
  "eia-oil-spare-capacity": { source: "EIA STEO - OPEC surplus crude oil production capacity (annual average historical estimates)", url: spareCapacityUrl, seriesId: spareCapacitySeriesId, provider: "eia", frequency: "annual", measurement: "rate", normalizedUnit: "million barrels/day", maxLagMonths: 16, geography: "OPEC", aggregation: "annual-average" },
};

export function commoditySourceRightsKey(config: CommodityConfiguration): string {
  return Object.values(config.scoreSources ?? {}).map((sourceId) => {
    const source = sources[sourceId];
    return `${sourceId}:${getSourceRights(source.provider, source.seriesId).allowed ? "1" : "0"}`;
  }).sort().join(",");
}

export function hydrateCommodityObservations(config: CommodityConfiguration, feeds: Partial<Record<ScoreSource, readonly Observation[] | null>>, checkedAt = Date.now() / 1000,
  evidence: Partial<Record<ScoreSource, Pick<IndicatorDataHealth, "archive" | "release">>> = {}): CommodityConfiguration {
  return {
    ...config,
    indicators: config.indicators.map((indicator) => {
      const sourceId = config.scoreSources?.[indicator.id];
      if (!sourceId) return { ...indicator, dataHealth: indicator.dataHealth ?? {
        kind: "sample", status: "sample", source: "Annual sample dataset", frequency: "annual",
        observedAt: null, checkedAt,
        rights: [unverifiedSampleRights],
        ...(config.years.length ? { reportingPeriod: { start: `${config.years.at(-1)}-01-01`, end: `${config.years.at(-1)}-12-31`, label: String(config.years.at(-1)), frequency: "annual" as const } } : {}),
      } satisfies IndicatorDataHealth };
      const source = sources[sourceId];
      const rights = getSourceRights(source.provider, source.seriesId);
      const observations = [...new Map((rights.allowed ? feeds[sourceId] ?? [] : [])
        .filter((point) => availableObservation(point, checkedAt)
          && (!point.provenance || point.provenance.valueType !== "forecast" && point.provenance.seriesId === source.seriesId
            && point.provenance.normalizedUnit === source.normalizedUnit && (point.provenance.publishedAt === null || point.provenance.publishedAt <= checkedAt))
          && (!["monthly", "weekly", "annual"].includes(source.frequency)
            || point.reportingPeriod?.frequency === source.frequency && point.provenance?.measurement === source.measurement)
          && (!source.geography || point.provenance?.geography === source.geography)
          && (!source.aggregation || point.provenance?.aggregation === source.aggregation)
          && (source.frequency !== "annual" || point.provenance?.aggregation === (source.aggregation ?? (source.measurement === "stock" ? "year-end" : "annual-total"))
            && point.provenance.geography === (source.geography ?? "Global")))
        .map((point) => [point.time, point])).values()].sort((first, second) => first.time - second.time);
      const observedAt = observations.at(-1)?.time ?? null;
      const latest = observations.at(-1);
      const recent = latest && (source.frequency === "monthly" ? monthlyPeriodIsRecent(latest, checkedAt, source.maxLagMonths!)
        : source.frequency === "annual" ? annualPeriodIsRecent(latest, checkedAt, source.maxLagMonths!)
        : checkedAt - latest.time <= source.maxAgeDays! * 86400);
      const release = sourceId === "m2" ? evidence[sourceId]?.release ?? { status: "unknown" as const, sourceUrl: "https://www.federalreserve.gov/releases/h6/default.htm", checkedAt } : undefined;
      const releaseRecent = release && Number.isFinite(release.checkedAt) && release.checkedAt <= checkedAt && checkedAt - release.checkedAt <= 86400;
      const releaseUnknown = release && (!releaseRecent || release.status === "unknown");
      const releaseMismatch = release && (release.status !== "matched" || release.referencePeriod !== latest?.reportingPeriod?.label);
      const status = !rights.allowed || observedAt === null || releaseUnknown ? "unavailable" : recent && !releaseMismatch ? "fresh" : "stale";
      return { ...indicator, observations, dataHealth: {
        ...source, kind: "sourced", status, observedAt, checkedAt,
        reportingPeriod: latest?.reportingPeriod, provenance: latest?.provenance,
        archive: evidence[sourceId]?.archive, release, rights: [rights.disclosure],
        freshnessBasis: sourceId === "m2" || source.frequency === "weekly" || source.frequency === "monthly" || source.frequency === "annual" ? "reporting-lag" : "observation-age",
      } satisfies IndicatorDataHealth };
    }),
  };
}