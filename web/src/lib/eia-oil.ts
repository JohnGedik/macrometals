import "server-only";
import * as XLSX from "@e965/xlsx";
import { parseEiaSpareCapacity, parseSteoOil, spareCapacityUrl, steoOilUrl, type EiaOilFeeds } from "@/lib/eia-oil-parser";

let cache: { expiresAt: number; feeds: Partial<EiaOilFeeds> } | null = null;
let pending: Promise<Partial<EiaOilFeeds>> | null = null;

async function workbook(url: string) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`EIA workbook request failed: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 8_000_000) throw new Error("EIA workbook is empty or exceeds the size limit");
  return XLSX.read(bytes, { type: "array", raw: true });
}

function rows(book: XLSX.WorkBook, name: string) {
  const sheet = book.Sheets[name];
  if (!sheet) throw new Error(`EIA workbook is missing worksheet ${name}`);
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, range: 0 });
}

async function load(): Promise<Partial<EiaOilFeeds>> {
  const [monthly, spare] = await Promise.allSettled([workbook(steoOilUrl), workbook(spareCapacityUrl)]);
  const feeds: Partial<EiaOilFeeds> = {};
  const retrievedAt = Date.now() / 1000;
  if (monthly.status === "rejected") {
    console.error("EIA STEO oil download failed", monthly.reason instanceof Error ? monthly.reason.message : "Unknown error");
    return feeds;
  }
  let dates: unknown[][];
  try {
    dates = rows(monthly.value, "Dates");
    Object.assign(feeds, parseSteoOil(dates, rows(monthly.value, "3atab"), retrievedAt));
  } catch (error) {
    console.error("EIA STEO oil data is invalid", error instanceof Error ? error.message : "Unknown error");
    return feeds;
  }
  if (spare.status === "fulfilled") {
    try {
      feeds["eia-oil-spare-capacity"] = parseEiaSpareCapacity(dates, rows(spare.value, "6"), retrievedAt);
    } catch (error) {
      console.error("EIA spare capacity data is invalid", error instanceof Error ? error.message : "Unknown error");
    }
  } else console.error("EIA spare capacity download failed", spare.reason instanceof Error ? spare.reason.message : "Unknown error");
  if (Object.keys(feeds).length === 4) cache = { expiresAt: Date.now() + 60 * 60 * 1000, feeds };
  return feeds;
}

export async function getEiaOilFeeds(): Promise<Partial<EiaOilFeeds>> {
  if (cache && cache.expiresAt > Date.now()) return cache.feeds;
  pending ??= load().finally(() => { pending = null; });
  return pending;
}
