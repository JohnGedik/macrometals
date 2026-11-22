import "server-only";
import {
  icsgCopperTableUrl, latestNbsPmiReleaseUrl, nbsPressReleaseIndexUrl, parseIcsgCopperTable, parseNbsChinaPmi,
} from "@/lib/copper-data-parser";
import type { Observation } from "@/lib/commodity-score";

export type CopperFeeds = {
  "copper-industrial-demand": readonly Observation[];
  "copper-mine-supply": readonly Observation[];
  "china-pmi": readonly Observation[];
};

const refreshIntervalMs = 60 * 60 * 1000;
const retentionMs = 6 * 60 * 60 * 1000;

type FeedCache<T> = {
  value: T | null;
  refreshedAt: number;
  pending: Promise<T | null> | null;
};

const icsgCache: FeedCache<Pick<CopperFeeds, "copper-industrial-demand" | "copper-mine-supply">> =
  { value: null, refreshedAt: 0, pending: null };
const pmiCache: FeedCache<CopperFeeds["china-pmi"]> = { value: null, refreshedAt: 0, pending: null };

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
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
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

async function getFeed<T>(cache: FeedCache<T>, load: (retrievedAt: number) => Promise<T>, name: string): Promise<T | null> {
  const age = Date.now() - cache.refreshedAt;
  if (cache.value !== null && age >= 0 && age < refreshIntervalMs) return cache.value;
  if (age < 0 || age >= retentionMs) cache.value = null;
  cache.pending ??= (async () => {
    try {
      const retrievedAt = Date.now();
      const value = await load(retrievedAt / 1000);
      cache.value = value;
      cache.refreshedAt = retrievedAt;
      return value;
    } catch (error) {
      console.error(`${name} download failed`, error instanceof Error ? error.message : "Unknown error",
        error instanceof Error && error.cause instanceof Error ? error.cause.message : undefined);
      const cacheAge = Date.now() - cache.refreshedAt;
      return cache.value !== null && cacheAge >= 0 && cacheAge < retentionMs ? cache.value : null;
    }
  })().finally(() => { cache.pending = null; });
  return cache.pending;
}

export async function getCopperFeeds() {
  const [icsg, pmi] = await Promise.all([
    getFeed(icsgCache, loadIcsg, "ICSG copper data"),
    getFeed(pmiCache, loadNbsPmi, "NBS manufacturing PMI"),
  ]);
  return { ...(icsg ?? {}), ...(pmi ? { "china-pmi": pmi } : {}) };
}
