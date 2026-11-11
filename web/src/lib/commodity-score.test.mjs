import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { scoreCommodity } from "./commodity-score.ts";
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
const { commodityConfigurations, getCommodityConfiguration } = await import("./commodity-config.ts");
const { getMacroIndicators, getCommodityHeaderData } = await import("./indicators.ts");
const { generateMacroSummary } = await import("./macro-summary.ts");
aliases.deregister();

function fixture(changes, weights = changes.map(() => 100 / changes.length)) {
  const indicators = changes.map((change, index) => ({ id: `factor-${index}`, changeKind: "percentage", values: [100, 100 + change] }));
  return {
    commodity: "test", years: [2024, 2025], chartStartYear: 2024, indicators,
    weights: Object.fromEntries(indicators.map((indicator, index) => [indicator.id, weights[index]])),
    scoreRules: { baseline: 50, sensitivity: 50, bullish: 60, bearish: 40, factors: Object.fromEntries(indicators.map((indicator) => [indicator.id, { direction: 1, scale: 10, trendThreshold: 0.5 }])) },
  };
}

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

test("all commodity annual adapters provide YoY without invented shorter periods", () => {
  for (const config of Object.values(commodityConfigurations)) {
    const input = commodityChangesInput(config);
    const result = calculateCommodityChanges(input);
    const scores = scoreCommodity(config);
    for (const [index, indicator] of result.entries()) {
      assert.equal(indicator.changes.monthly, null);
      assert.equal(indicator.changes.quarterly, null);
      assert.ok(Math.abs(indicator.changes.yoy - scores.indicators[index].change) < 1e-8);
    }
  }
});

test("all registered commodities preserve scores and signed contributions", () => {
  const expected = { gold: 70, silver: 73, copper: 70, oil: 64 };
  for (const [commodity, config] of Object.entries(commodityConfigurations)) {
    const result = scoreCommodity(config);
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
  assert.deepEqual(scoreCommodity(commodityConfigurations.silver).negativeDrivers, []);
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
        const dashboard = await getMacroIndicators({ ...config, contextProvider: undefined }, locale);
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
    const dashboard = await getMacroIndicators({ ...config, contextProvider: undefined }, "en");
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
    market: { symbol: "PL=F", unit: "oz" }, contextProvider: undefined,
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