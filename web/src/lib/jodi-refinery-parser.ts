import { load } from "cheerio";
import type { DataObservation } from "@/lib/observation-data";

export const jodiDownloadPage = "https://www.jodidata.org/oil/database/data-downloads.aspx";
export const jodiRefinerySeriesId = "JODI-CRUDEOIL-REFINOBS-KBD-MATCHED";
const csvPath = /^\/_resources\/files\/downloads\/oil-data\/annual-csv\/primary\/(?:primaryyear)?(\d{4})\.csv$/;

export function jodiAnnualUrls(html: string, year: number): string[] {
  const $ = load(html);
  const urls = new Map<number, string>();
  $("a[href]").each((_, element) => {
    const url = new URL($(element).attr("href")!, jodiDownloadPage);
    const match = url.pathname.match(csvPath);
    if (url.origin !== "https://www.jodidata.org" || !match || url.search || url.hash) return;
    const fileYear = Number(match[1]);
    if (fileYear <= year && fileYear >= year - 2) {
      if (urls.has(fileYear)) throw new Error(`JODI lists multiple primary files for ${fileYear}`);
      urls.set(fileYear, url.href);
    }
  });
  if (urls.size < 2) throw new Error("JODI primary annual file links are missing");
  return [...urls.entries()].sort(([a], [b]) => b - a).map(([, url]) => url);
}

export function parseJodiRefinery(csvFiles: readonly string[], retrievedAt: number): DataObservation[] {
  if (!Number.isFinite(retrievedAt) || retrievedAt <= 0) throw new Error("Invalid JODI retrieval time");
  const months = new Map<string, Map<string, number>>();
  for (const csv of csvFiles) {
    const lines = csv.split(/\r?\n/);
    if (lines.shift()?.replace(/^\uFEFF/, "").trim() !== "REF_AREA,TIME_PERIOD,ENERGY_PRODUCT,FLOW_BREAKDOWN,UNIT_MEASURE,OBS_VALUE,ASSESSMENT_CODE") {
      throw new Error("JODI CSV header is invalid");
    }
    for (const line of lines) {
      if (!line) continue;
      const fields = line.trim().split(",");
      if (fields.length !== 7) throw new Error("JODI CSV row is invalid");
      const [country, month, product, flow, unit, raw, assessment] = fields;
      if (product !== "CRUDEOIL" || flow !== "REFINOBS" || unit !== "KBD") continue;
      if (!/^[A-Z]{2}$/.test(country) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !/^[123]$/.test(assessment)) {
        throw new Error("JODI refinery row metadata is invalid");
      }
      if (raw === "-" || raw === "x" || raw === "") continue;
      if (!/^\d+(?:\.\d+)?$/.test(raw)) throw new Error("JODI refinery value is invalid");
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error("JODI refinery value is invalid");
      const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0, 12)).getTime() / 1000;
      if (end > retrievedAt) continue;
      const reports = months.get(month) ?? new Map<string, number>();
      if (reports.has(country)) throw new Error(`Duplicate JODI refinery observation: ${country} ${month}`);
      reports.set(country, value);
      months.set(month, reports);
    }
  }
  const latestMonth = [...months.keys()].sort().at(-1);
  if (!latestMonth) throw new Error("JODI contains no refinery observations");
  const latest = months.get(latestMonth)!;
  const previousMonth = `${Number(latestMonth.slice(0, 4)) - 1}${latestMonth.slice(4)}`;
  const previous = months.get(previousMonth);
  if (!previous) throw new Error("JODI refinery year-over-year reference month is missing");
  const matched = [...latest.keys()].filter((country) => previous.has(country)).sort();
  if (!matched.length) throw new Error("JODI refinery months have no matched reporting countries");
  const coverage = { matchedCountries: matched, reportingCountries: [...latest.keys()].sort() };
  return [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([month, reports]): DataObservation[] => {
    if (!matched.every((country) => reports.has(country))) return [];
    const rawValue = matched.reduce((sum, country) => sum + reports.get(country)!, 0);
    const start = `${month}-01`;
    const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
    return [{
      time: Date.parse(`${end}T12:00:00Z`) / 1000, value: rawValue / 1000,
      reportingPeriod: { start, end, label: month, frequency: "monthly" },
      provenance: {
        provider: "International Energy Forum (IEF) · Joint Organizations Data Initiative (JODI)",
        seriesId: jodiRefinerySeriesId, sourceUrl: jodiDownloadPage, sourceDate: end, retrievedAt,
        publishedAt: null, vintage: null, revisionStatus: "unknown", valueType: "reported",
        geography: "Matched reporting economies (not global)", measurement: "rate", rawValue,
        rawUnit: "thousand barrels/day", normalizedUnit: "million barrels/day", multiplier: 0.001,
        seasonalAdjustment: "not-applicable", aggregation: "monthly-average", coverage,
      },
    }];
  });
}
