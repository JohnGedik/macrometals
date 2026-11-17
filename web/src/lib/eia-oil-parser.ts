import type { DataObservation, ObservationProvenance } from "@/lib/observation-data";

export const steoOilUrl = "https://www.eia.gov/outlooks/steo/xls/STEO_m.xlsx";
export const spareCapacityUrl = "https://www.eia.gov/outlooks/steo/xls/Fig6.xlsx";
export const eiaOilDefinitions = {
  "eia-oil-demand": { seriesId: "EIA-STEO-PATC_WORLD", code: "patc_world", row: 18, label: "World total", geography: "Global", unit: "million barrels/day", measurement: "rate", headingRow: 17, heading: "Consumption (million barrels per day) (c)" },
  "eia-oil-supply": { seriesId: "EIA-STEO-PAPR_WORLD", code: "papr_world", row: 5, label: "World total", geography: "Global", unit: "million barrels/day", measurement: "rate", headingRow: 4, heading: "Production (million barrels per day) (a)" },
  "eia-oil-inventories": { seriesId: "EIA-STEO-PASC_OECD_T3", code: "pasc_oecd_t3", row: 40, label: "OECD total", geography: "OECD", unit: "million barrels", measurement: "stock", headingRow: 39, heading: "End-of-period commercial crude oil and other liquids inventories (million barrels)" },
} as const;
export const spareCapacitySeriesId = "EIA-STEO-COPS_OPEC-ANNUAL";
export type EiaOilFeeds = Record<keyof typeof eiaOilDefinitions | "eia-oil-spare-capacity", DataObservation[]>;

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function calendar(dates: readonly unknown[][], retrievedAt: number) {
  const edition = dates[0]?.[3];
  if (typeof edition !== "string" || !months.some((month) => new RegExp(`^${month} \\d{4}$`).test(edition))
    || !Number.isFinite(retrievedAt) || retrievedAt <= 0 || dates[12]?.[1] !== "Historical") {
    throw new Error("EIA STEO calendar metadata is invalid");
  }
  const [month, year] = edition.split(" ");
  if (Date.UTC(Number(year), months.indexOf(month), 1) / 1000 > retrievedAt) throw new Error("EIA STEO edition is in the future");
  const periods = dates[10]?.slice(2);
  if (!periods?.length) throw new Error("EIA STEO calendar is empty");
  let forecastStarted = false;
  const history = new Set<string>();
  const columns = periods.map((period, index) => {
    const text = String(period);
    const historical = dates[12]?.[index + 2];
    if (!/^\d{4}(?:0[1-9]|1[0-2])$/.test(text) || ![0, 1].includes(Number(historical)) || typeof historical !== "number") {
      throw new Error("EIA STEO historical flag or period is invalid");
    }
    if (index && Number(period) !== Number(periods[index - 1]) + (text.endsWith("01") ? 89 : 1)) {
      throw new Error("EIA STEO calendar is not consecutive");
    }
    if (!historical) forecastStarted = true;
    else if (forecastStarted) throw new Error("EIA STEO historical flags are not consecutive");
    const start = `${text.slice(0, 4)}-${text.slice(4)}-01`;
    const end = new Date(Date.UTC(Number(text.slice(0, 4)), Number(text.slice(4)), 0)).toISOString().slice(0, 10);
    if (historical) history.add(start.slice(0, 7));
    return { column: index + 2, start, end, historical: historical === 1 };
  });
  if (!history.size) throw new Error("EIA STEO has no historical periods");
  return { edition, columns, history };
}

function provenance(seriesId: string, sourceUrl: string, edition: string, date: string, value: number,
  unit: string, geography: string, measurement: "stock" | "rate", aggregation: ObservationProvenance["aggregation"], retrievedAt: number): ObservationProvenance {
  return {
    provider: "U.S. Energy Information Administration", seriesId, sourceUrl, sourceDate: date,
    retrievedAt, publishedAt: null, vintage: `STEO ${edition}`, revisionStatus: "unknown", valueType: "estimate",
    geography, measurement, rawValue: value, rawUnit: unit, normalizedUnit: unit, multiplier: 1,
    seasonalAdjustment: "not-applicable", aggregation,
  };
}

export function parseSteoOil(dates: readonly unknown[][], table: readonly unknown[][], retrievedAt = Date.now() / 1000) {
  const { edition, columns } = calendar(dates, retrievedAt);
  if (table[0]?.[1] !== "Table 3a.  World Petroleum and Other Liquid Fuels Production, Consumption, and Inventories"
    || typeof table[1]?.[1] !== "string" || !table[1][1].endsWith(`- ${edition}`)) {
    throw new Error("EIA STEO table identity or edition is invalid");
  }
  return Object.fromEntries(Object.entries(eiaOilDefinitions).map(([id, definition]) => {
    const row = table[definition.row];
    if (row?.[0] !== definition.code || row[1] !== definition.label || table[definition.headingRow]?.[1] !== definition.heading) {
      throw new Error(`EIA STEO series identity or units are invalid: ${definition.code}`);
    }
    const observations = columns.filter((period) => period.historical).map(({ column, start, end }): DataObservation => {
      const value = row[column];
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`EIA STEO historical value is invalid: ${definition.code}`);
      const time = Date.parse(`${end}T12:00:00Z`) / 1000;
      if (time > retrievedAt) throw new Error("EIA STEO historical period is in the future");
      return { time, value, reportingPeriod: { start, end, label: start.slice(0, 7), frequency: "monthly" },
        provenance: provenance(definition.seriesId, steoOilUrl, edition, end, value, definition.unit, definition.geography,
          definition.measurement, definition.measurement === "stock" ? "month-end" : "monthly-average", retrievedAt) };
    });
    return [id, observations];
  })) as Pick<EiaOilFeeds, keyof typeof eiaOilDefinitions>;
}

export function parseEiaSpareCapacity(dates: readonly unknown[][], figure: readonly unknown[][], retrievedAt = Date.now() / 1000): DataObservation[] {
  const { edition, history } = calendar(dates, retrievedAt);
  if (figure[1]?.[0] !== `U.S. Energy Information Administration, Short-Term Energy Outlook, ${edition}`
    || figure[5]?.[16] !== "OPEC surplus crude oil production capacity" || figure[5]?.[17] !== "COPS_OPEC"
    || String(figure[25]?.[2]).trim() !== "(million barrels/day)" || figure[26]?.[2] !== "surplus capacity"
    || figure[27]?.[1] !== "Year" || figure[45]?.[2] !== "Forecast") {
    throw new Error("EIA spare capacity figure identity, units or edition is invalid");
  }
  const observations: DataObservation[] = [];
  for (const row of figure.slice(28, 42)) {
    const year = row[1];
    if (typeof year !== "number" || !Number.isInteger(year)) throw new Error("EIA spare capacity year is invalid");
    // Only years explicitly historical for all twelve months in this STEO edition.
    if (!months.every((_, index) => history.has(`${year}-${String(index + 1).padStart(2, "0")}`))) continue;
    const value = row[2];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error("EIA spare capacity historical value is invalid");
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    const time = Date.parse(`${end}T12:00:00Z`) / 1000;
    if (time > retrievedAt || observations.some((point) => point.time >= time)) throw new Error("EIA spare capacity years are invalid");
    observations.push({ time, value, reportingPeriod: { start, end, label: String(year), frequency: "annual" },
      provenance: provenance(spareCapacitySeriesId, spareCapacityUrl, edition, end, value, "million barrels/day", "OPEC", "rate", "annual-average", retrievedAt) });
  }
  if (!observations.length) throw new Error("EIA spare capacity has no verified historical years");
  return observations;
}
