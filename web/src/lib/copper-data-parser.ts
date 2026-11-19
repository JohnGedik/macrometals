import { load } from "cheerio";
import type { DataObservation } from "@/lib/observation-data";

export const icsgCopperTableUrl = "https://icsg.org/wp-content/uploads/Table1.pdf";
export const nbsPressReleaseIndexUrl = "https://www.stats.gov.cn/english/PressRelease/";
export const copperIndustrialDemandSeriesId = "ICSG-WORLD-REFINED-COPPER-USAGE";
export const copperMineSupplySeriesId = "ICSG-WORLD-COPPER-MINE-PRODUCTION";
export const chinaPmiSeriesId = "NBS-CHINA-MANUFACTURING-PMI";

function annualObservations(
  years: readonly number[], values: readonly number[], retrievedAt: number,
  seriesId: string, sourceUrl: string, provider: string,
): DataObservation[] {
  if (years.length < 2 || years.length !== values.length) throw new Error(`Invalid ICSG annual history for ${seriesId}`);
  return years.map((year, index) => {
    const value = values[index];
    if (!Number.isInteger(year) || !Number.isFinite(value) || value <= 0) throw new Error(`Invalid ICSG annual value for ${seriesId}`);
    const sourceDate = `${year}-12-31`;
    return {
      time: Date.parse(`${sourceDate}T12:00:00Z`) / 1000,
      value,
      reportingPeriod: { start: `${year}-01-01`, end: sourceDate, label: String(year), frequency: "annual" },
      provenance: {
        provider, seriesId, sourceUrl, sourceDate, retrievedAt, publishedAt: null, vintage: `ICSG Copper Bulletin ${year}`,
        revisionStatus: "unknown", valueType: "reported", geography: "Global", measurement: "flow",
        rawValue: value, rawUnit: "million metric tonnes", normalizedUnit: "million metric tonnes",
        multiplier: 1, seasonalAdjustment: "not-applicable", aggregation: "annual-total",
      },
    };
  });
}

function rowValues(text: string, label: RegExp, prefix: RegExp) {
  const line = text.split(/\r?\n/).find((candidate) => label.test(candidate));
  if (!line) throw new Error("ICSG table row is missing");
  return line.replace(prefix, "").match(/-?\d[\d,]*(?:\.\d+)?/g)?.map((value) => Number(value.replaceAll(",", ""))) ?? [];
}

export function parseIcsgCopperTable(text: string, retrievedAt = Date.now() / 1000) {
  const normalized = text.replace(/\r/g, "").trim();
  if (!normalized.includes("WORLD REFINED COPPER PRODUCTION AND USAGE TRENDS")
    || !normalized.includes("Thousand metric tonnes, copper")) {
    throw new Error("Unrecognized ICSG copper table");
  }
  const header = normalized.split(/\r?\n/).find((line) => /\b20\d{2}\b.*\b20\d{2}\b/.test(line));
  const years = header?.match(/\b20\d{2}\b/g)?.map(Number).slice(0, 4);
  if (!years || years.length !== 4 || !years.every((year, index) => index === 0 || year === years[index - 1] + 1)) {
    throw new Error("ICSG copper table years are invalid");
  }
  const mineLine = rowValues(normalized, /^\(Concentrate & SX-EW\)/, /^\(Concentrate & SX-EW\)\s*/);
  const usageLine = rowValues(normalized, /^World Refined Copper Usage 2\//, /^World Refined Copper Usage 2\/\s*/);
  if (!mineLine.length || !usageLine.length) throw new Error("ICSG copper series are incomplete");
  const mine = annualObservations(years, mineLine.slice(0, 4).map((value) => value / 1000), retrievedAt,
    copperMineSupplySeriesId, icsgCopperTableUrl, "International Copper Study Group");
  const usage = annualObservations(years, usageLine.slice(0, 4).map((value) => value / 1000), retrievedAt,
    copperIndustrialDemandSeriesId, icsgCopperTableUrl, "International Copper Study Group");
  return { "copper-industrial-demand": usage, "copper-mine-supply": mine };
}

export function latestNbsPmiReleaseUrl(indexHtml: string) {
  const page = load(indexHtml);
  const match = page("a[href]").toArray().find((element) => {
    const title = `${page(element).text()} ${page(element).attr("title") ?? ""}`;
    return /Purchasing Managers['’] Index/i.test(title);
  });
  const href = match ? page(match).attr("href") : undefined;
  if (!href) throw new Error("NBS manufacturing PMI release is missing");
  return new URL(href, nbsPressReleaseIndexUrl).href;
}

export function parseNbsChinaPmi(html: string, sourceUrl: string, retrievedAt = Date.now() / 1000): DataObservation[] {
  const page = load(html);
  const table = page("table").toArray().find((element) =>
    /PMI.*Production Index.*New Order Index/i.test(page(element).text().replace(/\s+/g, " ")));
  if (!table) throw new Error("NBS manufacturing PMI history table is missing");
  const rows = page(table).find("tr").toArray();
  const observations: DataObservation[] = [];
  let year: number | null = null;
  for (const row of rows) {
    const cells = page(row).find("th,td").map((_, cell) => page(cell).text().replace(/\s+/g, " ").trim()).get();
    if (!cells.length) continue;
    const label = cells[0];
    const yearMatch = /^(\d{4})[-–]([A-Za-z]+)$/.exec(label);
    const monthMatch = /^(January|February|March|April|May|June|July|August|September|October|November|December)$/.exec(label);
    if (yearMatch) year = Number(yearMatch[1]);
    if (!year || !yearMatch && !monthMatch) continue;
    const month = yearMatch?.[2] ?? monthMatch?.[1];
    const value = Number(cells[1]);
    if (!month || !Number.isFinite(value)) continue;
    const monthNumber = new Date(`${month} 1, ${year} 00:00:00 UTC`).getUTCMonth() + 1;
    const start = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
    const endDate = new Date(Date.UTC(year, monthNumber, 0));
    const end = endDate.toISOString().slice(0, 10);
    observations.push({
      time: Date.parse(`${end}T12:00:00Z`) / 1000, value,
      reportingPeriod: { start, end, label: `${year}-${String(monthNumber).padStart(2, "0")}`, frequency: "monthly" },
      provenance: {
        provider: "National Bureau of Statistics of China / CFLP", seriesId: chinaPmiSeriesId,
        sourceUrl, sourceDate: end, retrievedAt, publishedAt: null, vintage: `${year}-${String(monthNumber).padStart(2, "0")}`,
        revisionStatus: "unknown", valueType: "reported", geography: "China", measurement: "index",
        rawValue: value, rawUnit: "percent", normalizedUnit: "index points", multiplier: 1,
        seasonalAdjustment: "SA", aggregation: "monthly-index",
      },
    });
  }
  if (observations.length < 12) throw new Error("NBS manufacturing PMI history is incomplete");
  return observations.sort((first, second) => first.time - second.time);
}
