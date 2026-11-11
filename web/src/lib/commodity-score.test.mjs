import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { classifyPriceRelationship } from "./price-relationship.ts";
import { calculateCommodityChanges, commodityChangesInput, rankCommodityChanges } from "./commodity-changes.ts";

const aliases = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`${specifier.slice(2)}.ts`, new URL("../", import.meta.url)).href, context);
    }
    return nextResolve(specifier, context);
  },
});
const { scoreCommodity } = await import("./commodity-score.ts");
const { commodityConfigurations, getCommodityConfiguration } = await import("./commodity-config.ts");
const { getMacroIndicators, getCommodityHeaderData } = await import("./indicators.ts");
const { countActiveIndicators, generateMacroSummary } = await import("./macro-summary.ts");
const { hydrateCommodityObservations } = await import("./commodity-data.ts");
const { normalizeDashboardPreference, readDashboardPreference, writeDashboardPreference } = await import("./dashboard-preferences.ts");
aliases.deregister();

const researchPolicy = { mode: "research", minimumCoverage: 0, requiredIndicators: [], approvedIndicators: [] };

function fixture(changes, weights = changes.map(() => 100 / changes.length)) {
  const indicators = changes.map((change, index) => ({ id: `factor-${index}`, changeKind: "percentage", values: [100, 100 + change] }));
  return {
    commodity: "test", years: [2024, 2025], chartStartYear: 2024, indicators, scoringPolicy: researchPolicy,
    weights: Object.fromEntries(indicators.map((indicator, index) => [indicator.id, weights[index]])),
    scoreRules: { baseline: 50, sensitivity: 50, bullish: 60, bearish: 40, factors: Object.fromEntries(indicators.map((indicator) => [indicator.id, { direction: 1, scale: 10, trendThreshold: 0.5 }])) },
  };
}

function publicFixture(changes = [10, -10, 0], weights = [40, 40, 20]) {
  const config = fixture(changes, weights);
  config.scoringPolicy = { mode: "sourced-only", minimumCoverage: 80, requiredIndicators: ["factor-0", "factor-1"], approvedIndicators: config.indicators.map((indicator) => indicator.id) };
  config.indicators = config.indicators.map((indicator) => ({ ...indicator,
    observations: config.years.map((year, index) => ({ time: Date.UTC(year, 6, 1) / 1000, value: indicator.values[index] })),
    dataHealth: { kind: "sourced", status: "fresh", source: "Approved test fixture", frequency: "annual", observedAt: Date.UTC(2025, 6, 1) / 1000, checkedAt: Date.UTC(2025, 6, 1) / 1000 },
  }));
  return config;
}

test("public scoring fails closed without an explicit policy or source approvals", () => {
  const config = fixture([10]);
  delete config.scoringPolicy;
  assert.equal(scoreCommodity(config).score, null);
  const sourced = publicFixture();
  sourced.scoringPolicy.approvedIndicators = [];
  const result = scoreCommodity(sourced);
  assert.equal(result.coverage, 0);
  assert.equal(result.score, null);
  assert.ok(result.indicators.every((indicator) => indicator.exclusionReason === "unapproved"));
  assert.deepEqual(result.positiveDrivers, []);
  assert.deepEqual(result.negativeDrivers, []);
});

test("samples cannot contribute even if their IDs appear in an approval list", () => {
  const config = publicFixture([10, -10, 1000]);
  delete config.indicators[2].observations;
  config.indicators[2].dataHealth = { kind: "sample", status: "sample" };
  const result = scoreCommodity(config);
  assert.equal(result.coverage, 80);
  assert.equal(result.score, 50);
  assert.equal(result.indicators[2].score, null);
  assert.equal(result.indicators[2].contribution, 0);
  assert.equal(result.indicators[2].exclusionReason, "sample");
  config.indicators[2].values = [-1000000, 1000000];
  assert.equal(scoreCommodity(config).score, 50);
  const input = {
    commodity: "test", commodityName: "Test Metal", score: result.score,
    indicatorScores: result.indicators.map((indicator) => ({ id: indicator.id, name: indicator.id, score: indicator.score, trend: "up" })),
    indicatorWeights: config.weights, topPositiveDrivers: [], topNegativeDrivers: [],
  };
  const narrative = generateMacroSummary(input, "en");
  assert.ok(!narrative.summary.includes("factor-2"));
  assert.equal(countActiveIndicators(input), 2);
});

test("coverage and critical-factor gates withhold totals and driver contributions", () => {
  const below = publicFixture([10, -10, 10], [39, 40, 21]);
  below.indicators[2].dataHealth.status = "stale";
  const low = scoreCommodity(below);
  assert.equal(low.coverage, 79);
  assert.equal(low.score, null);
  assert.ok(low.indicators.every((indicator) => indicator.contribution === 0));
  const critical = publicFixture([10, -10, 10], [40, 40, 20]);
  critical.scoringPolicy.requiredIndicators = ["factor-2"];
  critical.indicators[2].dataHealth.status = "unavailable";
  const missing = scoreCommodity(critical);
  assert.equal(missing.coverage, 80);
  assert.equal(missing.score, null);
  assert.deepEqual(missing.missingRequired, ["factor-2"]);
  assert.equal(scoreCommodity(publicFixture()).publishable, true);
});

test("every registered public commodity is sourced-only and awaiting approval", () => {
  for (const config of Object.values(commodityConfigurations)) {
    const result = scoreCommodity(config);
    assert.equal(result.policy.mode, "sourced-only");
    assert.equal(result.policy.minimumCoverage, 80);
    assert.ok(result.policy.requiredIndicators.length > 0);
    assert.deepEqual(result.policy.approvedIndicators, []);
    assert.equal(result.score, null);
    assert.equal(result.coverage, 0);
    assert.ok(result.indicators.every((indicator) => indicator.score === null));
  }
});

test("restricted recent changes exclude samples and unapproved source observations", () => {
  const config = publicFixture();
  config.indicators[2].dataHealth = { kind: "sample", status: "sample" };
  config.scoringPolicy.approvedIndicators = ["factor-0"];
  const input = commodityChangesInput(config);
  const changes = calculateCommodityChanges(input);
  assert.equal(input.scoringRestricted, true);
  assert.equal(changes[0].changes.yoy, 10);
  assert.deepEqual(changes[1].changes, { monthly: null, quarterly: null, yoy: null });
  assert.deepEqual(changes[2].changes, { monthly: null, quarterly: null, yoy: null });
  assert.deepEqual(rankCommodityChanges(input, changes, "yoy").positive.map((driver) => driver.id), ["factor-0"]);
});

test("public dashboards keep sample values as reference without score inputs or narrative", async () => {
  for (const config of Object.values(commodityConfigurations)) {
    const dashboard = await getMacroIndicators({ ...config, scoreSources: undefined, contextProvider: undefined }, "en");
    assert.equal(dashboard.summary.score, null);
    assert.equal(dashboard.summary.coverage, 0);
    assert.deepEqual(dashboard.summary.dataMix, { sourcedWeight: 0, sampleWeight: 0, excludedWeight: 100 });
    assert.equal(dashboard.summary.release.approvedCount, 0);
    assert.equal(dashboard.summary.release.referenceSampleWeight, 100);
    assert.ok(dashboard.cards.every((card) => card.value !== "—" && card.factorScore === null && card.scoreExclusion === "sample"));
    assert.ok(dashboard.cards.every((card) => card.explanation.includes("reference only")));
    assert.deepEqual(dashboard.summary.positiveDrivers, []);
    assert.deepEqual(dashboard.summary.negativeDrivers, []);
    assert.throws(() => generateMacroSummary({ ...summaryFixture(50), score: dashboard.summary.score }, "en"), /Invalid/);
  }
});

test("dashboard preferences validate stored values and use safe server defaults", () => {
  assert.equal(normalizeDashboardPreference("driver-tab", "changes"), "changes");
  assert.equal(normalizeDashboardPreference("driver-tab", "invalid"), "drivers");
  assert.equal(normalizeDashboardPreference("change-period", "quarterly"), "quarterly");
  assert.equal(normalizeDashboardPreference("change-period", null), "monthly");
  assert.equal(normalizeDashboardPreference("change-period", "invalid"), "monthly");
  assert.equal(readDashboardPreference("driver-tab"), "drivers");
});

test("dashboard selections still work in memory when browser storage is blocked", () => {
  const originalWindow = globalThis.window;
  const browser = new EventTarget();
  browser.localStorage = { getItem() { throw new Error("Blocked"); }, setItem() { throw new Error("Blocked"); } };
  globalThis.window = browser;
  try {
    writeDashboardPreference("driver-tab", "changes");
    writeDashboardPreference("change-period", "quarterly");
    assert.equal(readDashboardPreference("driver-tab"), "changes");
    assert.equal(readDashboardPreference("change-period"), "quarterly");
  } finally {
    writeDashboardPreference("driver-tab", "drivers");
    writeDashboardPreference("change-period", "monthly");
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("neutral factors do not create positive or negative drivers", () => {
  const result = scoreCommodity(fixture([0, 0]));
  assert.equal(result.score, 50);
  assert.equal(result.status, "neutral");
  assert.deepEqual(result.positiveDrivers, []);
  assert.deepEqual(result.negativeDrivers, []);
});

test("rank signed weighted impacts, not raw indicator scores", () => {
  const result = scoreCommodity(fixture([10, 5, -10, -5], [10, 40, 10, 40]));
  assert.deepEqual(result.positiveDrivers.map((driver) => driver.id), ["factor-1", "factor-0"]);
  assert.deepEqual(result.negativeDrivers.map((driver) => driver.id), ["factor-3", "factor-2"]);
  assert.equal(result.score, 50);
  assert.equal(result.positiveDrivers[0].contribution, 10);
  assert.equal(result.negativeDrivers[0].contribution, -10);
});

test("cap each direction at three drivers with deterministic ties", () => {
  const result = scoreCommodity(fixture([10, 10, 10, 10, -10, -10, -10, -10]));
  assert.deepEqual(result.positiveDrivers.map((driver) => driver.id), ["factor-0", "factor-1", "factor-2"]);
  assert.deepEqual(result.negativeDrivers.map((driver) => driver.id), ["factor-4", "factor-5", "factor-6"]);
});

test("invert unfavorable changes and clamp extreme scores", () => {
  const config = fixture([1000, -1000]);
  config.scoreRules.factors["factor-0"].direction = -1;
  const result = scoreCommodity(config);
  assert.equal(result.score, 0);
  assert.equal(result.status, "bearish");
  assert.ok(result.indicators.every((indicator) => indicator.score === 0));
});

test("reject invalid weights, rules and incomplete histories", () => {
  const badWeights = fixture([1, 2], [25, 25]);
  assert.throws(() => scoreCommodity(badWeights), /Invalid commodity/);
  const badRule = fixture([1]);
  badRule.scoreRules.factors["factor-0"].scale = 0;
  assert.throws(() => scoreCommodity(badRule), /Invalid indicator/);
  const badHistory = fixture([1]);
  badHistory.indicators[0].values = [100];
  assert.throws(() => scoreCommodity(badHistory), /Invalid indicator/);
});

test("preserve zero and negative prior-position behavior", () => {
  const config = fixture([1, 1]);
  config.indicators[0].values = [0, 10];
  config.indicators[1].values = [-100, -90];
  const result = scoreCommodity(config);
  assert.equal(result.indicators[0].change, 0);
  assert.equal(result.indicators[1].change, 10);
});

test("dated sourced factors compare actual YoY observations instead of adjacent daily values", () => {
  const config = fixture([0]);
  config.indicators[0].observations = [
    { time: Date.parse("2024-06-03") / 1000, value: 100 },
    { time: Date.parse("2025-06-02") / 1000, value: 109 },
    { time: Date.parse("2025-06-03") / 1000, value: 110 },
  ];
  const result = scoreCommodity(config);
  assert.equal(result.indicators[0].change, 10);
  assert.equal(result.score, 100);
  assert.equal(result.coverage, 100);
});

test("missing and stale sourced observations never fall back to seeded score values", () => {
  const config = fixture([10, -10], [50, 50]);
  config.indicators[0].observations = [];
  const result = scoreCommodity(config);
  assert.equal(result.indicators[0].score, null);
  assert.equal(result.coverage, 50);
  assert.equal(result.score, 0);
  assert.equal(result.indicators[1].contribution, -50);
  config.indicators[1].dataHealth = { kind: "sourced", status: "stale" };
  assert.equal(scoreCommodity(config).score, null);
  assert.equal(scoreCommodity(config).coverage, 0);
});

test("source health distinguishes fresh, stale, unavailable and sample observations", () => {
  const now = Date.parse("2026-11-11T12:00:00Z") / 1000;
  const points = [{ time: now - 86400, value: 100 }, { time: now - 366 * 86400, value: 110 }];
  const fresh = hydrateCommodityObservations({ ...commodityConfigurations.gold, scoringPolicy: researchPolicy }, { dxy: points, "real-yields": [] }, now);
  assert.equal(fresh.indicators.find((item) => item.id === "dxy").dataHealth.status, "fresh");
  assert.equal(fresh.indicators.find((item) => item.id === "real-rates").dataHealth.status, "unavailable");
  assert.equal(fresh.indicators.find((item) => item.id === "etf-holdings").dataHealth.status, "sample");
  assert.equal(scoreCommodity(fresh).coverage, 75);
  const stale = hydrateCommodityObservations({ ...commodityConfigurations.gold, scoringPolicy: researchPolicy }, { dxy: [points[1]] }, now);
  assert.equal(stale.indicators.find((item) => item.id === "dxy").dataHealth.status, "stale");
  assert.equal(scoreCommodity(stale).coverage, 55);
  assert.deepEqual(calculateCommodityChanges(commodityChangesInput(stale)).find((item) => item.id === "dxy").changes, { monthly: null, quarterly: null, yoy: null });
});

test("FRED and DXY observations reach the score and change engine; FRED blanks are not zero yields", async () => {
  const originalFetch = globalThis.fetch;
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  day.setUTCDate(day.getUTCDate() - 1);
  const previous = new Date(day);
  previous.setUTCFullYear(previous.getUTCFullYear() - 1);
  const asDate = (date) => date.toISOString().slice(0, 10);
  globalThis.fetch = async (url) => String(url).includes("fredgraph")
    ? new Response(`observation_date,DFII10\n${asDate(previous)},2\n${asDate(day)},1\n${asDate(new Date(day.getTime() + 86400000))},\n`)
    : Response.json({ chart: { result: [{ timestamp: [previous.getTime() / 1000, day.getTime() / 1000], indicators: { quote: [{ close: [100, 95] }] } }] } });
  try {
    const dashboard = await getMacroIndicators({ ...commodityConfigurations.gold, contextProvider: undefined, scoringPolicy: researchPolicy }, "en");
    assert.equal(dashboard.cards.find((card) => card.id === "real-rates").value, "1.00%");
    assert.equal(dashboard.cards.find((card) => card.id === "dxy").value, "95.0");
    assert.equal(dashboard.summary.dataMix.sourcedWeight, 45);
    assert.equal(dashboard.summary.coverage, 100);
    const changes = calculateCommodityChanges(commodityChangesInput(dashboard.config));
    assert.equal(changes.find((item) => item.id === "real-rates").changes.yoy, -1);
    assert.equal(changes.find((item) => item.id === "dxy").changes.yoy, -5);
    globalThis.fetch = async () => { throw new Error("Feed offline"); };
    const offline = await getMacroIndicators({ ...commodityConfigurations.gold, contextProvider: undefined, scoringPolicy: researchPolicy }, "en");
    assert.equal(offline.cards.find((card) => card.id === "dxy").factorScore, null);
    assert.equal(offline.cards.find((card) => card.id === "dxy").value, "—");
    assert.equal(offline.summary.coverage, 55);
    assert.equal(offline.summary.dataMix.sourcedWeight, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("duplicate sourced context cards are removed and their 90-day comparisons retained", async () => {
  const originalFetch = globalThis.fetch;
  const day = new Date(Date.now() - 86400000);
  day.setUTCHours(0, 0, 0, 0);
  const prior90 = new Date(day.getTime() - 90 * 86400000);
  const priorYear = new Date(day);
  priorYear.setUTCFullYear(priorYear.getUTCFullYear() - 1);
  const asDate = (date) => date.toISOString().slice(0, 10);
  globalThis.fetch = async (url) => String(url).includes("fredgraph")
    ? new Response(`observation_date,DFII10\n${asDate(priorYear)},1\n${asDate(prior90)},0\n${asDate(day)},2\n`)
    : Response.json({ chart: { result: [{ timestamp: [priorYear.getTime() / 1000, prior90.getTime() / 1000, day.getTime() / 1000], indicators: { quote: [{ close: [110, 100, 95] }] } }] } });
  try {
    const expectedContexts = { gold: 4, silver: 2, copper: 2, oil: 4 };
    for (const config of Object.values(commodityConfigurations)) {
      const dashboard = await getMacroIndicators(config, "en");
      assert.equal(dashboard.cards.filter((card) => card.group === "context").length, expectedContexts[config.commodity]);
      assert.ok(dashboard.cards.every((card) => !["live-dxy", "live-real-rates", "oil-dxy"].includes(card.id)));
      assert.equal(dashboard.cards.find((card) => card.id === "dxy").ninetyDayChange, "-5.0%");
      if (config.commodity !== "oil") assert.equal(dashboard.cards.find((card) => card.id === "real-rates").ninetyDayChange, "+2.00 pp");
    }
  } finally { globalThis.fetch = originalFetch; }
});

function changesFixture() {
  const indicator = { ...commodityConfigurations.silver.indicators[0], id: "demand", changeKind: "percentage", favorableDirection: 1 };
  const time = (date) => Date.parse(date) / 1000;
  return {
    commodity: "test", indicators: [indicator], weights: { demand: 100 },
    currentValues: { demand: { time: time("2025-03-31"), value: 120 } },
    historicalValues: { demand: [
      { time: time("2024-03-31"), value: 100 },
      { time: time("2024-12-31"), value: 110 },
      { time: time("2025-02-28"), value: 115 },
    ] },
  };
}

test("calculate calendar-month, quarter and YoY changes with month-end clamping", () => {
  const result = calculateCommodityChanges(changesFixture())[0].changes;
  assert.ok(Math.abs(result.monthly - 5 / 115 * 100) < 1e-8);
  assert.ok(Math.abs(result.quarterly - 10 / 110 * 100) < 1e-8);
  assert.equal(result.yoy, 20);
});

test("annual histories cannot be reused as monthly or quarterly observations", () => {
  const input = changesFixture();
  input.historicalValues.demand = input.historicalValues.demand.slice(0, 1);
  const result = calculateCommodityChanges(input)[0].changes;
  assert.equal(result.monthly, null);
  assert.equal(result.quarterly, null);
  assert.equal(result.yoy, 20);
});

test("rank changes by weight times magnitude and apply favorable direction", () => {
  const input = changesFixture();
  input.indicators = [
    { ...input.indicators[0], id: "demand" },
    { ...input.indicators[0], id: "dxy", favorableDirection: -1 },
    { ...input.indicators[0], id: "inventory", favorableDirection: -1 },
    { ...input.indicators[0], id: "neutral" },
  ];
  input.weights = { demand: 10, dxy: 40, inventory: 40, neutral: 10 };
  const changes = [
    { id: "demand", changes: { monthly: 10, quarterly: 0, yoy: 0 } },
    { id: "dxy", changes: { monthly: -5, quarterly: 0, yoy: 0 } },
    { id: "inventory", changes: { monthly: 8, quarterly: 0, yoy: 0 } },
    { id: "neutral", changes: { monthly: 0, quarterly: 0, yoy: 0 } },
  ];
  const result = rankCommodityChanges(input, changes, "monthly");
  assert.deepEqual(result.positive.map((driver) => driver.id), ["dxy", "demand"]);
  assert.equal(result.positive[0].impact, 200);
  assert.deepEqual(result.negative.map((driver) => driver.id), ["inventory"]);
});

test("point changes retain units; zero percentage baselines remain unavailable", () => {
  const input = changesFixture();
  input.indicators[0].changeKind = "points";
  assert.equal(calculateCommodityChanges(input)[0].changes.yoy, 20);
  input.indicators[0].changeKind = "percentage";
  input.historicalValues.demand[0].value = 0;
  assert.equal(calculateCommodityChanges(input)[0].changes.yoy, null);
  delete input.currentValues.demand;
  assert.deepEqual(calculateCommodityChanges(input)[0].changes, { monthly: null, quarterly: null, yoy: null });
});

test("rank at most three changes per direction with stable ties", () => {
  const input = changesFixture();
  input.indicators = Array.from({ length: 8 }, (_, index) => ({ ...input.indicators[0], id: `change-${index}` }));
  input.weights = Object.fromEntries(input.indicators.map((indicator) => [indicator.id, 12.5]));
  const changes = input.indicators.map((indicator, index) => ({ id: indicator.id, changes: { monthly: index < 4 ? 5 : -5, quarterly: null, yoy: null } }));
  const result = rankCommodityChanges(input, changes, "monthly");
  assert.deepEqual(result.positive.map((driver) => driver.id), ["change-0", "change-1", "change-2"]);
  assert.deepEqual(result.negative.map((driver) => driver.id), ["change-4", "change-5", "change-6"]);
});

test("recalculate from updated values without mutating stored histories", () => {
  const input = changesFixture();
  input.historicalValues.demand.reverse();
  const stored = structuredClone(input.historicalValues);
  assert.equal(calculateCommodityChanges(input)[0].changes.yoy, 20);
  input.currentValues.demand.value = 130;
  assert.equal(calculateCommodityChanges(input)[0].changes.yoy, 30);
  assert.deepEqual(input.historicalValues, stored);
});

test("research-only annual adapters provide YoY without invented shorter periods", () => {
  for (const config of Object.values(commodityConfigurations)) {
    const researchConfig = { ...config, scoringPolicy: researchPolicy };
    const input = commodityChangesInput(researchConfig);
    const result = calculateCommodityChanges(input);
    const scores = scoreCommodity(researchConfig);
    for (const [index, indicator] of result.entries()) {
      assert.equal(indicator.changes.monthly, null);
      assert.equal(indicator.changes.quarterly, null);
      assert.ok(Math.abs(indicator.changes.yoy - scores.indicators[index].change) < 1e-8);
    }
  }
});

test("explicit research mode preserves legacy sample scores and signed contributions", () => {
  const expected = { gold: 70, silver: 73, copper: 70, oil: 64 };
  for (const [commodity, config] of Object.entries(commodityConfigurations)) {
    const result = scoreCommodity({ ...config, scoringPolicy: researchPolicy });
    assert.equal(result.score, expected[commodity]);
    assert.equal(result.indicators.length, 8);
    assert.equal(config.years.filter((year) => year >= config.chartStartYear).length, 10);
    const rawScore = result.indicators.reduce((sum, indicator) => sum + indicator.weightedScore, 0);
    const netImpact = result.indicators.reduce((sum, indicator) => sum + indicator.contribution, 0);
    assert.ok(Math.abs(rawScore - config.scoreRules.baseline - netImpact) < 1e-8);
    assert.ok(result.positiveDrivers.length <= 3);
    assert.ok(result.negativeDrivers.length <= 3);
    assert.ok(result.positiveDrivers.every((driver) => driver.contribution > 0));
    assert.ok(result.negativeDrivers.every((driver) => driver.contribution < 0));
  }
  assert.deepEqual(scoreCommodity({ ...commodityConfigurations.silver, scoringPolicy: researchPolicy }).negativeDrivers, []);
  assert.equal(getCommodityConfiguration("not-a-commodity"), undefined);
  assert.equal(getCommodityConfiguration("__proto__"), undefined);
});

function summaryFixture(score, indicatorScores = [90, 90, 30], weights = [40, 30, 30]) {
  return {
    commodity: "test", commodityName: "Test Metal", score,
    indicatorScores: indicatorScores.map((value, index) => ({ id: `summary-${index}`, name: `Factor ${index}`, score: value, trend: "up" })),
    indicatorWeights: Object.fromEntries(weights.map((weight, index) => [`summary-${index}`, weight])),
    topPositiveDrivers: [], topNegativeDrivers: [],
  };
}

test("macro narrative covers every outlook boundary including score 80", () => {
  const boundaries = [[0, "strongly-bearish"], [19, "strongly-bearish"], [20, "bearish"], [39, "bearish"], [40, "neutral"], [59, "neutral"], [60, "bullish"], [79, "bullish"], [80, "bullish"], [81, "strongly-bullish"], [100, "strongly-bullish"]];
  for (const [score, outlook] of boundaries) assert.equal(generateMacroSummary(summaryFixture(score), "en").outlook, outlook);
  assert.throws(() => generateMacroSummary(summaryFixture(NaN), "en"), /Invalid/);
});

test("confidence uses weight agreeing with the outlook, not largest opposing group", () => {
  assert.equal(generateMacroSummary(summaryFixture(70), "en").confidence, "high");
  assert.equal(generateMacroSummary(summaryFixture(70, [90, 30], [50, 50]), "en").confidence, "medium");
  assert.equal(generateMacroSummary(summaryFixture(70, [90, 30], [49, 51]), "en").confidence, "low");
  assert.equal(generateMacroSummary(summaryFixture(50, [50, 50], [70, 30]), "en").confidence, "high");
  assert.equal(generateMacroSummary(summaryFixture(25, [30, 90], [69, 31]), "en").confidence, "medium");
});

test("narratives rank three positives and two negatives and remain deterministic", () => {
  const input = summaryFixture(60, [100, 80, 70, 60, 0, 10, 20], [10, 20, 10, 10, 20, 20, 10]);
  const first = generateMacroSummary(input, "en");
  assert.deepEqual(first, generateMacroSummary(input, "en"));
  assert.deepEqual(first.positiveDrivers, ["summary-1", "summary-0", "summary-2"]);
  assert.deepEqual(first.negativeDrivers, ["summary-4", "summary-5"]);
  assert.ok(!first.summary.includes("Factor 3"));
  assert.ok(!first.summary.includes("Factor 6"));
});

test("neutral narrative invents no drivers and respects current indicator trends", () => {
  const neutral = generateMacroSummary(summaryFixture(50, [50], [100]), "en");
  assert.deepEqual(neutral.positiveDrivers, []);
  assert.deepEqual(neutral.negativeDrivers, []);
  assert.ok(neutral.summary.includes("balanced"));
  const falling = summaryFixture(70, [90], [100]);
  falling.indicatorScores[0].trend = "down";
  assert.ok(generateMacroSummary(falling, "en").summary.includes("falling Factor 0"));
  assert.ok(generateMacroSummary(falling, "tr").summary.includes("Factor 0 düşüşü"));
});

test("all commodity narratives use actual score drivers without external calls", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Narratives must not fetch external services"); };
  try {
    for (const config of Object.values(commodityConfigurations)) {
      for (const locale of ["en", "tr"]) {
        const dashboard = await getMacroIndicators({ ...config, contextProvider: undefined, scoreSources: undefined, scoringPolicy: researchPolicy }, locale);
        const input = {
          commodity: config.commodity, commodityName: config.name[locale], score: dashboard.summary.score,
          indicatorScores: dashboard.cards.map((card) => ({ id: card.id, name: card.name, score: card.factorScore, trend: card.trend })),
          indicatorWeights: config.weights,
          topPositiveDrivers: dashboard.summary.positiveDrivers, topNegativeDrivers: dashboard.summary.negativeDrivers,
          tone: config.summaryTone?.[locale], rules: config.scoreRules,
        };
        const result = generateMacroSummary(input, locale);
        assert.deepEqual(result.positiveDrivers, dashboard.summary.positiveDrivers.map((driver) => driver.id));
        assert.deepEqual(result.negativeDrivers, dashboard.summary.negativeDrivers.slice(0, 2).map((driver) => driver.id));
        assert.ok(result.agreement >= 0);
        assert.ok(result.agreement <= 100);
        assert.ok(result.summary.includes(config.name[locale]));
        assert.ok(!result.summary.includes("property sector"));
        assert.ok(!result.summary.includes("US production"));
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("missing indicator scores do not inflate confidence", () => {
  const input = summaryFixture(70, [90], [40, 60]);
  const result = generateMacroSummary(input, "en");
  assert.equal(result.agreement, 40);
  assert.equal(result.confidence, "low");
});

test("active indicators count valid weighted scores, including neutral and zero scores", () => {
  const input = summaryFixture(50, [0, 50, 100, NaN, 101, -1, 80, 90], [10, 10, 10, 10, 10, 10, 0, 0]);
  input.indicatorScores.push({ ...input.indicatorScores[1] });
  input.indicatorScores.push({ id: "missing-weight", name: "Missing weight", score: 90, trend: "up" });
  const before = generateMacroSummary(input, "en");
  assert.equal(countActiveIndicators(input), 3);
  assert.deepEqual(generateMacroSummary(input, "en"), before);
  assert.equal(countActiveIndicators({ indicatorScores: [], indicatorWeights: {} }), 0);
});

test("explicit research summaries can use eight sample indicators", async () => {
  for (const config of Object.values(commodityConfigurations)) {
    const dashboard = await getMacroIndicators({ ...config, contextProvider: undefined, scoreSources: undefined, scoringPolicy: researchPolicy }, "en");
    const input = {
      indicatorScores: dashboard.cards.map((card) => ({ id: card.id, name: card.name, score: card.factorScore, trend: card.trend })),
      indicatorWeights: config.weights,
    };
    assert.equal(countActiveIndicators(input), 8);
  }
});

test("price relationship strength respects positive and negative boundaries", () => {
  const cases = [[1, "strong-positive"], [0.7, "strong-positive"], [0.69, "moderate-positive"], [0.3, "moderate-positive"], [0.29, "weak"], [0, "weak"], [-0.29, "weak"], [-0.3, "moderate-negative"], [-0.69, "moderate-negative"], [-0.7, "strong-negative"], [-1, "strong-negative"]];
  for (const [value, strength] of cases) assert.equal(classifyPriceRelationship(value).strength, strength);
});

test("price relationship impact uses absolute correlation and exact star thresholds", () => {
  const cases = [[0, 1, "minimal"], [0.19, 1, "minimal"], [0.2, 2, "low"], [0.4, 3, "medium"], [0.6, 4, "high"], [0.8, 5, "very-high"], [1, 5, "very-high"]];
  for (const [value, stars, impact] of cases) {
    for (const sign of [1, -1]) {
      const result = classifyPriceRelationship(value * sign);
      assert.equal(result.stars, stars);
      assert.equal(result.impact, impact);
    }
  }
});

test("unknown and invalid correlations are not presented as weak zero correlations", () => {
  for (const value of [undefined, null, NaN, Infinity, 1.01, -1.01]) {
    const result = classifyPriceRelationship(value);
    assert.equal(result.correlation, null);
    assert.equal(result.strength, "unavailable");
    assert.equal(result.stars, 0);
  }
});

test("supplied Gold correlations propagate without leaking to other commodities", async () => {
  for (const config of Object.values(commodityConfigurations)) {
    const dashboard = await getMacroIndicators({ ...config, contextProvider: undefined, scoreSources: undefined }, "en");
    for (const card of dashboard.cards) {
      assert.equal(card.commodityName, config.name.en);
      assert.equal(card.priceCorrelation, config.priceRelationships?.[card.id]);
      if (config.commodity !== "gold") assert.equal(card.priceCorrelation, undefined);
    }
  }
  assert.equal(commodityConfigurations.gold.priceRelationships["etf-holdings"], 0.81);
  assert.equal(classifyPriceRelationship(commodityConfigurations.gold.priceRelationships.dxy).stars, 4);
});

test("an additional commodity uses only configuration, without a context fetch", async () => {
  const scoring = fixture([10], [100]);
  const config = {
    ...commodityConfigurations.silver, ...scoring,
    commodity: "platinum-test", name: { en: "Platinum", tr: "Platin" },
    dashboardTitle: { en: "Platinum Macro Indicators", tr: "Platin Makro Göstergeleri" },
    scoreTitle: { en: "Platinum Macro Score", tr: "Platin Makro Puanı" },
    disclosure: { en: "Test fixture only", tr: "Yalnızca test verisi" },
    market: { symbol: "PL=F", unit: "oz" }, contextProvider: undefined, scoreSources: undefined,
    indicators: scoring.indicators.map((indicator) => ({ ...commodityConfigurations.silver.indicators[0], ...indicator, name: { en: "Test demand", tr: "Test talebi" } })),
  };
  commodityConfigurations[config.commodity] = config;
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => { fetchCount += 1; throw new Error("Unexpected context fetch"); };
  try {
    assert.equal(getCommodityConfiguration(config.commodity), config);
    for (const locale of ["en", "tr"]) {
      const dashboard = await getMacroIndicators(config, locale);
      assert.equal(dashboard.cards.length, 1);
      assert.equal(dashboard.cards[0].name, config.indicators[0].name[locale]);
      assert.equal(dashboard.summary.score, 100);
      assert.equal(dashboard.summary.positiveDrivers[0].name, config.indicators[0].name[locale]);
      assert.equal(dashboard.summary.positiveDrivers[0].contribution, 50);
      assert.deepEqual(dashboard.summary.negativeDrivers, []);
    }
    assert.equal(fetchCount, 0);
    globalThis.fetch = async (url) => {
      assert.match(String(url), /PL%3DF/);
      return Response.json({ chart: { result: [{ meta: { regularMarketPrice: 110 }, timestamp: [1704067200, 1735689600], indicators: { quote: [{ close: [100, 110], high: [102, 112], low: [98, 108] }] } }] } });
    };
    const header = await getCommodityHeaderData(config);
    assert.equal(header.unit, "oz");
    assert.equal(header.price, 110);
    assert.equal(header.oneYearReturn, 10);
  } finally {
    globalThis.fetch = originalFetch;
    delete commodityConfigurations[config.commodity];
  }
});