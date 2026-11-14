import type { CommodityConfiguration, IndicatorDataHealth, Observation } from "@/lib/commodity-score";
import { availableObservation, monthlyPeriodIsRecent } from "@/lib/observation-data";
import { getSourceRights } from "@/lib/source-rights";
import { unverifiedSampleRights } from "@/lib/source-rights";
import { wgcCentralBankSeriesId, wgcEtfSeriesId } from "@/lib/wgc-gold-observations";
import { cftcGoldCotSeriesId, cftcGoldCotSourceUrl } from "@/lib/cftc-cot";
import { gprSeriesId, gprSourceUrl } from "@/lib/gpr";

type ScoreSource = "dxy" | "real-yields" | "m2" | "breakeven-5y" | "wgc-central-bank" | "wgc-etf-holdings" | "cftc-gold-cot" | "gpr";
type SourceDefinition = {
  source: string;
  url: string;
  seriesId: string;
  provider: "yahoo" | "fred" | "wgc" | "cftc" | "gpr";
  frequency: "daily" | "weekly" | "monthly";
  measurement: "stock" | "flow" | "rate" | "index";
  normalizedUnit: string;
  maxAgeDays?: number;
  maxLagMonths?: number;
};
const sources: Record<ScoreSource, SourceDefinition> = {
  dxy: { source: "Federal Reserve Board via FRED · Nominal Broad U.S. Dollar Index (DTWEXBGS)", url: "https://fred.stlouisfed.org/series/DTWEXBGS", seriesId: "DTWEXBGS", provider: "fred", frequency: "daily", measurement: "index", normalizedUnit: "index points", maxAgeDays: 14 },
  "real-yields": { source: "FRED / U.S. Treasury · DFII10", url: "https://fred.stlouisfed.org/series/DFII10", seriesId: "DFII10", provider: "fred", frequency: "daily", measurement: "rate", normalizedUnit: "percent", maxAgeDays: 14 },
  "breakeven-5y": { source: "FRED · T5YIE", url: "https://fred.stlouisfed.org/series/T5YIE", seriesId: "T5YIE", provider: "fred", frequency: "daily", measurement: "rate", normalizedUnit: "percent", maxAgeDays: 14 },
  m2: { source: "FRED / Federal Reserve H.6 · M2SL", url: "https://fred.stlouisfed.org/series/M2SL", seriesId: "M2SL", provider: "fred", frequency: "monthly", measurement: "stock", normalizedUnit: "USD trillions", maxLagMonths: 2 },
  "wgc-central-bank": { source: "World Gold Council · reported official reserve changes", url: "https://www.gold.org/goldhub/data/gold-reserves-by-country", seriesId: wgcCentralBankSeriesId, provider: "wgc", frequency: "monthly", measurement: "flow", normalizedUnit: "tonnes", maxLagMonths: 3 },
  "wgc-etf-holdings": { source: "World Gold Council · global gold ETF holdings", url: "https://www.gold.org/goldhub/data/gold-etfs-holdings-and-flows", seriesId: wgcEtfSeriesId, provider: "wgc", frequency: "monthly", measurement: "stock", normalizedUnit: "tonnes", maxLagMonths: 2 },
  "cftc-gold-cot": { source: "CFTC · COMEX Gold Disaggregated Futures Only, Managed Money net", url: cftcGoldCotSourceUrl, seriesId: cftcGoldCotSeriesId, provider: "cftc", frequency: "weekly", measurement: "stock", normalizedUnit: "thousand contracts", maxAgeDays: 14 },
  gpr: { source: "Caldara and Iacoviello · Recent GPR (CC BY 4.0)", url: gprSourceUrl, seriesId: gprSeriesId, provider: "gpr", frequency: "monthly", measurement: "index", normalizedUnit: "index points", maxLagMonths: 2 },
};

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
          && (!["monthly", "weekly"].includes(source.frequency)
            || point.reportingPeriod?.frequency === source.frequency && point.provenance?.measurement === source.measurement))
        .map((point) => [point.time, point])).values()].sort((first, second) => first.time - second.time);
      const observedAt = observations.at(-1)?.time ?? null;
      const latest = observations.at(-1);
      const recent = latest && (source.frequency === "monthly" ? monthlyPeriodIsRecent(latest, checkedAt, source.maxLagMonths!) : checkedAt - latest.time <= source.maxAgeDays! * 86400);
      const release = sourceId === "m2" ? evidence[sourceId]?.release ?? { status: "unknown" as const, sourceUrl: "https://www.federalreserve.gov/releases/h6/default.htm", checkedAt } : undefined;
      const releaseRecent = release && Number.isFinite(release.checkedAt) && release.checkedAt <= checkedAt && checkedAt - release.checkedAt <= 86400;
      const releaseUnknown = release && (!releaseRecent || release.status === "unknown");
      const releaseMismatch = release && (release.status !== "matched" || release.referencePeriod !== latest?.reportingPeriod?.label);
      const status = !rights.allowed || observedAt === null || releaseUnknown ? "unavailable" : recent && !releaseMismatch ? "fresh" : "stale";
      return { ...indicator, observations, dataHealth: {
        ...source, kind: "sourced", status, observedAt, checkedAt,
        reportingPeriod: latest?.reportingPeriod, provenance: latest?.provenance,
        archive: evidence[sourceId]?.archive, release, rights: [rights.disclosure],
        freshnessBasis: sourceId === "m2" || source.frequency === "weekly" || source.frequency === "monthly" ? "reporting-lag" : "observation-age",
      } satisfies IndicatorDataHealth };
    }),
  };
}