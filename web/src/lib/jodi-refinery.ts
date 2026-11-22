import "server-only";
import { getSourceRights } from "@/lib/source-rights";
import { jodiAnnualUrls, jodiDownloadPage, jodiRefinerySeriesId, parseJodiRefinery } from "@/lib/jodi-refinery-parser";
import type { Observation } from "@/lib/commodity-score";

const refreshMs = 60 * 60 * 1000;
const retentionMs = 6 * refreshMs;
let cache: { points: Observation[]; retrievedAt: number } | null = null;
let pending: Promise<Observation[] | null> | null = null;

async function download(url: string, limit: number) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`JODI request failed: HTTP ${response.status}`);
  const length = Number(response.headers.get("content-length"));
  if (length > limit) throw new Error("JODI response exceeds size limit");
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > limit) throw new Error("JODI response is empty or exceeds size limit");
  return new TextDecoder().decode(bytes);
}

export async function getJodiRefineryFeed(): Promise<Observation[] | null> {
  if (!getSourceRights("jodi", jodiRefinerySeriesId).allowed) return null;
  const age = cache ? Date.now() - cache.retrievedAt : Infinity;
  if (cache && age >= 0 && age < refreshMs) return cache.points;
  if (age < 0 || age >= retentionMs) cache = null;
  pending ??= (async () => {
    try {
      const html = await download(jodiDownloadPage, 1_000_000);
      const urls = jodiAnnualUrls(html, new Date().getUTCFullYear());
      const files = await Promise.all(urls.map((url) => download(url, 20_000_000)));
      const retrievedAt = Date.now();
      const points = parseJodiRefinery(files, retrievedAt / 1000);
      cache = { points, retrievedAt };
      return points;
    } catch (error) {
      console.error("JODI refinery download failed", error instanceof Error ? error.message : "Unknown error");
      const cacheAge = cache ? Date.now() - cache.retrievedAt : Infinity;
      return cache && cacheAge >= 0 && cacheAge < retentionMs ? cache.points : null;
    }
  })().finally(() => { pending = null; });
  return pending;
}
