export type ReportingFrequency = "daily" | "weekly" | "monthly" | "quarterly" | "annual";
export type ReportingPeriod = { start: string; end: string; label: string; frequency: ReportingFrequency };
export type ObservationProvenance = {
  provider: string;
  seriesId: string;
  sourceUrl: string;
  sourceDate: string;
  retrievedAt: number;
  publishedAt: number | null;
  vintage: string | null;
  revisionStatus: "unknown" | "preliminary" | "revised" | "final";
  valueType: "reported" | "estimate" | "forecast";
  geography: string;
  measurement: "stock" | "flow" | "rate" | "index";
  rawValue: number;
  rawUnit: string;
  normalizedUnit: string;
  multiplier: number;
  seasonalAdjustment: "SA" | "NSA" | "not-applicable";
  aggregation: "daily-observation" | "weekly-report" | "monthly-average" | "monthly-sum" | "monthly-index" | "month-end" | "annual-total" | "annual-average" | "year-end";
};
export type DataObservation = { time: number; value: number; reportingPeriod?: ReportingPeriod; provenance?: ObservationProvenance };
export type FredSeriesDefinition = {
  seriesId: string;
  frequency: "daily" | "monthly";
  rawUnit: string;
  normalizedUnit: string;
  multiplier: number;
  measurement: "stock" | "rate" | "index";
  seasonalAdjustment: "SA" | "NSA";
};

export const fredSeriesDefinitions = {
  DFII10: { seriesId: "DFII10", frequency: "daily", rawUnit: "percent", normalizedUnit: "percent", multiplier: 1, measurement: "rate", seasonalAdjustment: "NSA" },
  T5YIE: { seriesId: "T5YIE", frequency: "daily", rawUnit: "percent", normalizedUnit: "percent", multiplier: 1, measurement: "rate", seasonalAdjustment: "NSA" },
  T10YIE: { seriesId: "T10YIE", frequency: "daily", rawUnit: "percent", normalizedUnit: "percent", multiplier: 1, measurement: "rate", seasonalAdjustment: "NSA" },
  M2SL: { seriesId: "M2SL", frequency: "monthly", rawUnit: "USD billions", normalizedUnit: "USD trillions", multiplier: 0.001, measurement: "stock", seasonalAdjustment: "SA" },
  DTWEXBGS: { seriesId: "DTWEXBGS", frequency: "daily", rawUnit: "index points (Jan 2006=100)", normalizedUnit: "index points", multiplier: 1, measurement: "index", seasonalAdjustment: "NSA" },
} satisfies Record<string, FredSeriesDefinition>;

function validDate(date: string) {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === date;
}

export function fredApiResponseToCsv(payload: unknown, seriesId: string) {
  if (!payload || typeof payload !== "object" || !("observations" in payload) || !Array.isArray(payload.observations)) return null;
  const rows: string[] = [];
  for (const observation of payload.observations) {
    if (!observation || typeof observation !== "object" || !("date" in observation) || typeof observation.date !== "string"
      || !("value" in observation) || typeof observation.value !== "string"
      || !validDate(observation.date) || observation.value !== "." && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(observation.value)) return null;
    rows.push(`${observation.date},${observation.value}`);
  }
  return [`observation_date,${seriesId}`, ...rows].join("\n");
}

export function availableObservation(point: DataObservation, asOf: number) {
  if (!Number.isFinite(point.time) || !Number.isFinite(new Date(point.time * 1000).getTime()) || point.time > asOf || !Number.isFinite(point.value)) return false;
  const period = point.reportingPeriod;
  if (period && (!validDate(period.start) || !validDate(period.end) || period.start > period.end
    || new Date(point.time * 1000).toISOString().slice(0, 10) !== period.end)) return false;
  const provenance = point.provenance;
  if (!provenance) return true;
  return provenance.valueType !== "forecast" && Number.isFinite(provenance.retrievedAt) && provenance.retrievedAt <= asOf
    && (provenance.publishedAt === null || Number.isFinite(provenance.publishedAt) && provenance.publishedAt <= asOf)
    && Number.isFinite(provenance.rawValue) && Number.isFinite(provenance.multiplier) && provenance.multiplier > 0
    && provenance.rawUnit.length > 0 && provenance.normalizedUnit.length > 0
    && Math.abs(provenance.rawValue * provenance.multiplier - point.value) <= Math.max(1, Math.abs(point.value)) * 1e-10;
}

export function parseFredObservations(csv: string, definition: FredSeriesDefinition, retrievedAt = Date.now() / 1000): DataObservation[] {
  const rows = csv.trim().split(/\r?\n/);
  const header = rows.shift()?.replace(/^\uFEFF/, "").split(",");
  if (!header || !["observation_date", "DATE"].includes(header[0]) || header[1] !== definition.seriesId || header.length !== 2
    || !Number.isFinite(definition.multiplier) || definition.multiplier <= 0 || !Number.isFinite(retrievedAt)) return [];
  const observations = rows.flatMap((row): DataObservation[] => {
    const fields = row.split(",");
    if (fields.length !== 2) return [];
    const [sourceDate, raw] = fields.map((field) => field.trim());
    if (!validDate(sourceDate) || !raw || raw === "." || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) return [];
    const rawValue = Number(raw);
    const value = rawValue * definition.multiplier;
    if (!Number.isFinite(value) || (definition.measurement === "stock" && value < 0)) return [];
    const start = definition.frequency === "monthly" ? `${sourceDate.slice(0, 7)}-01` : sourceDate;
    if (definition.frequency === "monthly" && sourceDate !== start) return [];
    const end = definition.frequency === "monthly"
      ? new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)), 0)).toISOString().slice(0, 10) : start;
    const time = Date.parse(`${end}T12:00:00Z`) / 1000;
    if (time > retrievedAt) return [];
    return [{ time, value,
      reportingPeriod: { start, end, label: definition.frequency === "monthly" ? start.slice(0, 7) : start, frequency: definition.frequency },
      provenance: {
        provider: "FRED", seriesId: definition.seriesId, sourceUrl: `https://fred.stlouisfed.org/series/${definition.seriesId}`, sourceDate,
        retrievedAt, publishedAt: null, vintage: null, revisionStatus: "unknown", valueType: "reported", geography: "United States",
        measurement: definition.measurement, rawValue, rawUnit: definition.rawUnit, normalizedUnit: definition.normalizedUnit,
        multiplier: definition.multiplier, seasonalAdjustment: definition.seasonalAdjustment,
        aggregation: definition.frequency === "monthly" ? "monthly-average" : "daily-observation",
      },
    }];
  });
  const unique = new Map<number, DataObservation>();
  for (const point of observations) {
    const existing = unique.get(point.time);
    if (existing && existing.value !== point.value) return [];
    unique.set(point.time, point);
  }
  return [...unique.values()].sort((first, second) => first.time - second.time);
}

export function periodComparison(current: DataObservation, history: readonly DataObservation[], months: number): DataObservation | null | undefined {
  const period = current.reportingPeriod;
  if (!period || period.frequency === "daily" || period.frequency === "weekly") return undefined;
  if (period.frequency === "annual" && months !== 12 || period.frequency === "quarterly" && months % 3 !== 0) return null;
  const target = new Date(`${period.start}T00:00:00Z`);
  if (!Number.isFinite(target.getTime())) return null;
  target.setUTCMonth(target.getUTCMonth() - months);
  const targetStart = target.toISOString().slice(0, 10);
  return history.findLast((point) => point.reportingPeriod?.frequency === period.frequency && point.reportingPeriod.start === targetStart
    && point.time < current.time && Number.isFinite(point.value)) ?? null;
}

export function monthlyPeriodIsRecent(point: DataObservation, checkedAt: number, maxLagMonths: number) {
  if (point.reportingPeriod?.frequency !== "monthly") return false;
  const start = new Date(`${point.reportingPeriod.start}T00:00:00Z`);
  const now = new Date(checkedAt * 1000);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(now.getTime())) return false;
  const lag = (now.getUTCFullYear() - start.getUTCFullYear()) * 12 + now.getUTCMonth() - start.getUTCMonth();
  return lag >= 1 && lag <= maxLagMonths && point.time <= checkedAt;
}

export function annualPeriodIsRecent(point: DataObservation, checkedAt: number, maxLagMonths: number) {
  const period = point.reportingPeriod;
  if (period?.frequency !== "annual" || !/^\d{4}-01-01$/.test(period.start)
    || period.end !== `${period.start.slice(0, 4)}-12-31`) return false;
  const now = new Date(checkedAt * 1000);
  const lag = (now.getUTCFullYear() - Number(period.start.slice(0, 4))) * 12 + now.getUTCMonth() - 11;
  return lag >= 1 && lag <= maxLagMonths && point.time <= checkedAt;
}