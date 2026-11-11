export type GoldMetricId =
  | "real-rates"
  | "dxy"
  | "central-bank-purchases"
  | "etf-holdings"
  | "breakeven"
  | "m2"
  | "geopolitical-risk"
  | "cot-positioning";

export type GoldMetricSeed = {
  id: GoldMetricId;
  nameKey: "realRates" | "dxy" | "centralBankPurchases" | "etfHoldings" | "breakeven" | "m2" | "geopoliticalRisk" | "cotPositioning";
  unit: "percent" | "index" | "tonnes" | "trillion" | "thousand-contracts";
  tier: 1 | 2;
  digits: number;
  changeKind: "percentage" | "points";
  favorableDirection: -1 | 1;
  changeScale: number;
  weight: number;
  values: readonly number[];
};

export const goldMacroSeed = {
  years: [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025],
  chartStartYear: 2016,
  asOfYear: 2025,
  disclosureKey: "goldMacroSampleNotice",
  metrics: [
    { id: "real-rates", nameKey: "realRates", tier: 1, unit: "percent", digits: 2, changeKind: "points", favorableDirection: -1, changeScale: 0.75, weight: 25, values: [1.12, 0.45, 0.46, 1.05, 0.21, -0.95, -1.04, 1.58, 1.72, 2.03, 1.82] },
    { id: "dxy", nameKey: "dxy", tier: 1, unit: "index", digits: 1, changeKind: "percentage", favorableDirection: -1, changeScale: 5, weight: 20, values: [98.6, 102.2, 92.1, 96.2, 96.4, 89.9, 95.7, 103.5, 101.3, 108.5, 98.3] },
    { id: "central-bank-purchases", nameKey: "centralBankPurchases", tier: 1, unit: "tonnes", digits: 0, changeKind: "percentage", favorableDirection: 1, changeScale: 20, weight: 15, values: [578, 383, 374, 656, 605, 255, 450, 1082, 1050, 1045, 900] },
    { id: "etf-holdings", nameKey: "etfHoldings", tier: 1, unit: "tonnes", digits: 0, changeKind: "percentage", favorableDirection: 1, changeScale: 10, weight: 15, values: [1500, 1700, 1770, 1800, 2900, 3800, 3600, 3500, 3200, 3100, 3800] },
    { id: "breakeven", nameKey: "breakeven", tier: 2, unit: "percent", digits: 2, changeKind: "points", favorableDirection: 1, changeScale: 0.25, weight: 5, values: [1.58, 1.99, 2.0, 1.63, 1.69, 2.0, 2.76, 2.16, 2.27, 2.29, 2.34] },
    { id: "m2", nameKey: "m2", tier: 2, unit: "trillion", digits: 1, changeKind: "percentage", favorableDirection: 1, changeScale: 5, weight: 10, values: [12.3, 13.3, 13.7, 14.4, 15.4, 19.1, 21.6, 21.2, 20.8, 21.5, 22.2] },
    { id: "geopolitical-risk", nameKey: "geopoliticalRisk", tier: 2, unit: "index", digits: 0, changeKind: "percentage", favorableDirection: 1, changeScale: 30, weight: 5, values: [80, 85, 72, 91, 79, 105, 95, 175, 125, 110, 155] },
    { id: "cot-positioning", nameKey: "cotPositioning", tier: 2, unit: "thousand-contracts", digits: 0, changeKind: "percentage", favorableDirection: 1, changeScale: 20, weight: 5, values: [150, 80, 90, 120, 140, 110, 220, 250, 180, 210, 165] },
  ] satisfies readonly GoldMetricSeed[],
};
