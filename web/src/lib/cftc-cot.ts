import type { DataObservation } from "@/lib/observation-data";

export const cftcGoldCotSeriesId = "CFTC-72HH-3QPY-088691-MANAGED-MONEY-NET";
export const cftcGoldCotApiUrl = "https://publicreporting.cftc.gov/resource/72hh-3qpy.json";
export const cftcGoldCotSourceUrl = "https://publicreporting.cftc.gov/stories/s/r4w3-av2u";

type CftcGoldCotRow = {
  cftc_contract_market_code: unknown;
  report_date_as_yyyy_mm_dd: unknown;
  m_money_positions_long_all: unknown;
  m_money_positions_short_all: unknown;
};

function isRecord(value: unknown): value is CftcGoldCotRow {
  return typeof value === "object" && value !== null;
}

function reportDate(value: unknown) {
  if (typeof value !== "string") return null;
  const date = value.match(/^(\d{4}-\d{2}-\d{2})(?:T00:00:00(?:\.000)?Z?)?$/)?.[1];
  if (!date) return null;
  const timestamp = Date.parse(`${date}T12:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date ? date : null;
}

function contracts(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "string" && !/^\d+$/.test(value)) return null;
  const result = Number(value);
  return Number.isSafeInteger(result) && result >= 0 ? result : null;
}

export function parseCftcGoldManagedMoney(payload: unknown, retrievedAt = Date.now() / 1000): DataObservation[] {
  if (!Array.isArray(payload) || !payload.length || !Number.isFinite(retrievedAt) || retrievedAt <= 0) return [];
  const rows: DataObservation[] = [];
  for (const raw of payload) {
    if (!isRecord(raw) || raw.cftc_contract_market_code !== "088691") return [];
    const date = reportDate(raw.report_date_as_yyyy_mm_dd);
    const long = contracts(raw.m_money_positions_long_all);
    const short = contracts(raw.m_money_positions_short_all);
    if (!date || long === null || short === null) return [];
    const time = Date.parse(`${date}T12:00:00Z`) / 1000;
    const netContracts = long - short;
    rows.push({
      time,
      value: netContracts / 1000,
      reportingPeriod: { start: date, end: date, label: date, frequency: "weekly" },
      provenance: {
        provider: "Commodity Futures Trading Commission",
        seriesId: cftcGoldCotSeriesId,
        sourceUrl: cftcGoldCotSourceUrl,
        sourceDate: date,
        retrievedAt,
        publishedAt: null,
        vintage: null,
        revisionStatus: "unknown",
        valueType: "reported",
        geography: "United States",
        measurement: "stock",
        rawValue: netContracts,
        rawUnit: "contracts",
        normalizedUnit: "thousand contracts",
        multiplier: 0.001,
        seasonalAdjustment: "not-applicable",
        aggregation: "weekly-report",
      },
    });
  }
  const unique = new Map<number, DataObservation>();
  for (const point of rows) {
    const existing = unique.get(point.time);
    if (existing && existing.value !== point.value) return [];
    unique.set(point.time, point);
  }
  return [...unique.values()].sort((first, second) => first.time - second.time);
}
