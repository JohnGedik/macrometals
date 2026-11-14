import type { DataObservation } from "@/lib/observation-data";

export const gprSeriesId = "CALDARA-IACOVIELLO-GPR-RECENT-MONTHLY";
export const gprDownloadUrl = "https://www.matteoiacoviello.com/gpr_files/data_gpr_export.xls";
export const gprSourceUrl = "https://www.matteoiacoviello.com/gpr.htm";

function monthFromExcelSerial(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 31048) return null;
  const date = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
  if (!Number.isFinite(date.getTime()) || date.getUTCDate() !== 1) return null;
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function parseRecentGprRows(rows: readonly (readonly unknown[])[], retrievedAt = Date.now() / 1000): DataObservation[] {
  if (!rows.length || !Number.isFinite(retrievedAt) || retrievedAt <= 0) return [];
  const headerIndex = rows.findIndex((row) => row.some((value) => value === "month") && row.some((value) => value === "GPR"));
  if (headerIndex < 0) return [];
  const header = rows[headerIndex];
  const monthIndex = header.indexOf("month");
  const gprIndex = header.indexOf("GPR");
  const variableIndex = header.indexOf("var_name");
  const labelIndex = header.indexOf("var_label");
  if (monthIndex < 0 || gprIndex < 0 || variableIndex < 0 || labelIndex < 0) return [];
  const recentGprMetadata = rows.slice(headerIndex + 1).some((row) =>
    row[variableIndex] === "GPR" && typeof row[labelIndex] === "string" && row[labelIndex].startsWith("Recent GPR (Index: 1985:2019="));
  if (!recentGprMetadata) return [];

  const points: DataObservation[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const serial = row[monthIndex];
    const value = row[gprIndex];
    if (value === null || value === undefined || value === "") continue;
    const calendarMonth = monthFromExcelSerial(serial);
    if (!calendarMonth || typeof value !== "number" || !Number.isFinite(value) || value < 0) return [];
    const { year, month } = calendarMonth;
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const time = Date.parse(`${end}T12:00:00Z`) / 1000;
    if (time > retrievedAt) continue;
    points.push({
      time,
      value,
      reportingPeriod: { start, end, label: start.slice(0, 7), frequency: "monthly" },
      provenance: {
        provider: "Caldara and Iacoviello",
        seriesId: gprSeriesId,
        sourceUrl: gprSourceUrl,
        sourceDate: start,
        retrievedAt,
        publishedAt: null,
        vintage: new Date(retrievedAt * 1000).toISOString().slice(0, 10),
        revisionStatus: "unknown",
        valueType: "reported",
        geography: "Global",
        measurement: "index",
        rawValue: value,
        rawUnit: "index points (1985-2019=100)",
        normalizedUnit: "index points",
        multiplier: 1,
        seasonalAdjustment: "not-applicable",
        aggregation: "monthly-index",
      },
    });
  }
  const unique = new Map<number, DataObservation>();
  for (const point of points) {
    const previous = unique.get(point.time);
    if (previous && previous.value !== point.value) return [];
    unique.set(point.time, point);
  }
  const sorted = [...unique.values()].sort((first, second) => first.time - second.time);
  const latest = sorted.at(-1);
  if (latest?.provenance) latest.provenance.revisionStatus = "preliminary";
  return sorted;
}
