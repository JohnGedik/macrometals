import "server-only";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  icsgCopperTableUrl, latestNbsPmiReleaseUrl, nbsPressReleaseIndexUrl, parseIcsgCopperTable, parseNbsChinaPmi,
} from "@/lib/copper-data-parser";
import type { Observation } from "@/lib/commodity-score";

export type CopperFeeds = {
  "copper-industrial-demand": readonly Observation[];
  "copper-mine-supply": readonly Observation[];
  "china-pmi": readonly Observation[];
};

let cache: { expiresAt: number; feeds: Partial<CopperFeeds> } | null = null;
let pending: Promise<Partial<CopperFeeds>> | null = null;

async function fetchApprovedSource(url: string, timeout: number) {
  let failure: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(timeout),
        headers: { "user-agent": "Mozilla/5.0 (compatible; MacroMetals/1.0; market research)" },
      });
      if (!response.ok) throw new Error(`Copper source request failed: ${response.status}`);
      return response;
    } catch (error) {
      failure = error;
    }
  }
  throw failure instanceof Error ? failure : new Error("Copper source request failed");
}

async function loadIcsg(retrievedAt: number) {
  const response = await fetchApprovedSource(icsgCopperTableUrl, 30_000);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 8_000_000) throw new Error("ICSG copper table is empty or exceeds the size limit");
  const document = await getDocument({ data: bytes, disableFontFace: true, useSystemFonts: true }).promise;
  try {
    const page = await document.getPage(1);
    const content = await page.getTextContent();
    const text = content.items.filter((item) => "str" in item)
      .map((item) => item.str + (item.hasEOL ? "\n" : " ")).join("")
      .split("\n").map((line) => line.trim().replace(/\s+/g, " ")).join("\n");
    return parseIcsgCopperTable(text, retrievedAt);
  } finally {
    await document.destroy();
  }
}

async function loadNbsPmi(retrievedAt: number) {
  const indexResponse = await fetchApprovedSource(nbsPressReleaseIndexUrl, 20_000);
  const releaseUrl = latestNbsPmiReleaseUrl(await indexResponse.text());
  const releaseResponse = await fetchApprovedSource(releaseUrl, 20_000);
  return parseNbsChinaPmi(await releaseResponse.text(), releaseUrl, retrievedAt);
}

async function load(): Promise<Partial<CopperFeeds>> {
  const retrievedAt = Date.now() / 1000;
  const [icsg, pmi] = await Promise.allSettled([loadIcsg(retrievedAt), loadNbsPmi(retrievedAt)]);
  const feeds: Partial<CopperFeeds> = {};
  if (icsg.status === "fulfilled") Object.assign(feeds, icsg.value);
  else console.error("ICSG copper data download failed", icsg.reason instanceof Error ? icsg.reason.message : "Unknown error");
  if (pmi.status === "fulfilled") feeds["china-pmi"] = pmi.value;
  else console.error("NBS manufacturing PMI download failed", pmi.reason instanceof Error ? pmi.reason.message : "Unknown error");
  if (Object.keys(feeds).length === 3) cache = { expiresAt: Date.now() + 6 * 60 * 60 * 1000, feeds };
  return feeds;
}

export async function getCopperFeeds() {
  if (cache && cache.expiresAt > Date.now()) return cache.feeds;
  pending ??= load().finally(() => { pending = null; });
  return pending;
}
