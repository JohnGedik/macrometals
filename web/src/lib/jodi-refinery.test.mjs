import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return nextResolve(new URL("./server-only.stub.mjs", import.meta.url).href, context);
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, new URL("../", import.meta.url)).href, context);
    return nextResolve(specifier, context);
  },
});
const { parseJodiRefinery, jodiAnnualUrls, jodiDownloadPage, jodiRefinerySeriesId } = await import("./jodi-refinery-parser.ts");
const { getJodiRefineryFeed } = await import("./jodi-refinery.ts");
const { hydrateCommodityObservations, commoditySourceRightsKey } = await import("./commodity-data.ts");
const { commodityConfigurations } = await import("./commodity-config.ts");
const { scoreCommodity } = await import("./commodity-score.ts");
const { calculateCommodityChanges, commodityChangesInput } = await import("./commodity-changes.ts");
const { getMacroIndicators } = await import("./indicators.ts");
hooks.deregister();

const header = "REF_AREA,TIME_PERIOD,ENERGY_PRODUCT,FLOW_BREAKDOWN,UNIT_MEASURE,OBS_VALUE,ASSESSMENT_CODE";
const row = (country, month, value) => `${country},${month},CRUDEOIL,REFINOBS,KBD,${value},1`;
const current = [header, row("US", "2026-09", "12000"), row("FR", "2026-09", "900"), row("CN", "2026-09", "-"),
  row("DE", "2026-09", "2000"), row("US", "2026-08", "11000"), row("FR", "2026-08", "800"),
  row("US", "2026-06", "10000"), row("FR", "2026-06", "700"), row("US", "2026-07", "10000")].join("\n");
const previous = [header, row("US", "2025-09", "10000"), row("FR", "2025-09", "1000"),
  row("CN", "2025-09", "15000")].join("\n");
const checkedAt = Date.parse("2026-11-18T16:00:00Z") / 1000;
const page = '<a href="/_resources/files/downloads/oil-data/annual-csv/primary/primaryyear2026.csv">2026</a>'
  + '<a href="/_resources/files/downloads/oil-data/annual-csv/primary/2025.csv">2025</a>';

test("JODI refinery uses the same reporting cohort for all values and excludes missing periods", () => {
  const points = parseJodiRefinery([current, previous], checkedAt);
  assert.deepEqual(points.map((point) => point.reportingPeriod.label), ["2025-09", "2026-06", "2026-08", "2026-09"]);
  assert.deepEqual(points.map((point) => point.value), [11, 10.7, 11.8, 12.9]);
  assert.deepEqual(points.at(-1).provenance.coverage, { matchedCountries: ["FR", "US"], reportingCountries: ["DE", "FR", "US"] });
  assert.equal(points.at(-1).provenance.rawUnit, "thousand barrels/day");
  assert.equal(points.at(-1).provenance.retrievedAt, checkedAt);
  assert.throws(() => parseJodiRefinery([current], checkedAt), /reference month/);
  assert.throws(() => parseJodiRefinery([current + "\n" + row("US", "2026-09", "1"), previous], checkedAt), /Duplicate/);
  assert.throws(() => parseJodiRefinery([current.replace(header, "wrong"), previous], checkedAt), /header/);
  assert.throws(() => parseJodiRefinery([current.replace("12000", "-5"), previous], checkedAt), /value/);
  assert.deepEqual(jodiAnnualUrls(page, 2026).map((url) => new URL(url).pathname.split("/").at(-1)), ["primaryyear2026.csv", "2025.csv"]);
  assert.throws(() => jodiAnnualUrls('<a href="https://other.example/2026.csv">x</a>', 2026), /missing/);
});

test("JODI proxy requires permission, freshness and a matched year for scoring and changes", () => {
  const flag = "JODI_REFINERY_PUBLIC_USE_CONFIRMED";
  const original = process.env[flag];
  try {
    const points = parseJodiRefinery([current, previous], checkedAt);
    process.env[flag] = "true";
    const config = hydrateCommodityObservations(commodityConfigurations.oil, { "jodi-refinery": points }, checkedAt);
    const indicator = scoreCommodity(config).indicators.find((item) => item.id === "refinery-runs");
    assert.ok(Math.abs(indicator.change - (12.9 - 11) / 11 * 100) < 1e-10);
    assert.equal(indicator.score, 100);
    assert.equal(scoreCommodity(config).coverage, 10);
    const changes = calculateCommodityChanges(commodityChangesInput(config)).find((item) => item.id === "refinery-runs");
    assert.ok(Math.abs(changes.changes.monthly - (12.9 - 11.8) / 11.8 * 100) < 1e-10);
    assert.ok(Math.abs(changes.changes.yoy - indicator.change) < 1e-10);
    assert.equal(scoreCommodity(hydrateCommodityObservations(commodityConfigurations.oil, { "jodi-refinery": points.slice(1) }, checkedAt)).coverage, 0);
    assert.equal(scoreCommodity(hydrateCommodityObservations(commodityConfigurations.oil, { "jodi-refinery": points }, Date.parse("2027-02-01") / 1000)).coverage, 0);
    const allowedKey = commoditySourceRightsKey(commodityConfigurations.oil);
    process.env[flag] = "false";
    assert.notEqual(commoditySourceRightsKey(commodityConfigurations.oil), allowedKey);
    assert.equal(scoreCommodity(hydrateCommodityObservations(commodityConfigurations.oil, { "jodi-refinery": points }, checkedAt)).coverage, 0);
  } finally {
    if (original === undefined) delete process.env[flag]; else process.env[flag] = original;
  }
});

test("JODI retrieval is permission-gated, deduplicated and retains a successful feed for at most six hours", async () => {
  const originalNow = Date.now;
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const flag = "JODI_REFINERY_PUBLIC_USE_CONFIRMED";
  const originalFlag = process.env[flag];
  let now = checkedAt * 1000;
  let requests = 0;
  let fail = false;
  const errors = [];
  Date.now = () => now;
  console.error = (...args) => errors.push(args);
  globalThis.fetch = async (url) => {
    requests++;
    if (fail) return new Response("", { status: 503 });
    if (url === jodiDownloadPage) return new Response(page);
    if (url.endsWith("primaryyear2026.csv")) return new Response(current);
    if (url.endsWith("2025.csv")) return new Response(previous);
    throw new Error(`Unexpected request: ${url}`);
  };
  try {
    process.env[flag] = "false";
    assert.equal(await getJodiRefineryFeed(), null);
    assert.equal(requests, 0);
    process.env[flag] = "true";
    const [first, concurrent] = await Promise.all([getJodiRefineryFeed(), getJodiRefineryFeed()]);
    assert.deepEqual(first, concurrent);
    assert.equal(first.at(-1).provenance.seriesId, jodiRefinerySeriesId);
    assert.equal(requests, 3);
    assert.deepEqual(await getJodiRefineryFeed(), first);
    assert.equal(requests, 3);
    now += 60 * 60 * 1000;
    fail = true;
    assert.deepEqual(await getJodiRefineryFeed(), first);
    assert.ok(errors.some(([message]) => message === "JODI refinery download failed"));
    now += 5 * 60 * 60 * 1000;
    assert.equal(await getJodiRefineryFeed(), null);
    process.env[flag] = "false";
    assert.equal(await getJodiRefineryFeed(), null);
  } finally {
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
    console.error = originalError;
    if (originalFlag === undefined) delete process.env[flag]; else process.env[flag] = originalFlag;
  }
});

test("Oil dashboard displays and scores the partial refinery feed in both locales", async () => {
  const originalNow = Date.now;
  const originalFetch = globalThis.fetch;
  const flag = "JODI_REFINERY_PUBLIC_USE_CONFIRMED";
  const originalFlag = process.env[flag];
  Date.now = () => checkedAt * 1000;
  process.env[flag] = "true";
  globalThis.fetch = async (url) => {
    if (url === jodiDownloadPage) return new Response(page);
    if (url.endsWith("primaryyear2026.csv")) return new Response(current);
    if (url.endsWith("2025.csv")) return new Response(previous);
    throw new Error(`Unexpected request: ${url}`);
  };
  try {
    const config = { ...commodityConfigurations.oil, contextProvider: undefined, scoreSources: { "refinery-runs": "jodi-refinery" } };
    for (const locale of ["en", "tr"]) {
      const dashboard = await getMacroIndicators(config, locale);
      const card = dashboard.cards.find((item) => item.id === "refinery-runs");
      assert.equal(dashboard.summary.coverage, 10);
      assert.equal(card.factorScore, 100);
      assert.equal(card.dataHealth.reportingPeriod.label, "2026-09");
      assert.equal(card.dataHealth.provenance.coverage.matchedCountries.length, 2);
      assert.match(card.name, locale === "en" ? /partial/ : /kısmi/);
      assert.notEqual(card.value, "—");
    }
    process.env[flag] = "false";
    const denied = await getMacroIndicators(config, "en");
    assert.equal(denied.cards.find((item) => item.id === "refinery-runs").value, "—");
    assert.equal(denied.summary.coverage, 0);
  } finally {
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
    if (originalFlag === undefined) delete process.env[flag]; else process.env[flag] = originalFlag;
  }
});
