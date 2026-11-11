import { messages, type Locale } from "@/lib/i18n";
import { goldMacroSeed } from "@/lib/gold-macro-data";
import { silverMacroSeed } from "@/lib/silver-macro-data";
import { copperMacroSeed } from "@/lib/copper-macro-data";
import { oilMacroSeed } from "@/lib/oil-macro-data";
import type { CommodityConfiguration, CommodityIndicatorConfig, Localized } from "@/lib/commodity-score";

const localized = <T>(value: (locale: Locale) => T): Localized<T> => ({ en: value("en"), tr: value("tr") });

const units: Record<string, Localized<string>> = {
  percent: { en: "%", tr: "%" },
  index: { en: "", tr: "" },
  tonnes: { en: " tonnes", tr: " ton" },
  trillion: { en: "T", tr: "T" },
  "million-ounces": { en: " Moz", tr: " milyon ons" },
  "million-tonnes": { en: " Mt", tr: " milyon ton" },
  "thousand-tonnes": { en: " kt", tr: " bin ton" },
  "million-bpd": { en: " mb/d", tr: " mn varil/gün" },
  "million-barrels": { en: " mn bbl", tr: " mn varil" },
  "thousand-contracts": { en: "k", tr: "k" },
};

type MetricDefinition = Omit<CommodityIndicatorConfig, "unit" | "prefix"> & {
  unit: string;
  weight: number;
  favorableDirection: -1 | 1;
  changeScale: number;
};

function configure(
  metadata: Omit<CommodityConfiguration, "years" | "chartStartYear" | "indicators" | "weights" | "scoreRules">,
  seed: { years: readonly number[]; chartStartYear: number; metrics: readonly MetricDefinition[] },
): CommodityConfiguration {
  return {
    ...metadata,
    scoringPolicy: metadata.scoringPolicy ?? {
      mode: "sourced-only", minimumCoverage: 80,
      requiredIndicators: seed.metrics.filter((metric) => metric.tier === 1).map((metric) => metric.id),
      approvedIndicators: [],
    },
    years: seed.years,
    chartStartYear: seed.chartStartYear,
    indicators: seed.metrics.map((metric) => ({
      id: metric.id, name: metric.name, explanation: metric.explanation,
      unit: units[metric.unit], prefix: metric.unit === "trillion" ? "$" : "",
      tier: metric.tier, digits: metric.digits, changeKind: metric.changeKind, values: metric.values,
    })),
    weights: Object.fromEntries(seed.metrics.map((metric) => [metric.id, metric.weight])),
    scoreRules: {
      baseline: 50, sensitivity: 50, bullish: 60, bearish: 40,
      factors: Object.fromEntries(seed.metrics.map((metric) => [metric.id, {
        direction: metric.favorableDirection, scale: metric.changeScale,
        trendThreshold: metric.changeKind === "points" ? 0.02 : 0.5,
      }])),
    },
  };
}

export const commodityConfigurations = {
  gold: configure({
    commodity: "gold", name: { en: "Gold", tr: "Altın" }, contextProvider: "gold",
    scoreSources: { dxy: "dxy", "real-rates": "real-yields" },
    priceRelationships: { "etf-holdings": 0.81, dxy: -0.74, "real-rates": -0.65, "central-bank-purchases": 0.48, m2: 0.55 },
    summaryTone: { en: "Monetary conditions and investment demand frame this outlook.", tr: "Bu görünüm parasal koşullar ve yatırım talebi çerçevesinde değerlendirilir." },
    market: { symbol: "GC=F", unit: "oz" },
    dashboardTitle: localized((locale) => messages[locale].macro.goldDashboardTitle),
    scoreTitle: localized((locale) => messages[locale].macro.goldMacroScoreTitle),
    disclosure: localized((locale) => messages[locale].macro.goldMacroSampleNotice),
    source: localized((locale) => messages[locale].macro.source),
    refresh: localized((locale) => messages[locale].macro.refresh),
    methodology: localized((locale) => {
      const t = messages[locale].macro;
      return { title: t.goldMethodTitle, description: t.goldMethodology, formulas: [t.ratioFormula, t.trendFormula, t.stressFormula], sources: t.dataSources };
    }),
  }, {
    ...goldMacroSeed,
    metrics: goldMacroSeed.metrics.map((metric) => ({
      ...metric,
      name: localized((locale) => messages[locale].macro.names[metric.nameKey]),
      explanation: localized((locale) => messages[locale].macro.explanations.goldMacro[metric.id]),
    })),
  }),
  silver: configure({
    commodity: "silver", name: { en: "Silver", tr: "Gümüş" }, contextProvider: "silver",
    scoreSources: { dxy: "dxy", "real-rates": "real-yields" },
    summaryTone: { en: "Industrial demand and monetary conditions both shape silver's backdrop.", tr: "Endüstriyel talep ve parasal koşullar gümüşün görünümünü birlikte şekillendirir." },
    market: { symbol: "SI=F", unit: "oz" },
    dashboardTitle: localized((locale) => messages[locale].macro.silverDashboardTitle),
    scoreTitle: localized((locale) => messages[locale].macro.silverMacroScoreTitle),
    disclosure: localized((locale) => messages[locale].macro.silverMacroSampleNotice),
    source: localized((locale) => messages[locale].macro.source),
    refresh: localized((locale) => messages[locale].macro.refresh),
    methodology: localized((locale) => {
      const t = messages[locale].macro;
      return { title: t.silverMethodTitle, description: t.silverMethodology, formulas: [t.ratioFormula, t.trendFormula, t.stressFormula], sources: t.dataSources };
    }),
  }, silverMacroSeed),
  copper: configure({
    commodity: "copper", name: { en: "Copper", tr: "Bakır" }, contextProvider: "copper",
    scoreSources: { dxy: "dxy", "real-rates": "real-yields" },
    summaryTone: { en: "Manufacturing, electrification and supply availability frame this outlook.", tr: "Bu görünüm imalat, elektrifikasyon ve arz koşulları çerçevesinde değerlendirilir." },
    market: { symbol: "HG=F", unit: "lb" },
    dashboardTitle: localized((locale) => messages[locale].macro.copperDashboardTitle),
    scoreTitle: localized((locale) => messages[locale].macro.copperMacroScoreTitle),
    disclosure: localized((locale) => messages[locale].macro.copperMacroSampleNotice),
    source: localized((locale) => messages[locale].macro.copperSource),
    refresh: localized((locale) => messages[locale].macro.refresh),
    methodology: localized((locale) => {
      const t = messages[locale].macro;
      return { title: t.copperMethodTitle, description: t.copperMethodology, formulas: [t.copperRatioFormula, t.copperTrendFormula], sources: t.copperDataSources };
    }),
  }, copperMacroSeed),
  oil: configure({
    commodity: "oil", name: { en: "Oil", tr: "Petrol" }, contextProvider: "oil",
    scoreSources: { dxy: "dxy" },
    summaryTone: { en: "Physical demand, supply and inventory balances frame oil's backdrop.", tr: "Fiziki talep, arz ve stok dengeleri petrolün görünümünü şekillendirir." },
    market: { symbol: "CL=F", unit: "bbl" },
    dashboardTitle: localized((locale) => messages[locale].macro.oilDashboardTitle),
    scoreTitle: localized((locale) => messages[locale].macro.oilMacroScoreTitle),
    disclosure: localized((locale) => messages[locale].macro.oilMacroSampleNotice),
    source: { en: "Futures quotes may be delayed and are not spot prices.", tr: "Vadeli işlem fiyatları gecikmeli olabilir; spot fiyat değildir." },
    refresh: { en: "Market data is cached for 15 minutes; EIA data for 6 hours.", tr: "Piyasa verisi 15 dakika, EIA verisi 6 saat önbelleklenir." },
    methodology: {
      en: {
        title: "How to read Oil indicators",
        description: "Futures momentum, inventory changes, the dollar and the gold/oil ratio provide market context, not forecasts.",
        formulas: ["The 90-day change compares the latest daily close with the closest close at least 90 days earlier. Inventory change is the weekly difference in U.S. crude stocks excluding SPR; its five-year seasonal average uses the nearest weekly change to the same date in each of the previous five years. Gold/oil is compared with the five-year arithmetic mean of matched daily closes. A positive near-minus-later contract spread indicates backwardation; a negative spread indicates contango."],
        sources: "Yahoo Finance: CL=F and BZ=F (WTI and Brent futures), GC=F (gold futures), DX-Y.NYB (DXY). EIA WCESTUS1: U.S. crude stocks excluding SPR. An EIA API key is required. EIA's futures contract series ended in 2024, so a current spread source is not yet available.",
      },
      tr: {
        title: "Petrol göstergeleri nasıl okunmalı?",
        description: "Vadeli fiyat momentumu, stok değişimi, dolar ve altın/petrol oranı piyasa koşullarına dair bağlam sağlar; tahmin değildir.",
        formulas: ["90 günlük değişim, son günlük kapanışı en az 90 gün önceki kapanışla karşılaştırır. Stok değişimi, SPR hariç haftalık ABD ham petrol stoklarının farkıdır; beş yıllık mevsimsel ortalama önceki beş yılın aynı tarihe en yakın haftalık değişimlerini kullanır. Altın/petrol oranı eşleşen günlük kapanışların beş yıllık aritmetik ortalamasıyla karşılaştırılır. Pozitif yakın vade eksi sonraki vade farkı backwardation, negatif fark contango gösterir."],
        sources: "Yahoo Finance: CL=F ve BZ=F (WTI ve Brent vadeli işlemleri), GC=F (altın vadeli işlemleri), DX-Y.NYB (DXY). EIA WCESTUS1: SPR hariç ABD ham petrol stokları. EIA API anahtarı gerekir. EIA'nın vadeli kontrat serisi 2024'te sonlandığından fark için güncel kaynak henüz yok.",
      },
    },
  }, oilMacroSeed),
} satisfies Record<string, CommodityConfiguration>;

export type CommodityKey = keyof typeof commodityConfigurations;

export function getCommodityConfiguration(commodity: string): CommodityConfiguration | undefined {
  return Object.hasOwn(commodityConfigurations, commodity)
    ? commodityConfigurations[commodity as CommodityKey]
    : undefined;
}