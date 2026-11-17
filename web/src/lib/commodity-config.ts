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
      scoreMode: metric.scoreMode, currentValue: metric.currentValue,
      ...(metric.id === "gold-seasonality" ? { dataHealth: {
        kind: "sourced" as const, status: "fresh" as const, source: "Monthly gold seasonality profile",
        frequency: "monthly" as const, observedAt: null, checkedAt: Date.now() / 1000,
      } } : {}),
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
    scoringPolicy: {
      mode: "sourced-only", minimumCoverage: 80,
      requiredIndicators: ["real-rates", "gold-seasonality", "dxy", "central-bank-purchases", "etf-holdings"],
      approvedIndicators: ["gold-seasonality", "real-rates", "dxy", "breakeven", "central-bank-purchases", "etf-holdings", "cot-positioning"],
    },
    scoreSources: {
      dxy: "dxy",
      "real-rates": "real-yields",
      m2: "m2",
      breakeven: "breakeven-5y",
      "central-bank-purchases": "wgc-central-bank",
      "etf-holdings": "wgc-etf-holdings",
      "cot-positioning": "cftc-gold-cot",
      "geopolitical-risk": "gpr",
    },
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
      name: metric.id === "dxy" ? localized((locale) => messages[locale].macro.names.broadDollarIndex)
        : metric.id === "m2" ? { en: "U.S. M2 Money Supply", tr: "ABD M2 Para Arzı" }
        : metric.id === "breakeven" ? { en: "5-Year U.S. Breakeven Inflation", tr: "5 Yıllık ABD Başabaş Enflasyonu" }
        : localized((locale) => messages[locale].macro.names[metric.nameKey]),
      explanation: localized((locale) => messages[locale].macro.explanations.goldMacro[metric.id]),
    })),
  }),
  silver: configure({
    commodity: "silver", name: { en: "Silver", tr: "Gümüş" }, contextProvider: "silver",
    scoringPolicy: {
      mode: "sourced-only", minimumCoverage: 0,
      requiredIndicators: [],
      approvedIndicators: ["industrial-demand", "solar-demand", "etf-holdings", "mine-supply", "breakeven", "cot-positioning", "real-rates", "dxy"],
    },
    scoreSources: {
      dxy: "dxy", "real-rates": "real-yields",
      "industrial-demand": "silver-industrial-demand", "solar-demand": "silver-solar-demand",
      "etf-holdings": "silver-etp-holdings", "mine-supply": "silver-mine-supply",
      breakeven: "breakeven-10y", "cot-positioning": "cftc-silver-cot",
    },
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
    scoringPolicy: {
      mode: "sourced-only", minimumCoverage: 0,
      requiredIndicators: [],
      approvedIndicators: ["dxy", "real-rates"],
    },
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
  }, {
    ...copperMacroSeed,
    metrics: copperMacroSeed.metrics.map((metric) => ({
      ...metric,
      name: metric.id === "dxy" ? localized((locale) => messages[locale].macro.names.broadDollarIndex) : metric.name,
    })),
  }),
  oil: configure({
    commodity: "oil", name: { en: "Oil", tr: "Petrol" }, contextProvider: "oil",
    scoringPolicy: {
      mode: "sourced-only", minimumCoverage: 0, requiredIndicators: [],
      approvedIndicators: ["global-demand", "global-supply", "commercial-inventories", "spare-capacity", "dxy", "geopolitical-risk", "cot-positioning"],
    },
    scoreSources: {
      dxy: "dxy", "geopolitical-risk": "gpr", "cot-positioning": "cftc-wti-cot",
      "global-demand": "eia-oil-demand", "global-supply": "eia-oil-supply",
      "commercial-inventories": "eia-oil-inventories", "spare-capacity": "eia-oil-spare-capacity",
    },
    summaryTone: { en: "Physical demand, supply and inventory balances frame oil's backdrop.", tr: "Fiziki talep, arz ve stok dengeleri petrolün görünümünü şekillendirir." },
    market: { symbol: "CL=F", unit: "bbl" },
    dashboardTitle: localized((locale) => messages[locale].macro.oilDashboardTitle),
    scoreTitle: localized((locale) => messages[locale].macro.oilMacroScoreTitle),
    disclosure: localized((locale) => messages[locale].macro.oilMacroSampleNotice),
    source: { en: "Futures quotes may be delayed and are not spot prices.", tr: "Vadeli işlem fiyatları gecikmeli olabilir; spot fiyat değildir." },
    refresh: { en: "EIA STEO and GPR downloads are cached for one hour. FRED and CFTC refresh on request. Market quotes require separate permissions.", tr: "EIA STEO ve GPR indirmeleri bir saat önbellekte tutulur. FRED ve CFTC istek üzerine yenilenir. Piyasa fiyatları ayrı izin gerektirir." },
    methodology: {
      en: {
        title: "How to read Oil indicators",
        description: "The score uses historical EIA liquids demand/supply estimates, OECD commercial stocks, annual OPEC surplus capacity, the broad dollar, GPR and WTI positioning. Refineries remain unavailable. Eligible weights are normalized; coverage is disclosed. These are heuristics, not forecasts.",
        formulas: ["The 90-day change compares the latest daily close with the closest close at least 90 days earlier. Inventory change is the weekly difference in U.S. crude stocks excluding SPR; its five-year seasonal average uses the nearest weekly change to the same date in each of the previous five years. Gold/oil is compared with the five-year arithmetic mean of matched daily closes. A positive near-minus-later contract spread indicates backwardation; a negative spread indicates contango."],
        sources: "EIA STEO Table 3a: PATC_WORLD, PAPR_WORLD, PASC_OECD_T3; Fig6: annual-average COPS_OPEC. Only Dates-sheet historical periods are used; forecasts are excluded. FRED DTWEXBGS is not ICE DXY. Caldara-Iacoviello Recent GPR (CC BY 4.0); CFTC Disaggregated Futures Only, WTI Physical 067651, Managed Money long minus short. These feeds need no EIA key. Separate weekly U.S. inventory context (WCESTUS1) requires an EIA API key; market context requires Yahoo permissions. The WTI curve remains unavailable.",
      },
      tr: {
        title: "Petrol göstergeleri nasıl okunmalı?",
        description: "Puan; EIA tarihsel sıvı yakıt arz-talep tahminlerini, OECD ticari stoklarını, yıllık OPEC yedek kapasitesini, geniş dolar endeksini, GPR ve WTI pozisyonlarını kullanır. Rafineri verisi mevcut değildir. Uygun ağırlıklar normalize edilir; kapsam açıklanır. Bunlar öngörü değil, sezgisel göstergelerdir.",
        formulas: ["90 günlük değişim, son günlük kapanışı en az 90 gün önceki kapanışla karşılaştırır. Stok değişimi, SPR hariç haftalık ABD ham petrol stoklarının farkıdır; beş yıllık mevsimsel ortalama önceki beş yılın aynı tarihe en yakın haftalık değişimlerini kullanır. Altın/petrol oranı eşleşen günlük kapanışların beş yıllık aritmetik ortalamasıyla karşılaştırılır. Pozitif yakın vade eksi sonraki vade farkı backwardation, negatif fark contango gösterir."],
        sources: "EIA STEO Tablo 3a: PATC_WORLD, PAPR_WORLD, PASC_OECD_T3; Fig6: yıllık ortalama COPS_OPEC. Yalnızca Dates sayfasında tarihsel olarak işaretlenen dönemler kullanılır; öngörüler hariçtir. FRED DTWEXBGS, ICE DXY değildir. Caldara-Iacoviello Recent GPR (CC BY 4.0); CFTC yalnızca vadeli işlemler, WTI Physical 067651, fonların uzun eksi kısa pozisyonları. Bu kaynaklar EIA anahtarı gerektirmez. Ayrı haftalık ABD stok bağlamı (WCESTUS1) EIA anahtarı, piyasa bağlamı Yahoo izinleri gerektirir. WTI vade eğrisi mevcut değildir.",
      },
    },
  }, {
    ...oilMacroSeed,
    metrics: oilMacroSeed.metrics.map((metric) => ({
      ...metric,
      name: metric.id === "dxy" ? localized((locale) => messages[locale].macro.names.broadDollarIndex) : metric.name,
      explanation: metric.id === "commercial-inventories" ? {
        en: "Declining OECD commercial crude oil and other liquids stocks can indicate tighter balances. These monthly end-of-period levels are separate from weekly U.S. crude inventory changes.",
        tr: "Azalan OECD ticari ham petrol ve diğer sıvı stokları daha dar dengelere işaret edebilir. Aylık dönem sonu seviyeleri haftalık ABD ham petrol stok değişimlerinden ayrıdır.",
      } : metric.id === "spare-capacity" ? {
        en: "Lower OPEC surplus crude oil production capacity reduces the disruption buffer. This factor uses EIA annual-average historical estimates, not monthly readings or future forecasts.",
        tr: "Düşük OPEC yedek ham petrol üretim kapasitesi kesintilere karşı tamponu küçültür. Bu faktör aylık veri veya gelecek öngörüleri değil, EIA yıllık ortalama tarihsel tahminlerini kullanır.",
      } : metric.explanation,
    })),
  }),
} satisfies Record<string, CommodityConfiguration>;

export type CommodityKey = keyof typeof commodityConfigurations;

export function getCommodityConfiguration(commodity: string): CommodityConfiguration | undefined {
  return Object.hasOwn(commodityConfigurations, commodity)
    ? commodityConfigurations[commodity as CommodityKey]
    : undefined;
}