import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { AsyncLocalStorage } from "node:async_hooks";

test("model snapshots are shared across locales, isolated by commodity and permissions, and refreshed", async () => {
  const stateKey = Symbol.for("macrometals.test.commodity-model-cache");
  const previousState = globalThis[stateKey];
  const previousCache = globalThis.__incrementalCache;
  const previousAsyncLocalStorage = globalThis.AsyncLocalStorage;
  const state = { score: 40, rights: "allowed", loads: 0 };
  const entries = new Map();
  let stale = false;
  globalThis[stateKey] = state;
  globalThis.AsyncLocalStorage = AsyncLocalStorage;
  globalThis.__incrementalCache = {
    async generateSimpleCacheKey(key) { return key; },
    async get(key, options) {
      assert.equal(options.revalidate, 900);
      const value = entries.get(key);
      return value ? { value, isStale: stale } : null;
    },
    async set(key, value) { entries.set(key, value); },
  };
  const stateExpression = "globalThis[Symbol.for('macrometals.test.commodity-model-cache')]";
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      const mocks = {
        "server-only": "export {}",
        "@/lib/commodity-config": "export const getCommodityConfiguration = commodity => ({ commodity });",
        "@/lib/commodity-data": `export const commoditySourceRightsKey = () => ${stateExpression}.rights;`,
        "@/lib/indicators": `
          export const loadCommodityModel = async config => {
            const state = ${stateExpression};
            state.loads++;
            await new Promise(resolve => setTimeout(resolve, 5));
            return { config: { ...config, score: state.score } };
          };
          export const presentCommodityModel = (config, locale) => ({ config, summary: { score: config.score }, locale });
        `,
      };
      if (specifier in mocks) {
        return nextResolve(`data:text/javascript,${encodeURIComponent(mocks[specifier])}`, context);
      }
      if (specifier === "next/cache") return nextResolve("next/cache.js", context);
      return nextResolve(specifier, context);
    },
  });
  try {
    const { getCachedCommodityModel } = await import("./commodity-model-cache.ts");
    const english = await getCachedCommodityModel("gold", "en");
    state.score = 80;
    const turkish = await getCachedCommodityModel("gold", "tr");
    assert.equal(english.summary.score, 40);
    assert.equal(turkish.summary.score, 40);
    assert.equal(turkish.locale, "tr");
    assert.equal(state.loads, 1);
    const [oilEnglish, oilTurkish] = await Promise.all([
      getCachedCommodityModel("oil", "en"),
      getCachedCommodityModel("oil", "tr"),
    ]);
    assert.equal(oilEnglish.summary.score, 80);
    assert.equal(oilTurkish.summary.score, 80);
    assert.equal(state.loads, 2);
    assert.equal((await getCachedCommodityModel("silver", "en")).summary.score, 80);
    state.rights = "revoked";
    assert.equal((await getCachedCommodityModel("gold", "en")).summary.score, 80);
    assert.equal(state.loads, 4);
    stale = true;
    state.score = 55;
    assert.equal((await getCachedCommodityModel("gold", "en")).summary.score, 55);
    assert.equal(state.loads, 5);
  } finally {
    hooks.deregister();
    globalThis.__incrementalCache = previousCache;
    globalThis.AsyncLocalStorage = previousAsyncLocalStorage;
    globalThis[stateKey] = previousState;
  }
});
