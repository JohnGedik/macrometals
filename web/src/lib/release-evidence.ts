import { load } from "cheerio";
import type { DataObservation } from "@/lib/observation-data";

export const h6ReleaseIndexUrl = "https://www.federalreserve.gov/releases/h6/default.htm";
export const h6ReleaseDatesUrl = "https://www.federalreserve.gov/releases/h6/releaseDates.json";
export type ReleaseEvidence = {
  status: "matched" | "behind" | "mismatch" | "unknown";
  sourceUrl: string;
  checkedAt: number;
  releaseDate?: string;
  referencePeriod?: string;
};

export function latestH6Release(payload: unknown, checkedAt: number) {
  const instant = new Date(checkedAt * 1000);
  if (!Number.isFinite(instant.getTime()) || !Array.isArray(payload) || !payload.length || payload.length > 200) return null;
  const today = instant.toISOString().slice(0, 10);
  const dates: string[] = [];
  for (const year of payload) {
    if (!year || typeof year !== "object" || !/^\d{4}$/.test(year.yearValue) || !Array.isArray(year.Months)) return null;
    for (const month of year.Months) {
      if (!month || typeof month !== "object" || typeof month.MonthValue !== "string"
        || !/^\d{6}$/.test(month.MonthValue) || !month.MonthValue.startsWith(year.yearValue) || !Array.isArray(month.Dates)) return null;
      for (const value of month.Dates) {
        if (typeof value !== "string" || !/^\d{8}\*{0,3}$/.test(value) || !value.startsWith(month.MonthValue)) return null;
        const date = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
        const time = Date.parse(`${date}T00:00:00Z`);
        if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== date) return null;
        if (date <= today) dates.push(date);
      }
    }
  }
  const date = dates.sort().at(-1);
  return date ? { date, url: `https://www.federalreserve.gov/releases/h6/${date.replaceAll("-", "")}/default.htm` } : null;
}

export function compareH6Release(html: string, releaseDate: string, point: DataObservation, checkedAt: number): ReleaseEvidence {
  const sourceUrl = `https://www.federalreserve.gov/releases/h6/${releaseDate.replaceAll("-", "")}/default.htm`;
  const unknown: ReleaseEvidence = { status: "unknown", sourceUrl, checkedAt };
  if (html.length > 2_097_152 || point.provenance?.seriesId !== "M2SL") return unknown;
  const page = load(html);
  const dateText = page(".dates").text().replace(/\s+/g, " ").trim();
  const declared = /^Release Date:\s*([A-Za-z]+ \d{1,2}, \d{4})$/.exec(dateText);
  const declaredTime = declared ? Date.parse(`${declared[1]} 00:00:00 GMT`) : NaN;
  if (!Number.isFinite(declaredTime) || new Date(declaredTime).toISOString().slice(0, 10) !== releaseDate || declaredTime > checkedAt * 1000) return unknown;
  const table = page("#t1tg1");
  const headings = table.find("thead").text().replace(/\s+/g, " ");
  if (!headings.includes("Seasonally adjusted") || !headings.includes("M2")) return unknown;
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const periods = table.find("tbody tr").toArray().flatMap((element) => {
    const text = page(element).children("th,td").first().text().replace(/\s+/g, " ").trim();
    const match = /^([A-Za-z]+)\.? (\d{4})$/.exec(text);
    const month = match ? months.indexOf(match[1].slice(0, 3).toLowerCase()) : -1;
    return match && month >= 0 ? [`${match[2]}-${String(month + 1).padStart(2, "0")}`] : [];
  }).sort();
  const referencePeriod = periods.at(-1);
  const received = point.reportingPeriod?.frequency === "monthly" ? point.reportingPeriod.label : undefined;
  if (!referencePeriod || referencePeriod >= releaseDate.slice(0, 7) || !received) return unknown;
  return { status: received === referencePeriod ? "matched" : received < referencePeriod ? "behind" : "mismatch",
    sourceUrl, checkedAt, releaseDate, referencePeriod };
}

export async function getH6ReleaseEvidence(point: DataObservation, checkedAt = Date.now() / 1000): Promise<ReleaseEvidence> {
  try {
    const options = { cache: "no-store" as const, signal: AbortSignal.timeout(6000) };
    const index = await fetch(h6ReleaseDatesUrl, options);
    if (!index.ok) throw new Error("Release index unavailable");
    const release = latestH6Release(await index.json(), checkedAt);
    if (!release) throw new Error("Release date unknown");
    const response = await fetch(release.url, { ...options, signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error("Release unavailable");
    return compareH6Release(await response.text(), release.date, point, checkedAt);
  } catch {
    return { status: "unknown", sourceUrl: h6ReleaseIndexUrl, checkedAt };
  }
}