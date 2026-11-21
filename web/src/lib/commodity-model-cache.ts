import "server-only";

import { promisify } from "node:util";
import { gzip, gunzip } from "node:zlib";
import { unstable_cache } from "next/cache";
import { getCommodityConfiguration } from "@/lib/commodity-config";
import { commoditySourceRightsKey } from "@/lib/commodity-data";
import type { CommodityConfiguration } from "@/lib/commodity-score";
import { loadCommodityModel, presentCommodityModel } from "@/lib/indicators";
import type { Locale } from "@/lib/i18n";

const compress = promisify(gzip);
const decompress = promisify(gunzip);

const getCachedSnapshot = unstable_cache(
  async ({ commodity }: { commodity: string; rightsKey: string; month: string; deployment: string }) => {
    const config = getCommodityConfiguration(commodity);
    if (!config) throw new Error(`Missing commodity configuration: ${commodity}`);
    const model = await loadCommodityModel(config, "en");
    // Indicator histories exceed Next.js's data-cache entry limit without compression.
    const snapshot = await compress(JSON.stringify(model.config));
    return { snapshot: snapshot.toString("base64"), calculatedAt: Date.now() };
  },
  ["commodity-model-snapshot-v1"],
  { revalidate: 900 },
);

const pendingSnapshots = new Map<string, ReturnType<typeof getCachedSnapshot>>();

async function getSnapshot(key: Parameters<typeof getCachedSnapshot>[0]) {
  const cacheKey = JSON.stringify(key);
  const pending = pendingSnapshots.get(cacheKey);
  if (pending) return pending;
  const request = getCachedSnapshot(key);
  pendingSnapshots.set(cacheKey, request);
  try {
    return await request;
  } finally {
    pendingSnapshots.delete(cacheKey);
  }
}

export async function getCachedCommodityModel(commodity: string, locale: Locale) {
  const config = getCommodityConfiguration(commodity);
  if (!config) throw new Error(`Missing commodity configuration: ${commodity}`);
  const cached = await getSnapshot({
    commodity,
    rightsKey: commoditySourceRightsKey(config),
    month: new Date().toISOString().slice(0, 7),
    deployment: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
  });
  const snapshot = await decompress(Buffer.from(cached.snapshot, "base64"));
  const resolvedConfig = JSON.parse(snapshot.toString("utf8")) as CommodityConfiguration;
  return { ...presentCommodityModel(resolvedConfig, locale), calculatedAt: cached.calculatedAt };
}
