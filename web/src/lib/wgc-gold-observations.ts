import snapshot from "./wgc-gold-observations.json" with { type: "json" };
import type { DataObservation } from "@/lib/observation-data";

export const wgcCentralBankSeriesId = "WGC-CENTRAL-BANK-REPORTED-CHANGES";
export const wgcEtfSeriesId = "WGC-GLOBAL-ETF-HOLDINGS";

const centralBankSourceUrl = "https://www.gold.org/goldhub/data/gold-reserves-by-country";
const etfSourceUrl = "https://www.gold.org/goldhub/data/gold-etfs-holdings-and-flows";

function observations(
  rows: readonly (readonly (string | number)[])[],
  seriesId: string,
  sourceUrl: string,
  measurement: "flow" | "stock",
  aggregation: "monthly-sum" | "month-end",
): DataObservation[] {
  if (!Number.isFinite(snapshot.generatedAt) || snapshot.generatedAt <= 0) return [];
  return rows.map((row) => {
    const [month, value] = row;
    if (row.length !== 2 || typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)
      || typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`Invalid generated WGC observation for ${seriesId}`);
    }
    const [year, monthNumber] = month.split("-").map(Number);
    const start = `${month}-01`;
    const end = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
    return {
      time: Date.parse(`${end}T12:00:00Z`) / 1000,
      value,
      reportingPeriod: { start, end, label: month, frequency: "monthly" as const },
      provenance: {
        provider: "World Gold Council",
        seriesId,
        sourceUrl,
        sourceDate: end,
        retrievedAt: snapshot.generatedAt,
        publishedAt: null,
        vintage: null,
        revisionStatus: "unknown" as const,
        valueType: "reported" as const,
        geography: "Global",
        measurement,
        rawValue: value,
        rawUnit: "tonnes",
        normalizedUnit: "tonnes",
        multiplier: 1,
        seasonalAdjustment: "not-applicable" as const,
        aggregation,
      },
    };
  });
}

export const wgcObservationFeeds = {
  "wgc-central-bank": observations(
    snapshot.centralBankNetChanges,
    wgcCentralBankSeriesId,
    centralBankSourceUrl,
    "flow",
    "monthly-sum",
  ),
  "wgc-etf-holdings": observations(
    snapshot.etfHoldingsTonnes,
    wgcEtfSeriesId,
    etfSourceUrl,
    "stock",
    "month-end",
  ),
} satisfies Record<string, DataObservation[]>;
