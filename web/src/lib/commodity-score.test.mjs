import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { classifyPriceRelationship } from "./price-relationship.ts";

process.env.SOURCE_ARCHIVE_ENABLED = "false";
process.env.YAHOO_FINANCE_AUTOMATED_ACCESS_CONFIRMED = "true";
process.env.MARKET_DATA_PUBLIC_DISTRIBUTION_CONFIRMED = "true";
process.env.FRED_M2SL_PUBLIC_USE_CONFIRMED = "true";
process.env.FRED_T5YIE_PUBLIC_USE_CONFIRMED = "true";
process.env.FRED_DFII10_PUBLIC_USE_CONFIRMED = "true";
process.env.FRED_DTWEXBGS_PUBLIC_USE_CONFIRMED = "true";
process.env.FRED_API_KEY = "test-api-key";
process.env.WGC_CENTRAL_BANK_GOLD_PUBLIC_USE_CONFIRMED = "false";
process.env.WGC_GOLD_ETF_PUBLIC_USE_CONFIRMED = "false";
process.env.GPR_CI_PUBLIC_USE_CONFIRMED = "false";

const aliases = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return nextResolve(new URL("./server-only.stub.mjs", import.meta.url).href, context);
    }
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`${specifier.slice(2)}.ts`, new URL("../", import.meta.url)).href, context);
    }
    return nextResolve(specifier, context);
  },
});
const { calculateCommodityChanges, commodityChangesInput, rankCommodityChanges } = await import("./commodity-changes.ts");
const { scoreCommodity } = await import("./commodity-score.ts");
const { commodityConfigurations, getCommodityConfiguration } = await import("./commodity-config.ts");
const { getMacroIndicators, getCommodityHeaderData } = await import("./indicators.ts");
const { countActiveIndicators, generateMacroSummary } = await import("./macro-summary.ts");
const { hydrateCommodityObservations } = await import("./commodity-data.ts");
const { availableObservation, parseFredObservations, fredSeriesDefinitions, monthlyPeriodIsRecent } = await import("./observation-data.ts");
const { createSourceSnapshot, verifySourceSnapshot, snapshotChanges, snapshotKnownAt } = await import("./source-snapshots.ts");
const { archiveSourceSnapshot, archivedSnapshotKnownAt } = await import("./snapshot-archive.ts");
const { latestH6Release, compareH6Release } = await import("./release-evidence.ts");
const { getSourceRights } = await import("./source-rights.ts");
const { parseCftcGoldManagedMoney, cftcGoldCotSeriesId } = await import("./cftc-cot.ts");
const { parseRecentGprRows, gprSeriesId, gprDownloadUrl } = await import("./gpr.ts");
const XLSX = await import("@e965/xlsx");
const { currentGoldSeasonality, goldSeasonalityProfile } = await import("./gold-macro-data.ts");
const { derivedDataHealth, currentStressIndex, stressIndexAt } = await import("./derived-data.ts");
const { normalizeDashboardPreference, readDashboardPreference, writeDashboardPreference } = await import("./dashboard-preferences.ts");
aliases.deregister();

const researchPolicy = { mode: "research", minimumCoverage: 0, requiredIndicators: [], approvedIndicators: [] };

function fredResponse(seriesId, observations) {
  return Response.json({ observations: observations.map(([date, value]) => ({ date, value: String(value) })) });
}

function withoutWgcSources(config) {
  return {
    ...config,
    scoreSources: Object.fromEntries(Object.entries(config.scoreSources ?? {})
      .filter(([id]) => !["central-bank-purchases", "etf-holdings"].includes(id))),
  };
}

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

test("registered public commodities approve only explicitly cleared Gold factors", () => {
  for (const config of Object.values(commodityConfigurations)) {
    const result = scoreCommodity(config);
    assert.equal(result.policy.mode, "sourced-only");
    assert.equal(result.policy.minimumCoverage, 80);
    assert.ok(result.policy.requiredIndicators.length > 0);
    assert.deepEqual(result.policy.approvedIndicators, config.commodity === "gold"
      ? ["gold-seasonality", "real-rates", "dxy", "breakeven", "central-bank-purchases", "etf-holdings", "cot-positioning"] : []);
    assert.equal(result.score, null);
    assert.equal(result.coverage, config.commodity === "gold" ? 5 : 0);
    assert.ok(result.indicators.filter((indicator) => indicator.id !== "gold-seasonality").every((indicator) => indicator.score === null));
    if (config.commodity === "gold") assert.ok(result.indicators.find((indicator) => indicator.id === "gold-seasonality").score !== null);
  }
});

test("gold seasonality is a five-percent Tier 1 factor scored from the current month's return", async () => {
  const config = commodityConfigurations.gold;
  const seasonality = config.indicators.find((indicator) => indicator.id === "gold-seasonality");
  assert.equal(config.weights["real-rates"], 25);
  assert.equal(config.weights.dxy, 10);
  assert.equal(config.weights.breakeven, 10);
  assert.equal(config.weights["gold-seasonality"], 5);
  assert.equal(seasonality.tier, 1);
  assert.equal(seasonality.scoreMode, "level");
  assert.ok(config.scoringPolicy.requiredIndicators.includes("gold-seasonality"));
  assert.equal(Object.values(config.weights).reduce((total, weight) => total + weight, 0), 100);

  const researchConfig = { ...config, scoringPolicy: researchPolicy };
  const scored = scoreCommodity(researchConfig).indicators.find((indicator) => indicator.id === "gold-seasonality");
  assert.equal(scored.current, currentGoldSeasonality());
  assert.equal(scored.previous, null);
  assert.equal(scored.change, null);
  assert.equal(scored.score, Math.max(0, Math.min(100, 50 + currentGoldSeasonality() / 2.5 * 50)));

  const dashboard = await getMacroIndicators({ ...researchConfig, contextProvider: undefined, scoreSources: undefined }, "en");
  const cards = dashboard.cards.filter((card) => card.id === "gold-seasonality");
  assert.equal(cards.length, 1);
  assert.equal(cards[0].group, "tier1");
  assert.equal(cards[0].chart.points.length, goldSeasonalityProfile.length);
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  assert.equal(cards[0].dataHealth.status, "fresh");
  assert.equal(cards[0].dataHealth.observedAt, monthStart.getTime() / 1000);
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

test("public dashboards hide samples with undocumented origins while excluding them from score and narrative", async () => {
  for (const config of Object.values(commodityConfigurations)) {
    const dashboard = await getMacroIndicators({ ...config, scoreSources: undefined, contextProvider: undefined }, "en");
    assert.equal(dashboard.summary.score, null);
    assert.equal(dashboard.summary.coverage, config.commodity === "gold" ? 5 : 0);
    assert.deepEqual(dashboard.summary.dataMix, config.commodity === "gold"
      ? { sourcedWeight: 5, sampleWeight: 0, excludedWeight: 95 }
      : { sourcedWeight: 0, sampleWeight: 0, excludedWeight: 100 });
    assert.equal(dashboard.summary.release.approvedCount, config.commodity === "gold" ? 7 : 0);
    assert.equal(dashboard.summary.release.referenceSampleWeight, config.commodity === "gold" ? 95 : 100);
    const seasonality = dashboard.cards.find((card) => card.id === "gold-seasonality");
    const unverifiedSamples = dashboard.cards.filter((card) => card.id !== "gold-seasonality");
    assert.ok(unverifiedSamples.every((card) => card.value === "—" && card.factorScore === null && card.scoreExclusion === "sample"));
    assert.ok(unverifiedSamples.every((card) => card.explanation.includes("origin and reuse rights")));
    assert.ok(unverifiedSamples.every((card) => card.chart?.points.length === 0));
    assert.ok(unverifiedSamples.every((card) => card.dataHealth.rights?.some((rights) => rights.status === "provenance-unverified")));
    if (seasonality) {
      assert.equal(seasonality.group, "tier1");
      assert.notEqual(seasonality.factorScore, null);
      assert.equal(seasonality.scoreExclusion, null);
      assert.equal(seasonality.chart.points.length, goldSeasonalityProfile.length);
    }
    assert.deepEqual(dashboard.summary.positiveDrivers, []);
    assert.deepEqual(dashboard.summary.negativeDrivers, []);
    assert.throws(() => generateMacroSummary({ ...summaryFixture(50), score: dashboard.summary.score }, "en"), /Invalid/);
  }
});

test("Gold dashboard hydrates reported central-bank changes and global ETF holdings from WGC data", async () => {
  const previousCentralBankFlag = process.env.WGC_CENTRAL_BANK_GOLD_PUBLIC_USE_CONFIRMED;
  const previousEtfFlag = process.env.WGC_GOLD_ETF_PUBLIC_USE_CONFIRMED;
  process.env.WGC_CENTRAL_BANK_GOLD_PUBLIC_USE_CONFIRMED = "true";
  process.env.WGC_GOLD_ETF_PUBLIC_USE_CONFIRMED = "true";
  const config = {
    ...commodityConfigurations.gold,
    contextProvider: undefined,
    scoreSources: {
      "central-bank-purchases": "wgc-central-bank",
      "etf-holdings": "wgc-etf-holdings",
    },
  };
  try {
    const dashboard = await getMacroIndicators(config, "en");
    const centralBank = dashboard.config.indicators.find((indicator) => indicator.id === "central-bank-purchases");
    const etfHoldings = dashboard.config.indicators.find((indicator) => indicator.id === "etf-holdings");

    assert.equal(centralBank.dataHealth.status, "fresh");
    assert.equal(centralBank.dataHealth.reportingPeriod.label, "2026-09");
    assert.equal(centralBank.dataHealth.provenance.measurement, "flow");
    assert.ok(Number.isFinite(centralBank.observations.at(-1).value));
    assert.equal(etfHoldings.dataHealth.status, "fresh");
    assert.equal(etfHoldings.dataHealth.reportingPeriod.label, "2026-10");
    assert.equal(etfHoldings.dataHealth.provenance.measurement, "stock");
    assert.equal(etfHoldings.observations.at(-1).value, 4275.06069819);
    assert.notEqual(dashboard.cards.find((card) => card.id === "central-bank-purchases").value, "—");
    assert.notEqual(dashboard.cards.find((card) => card.id === "etf-holdings").value, "—");
  } finally {
    process.env.WGC_CENTRAL_BANK_GOLD_PUBLIC_USE_CONFIRMED = previousCentralBankFlag;
    process.env.WGC_GOLD_ETF_PUBLIC_USE_CONFIRMED = previousEtfFlag;
  }
});

test("WGC public-use flags fail closed for both dashboard series", async () => {
  const previousCentralBankFlag = process.env.WGC_CENTRAL_BANK_GOLD_PUBLIC_USE_CONFIRMED;
  const previousEtfFlag = process.env.WGC_GOLD_ETF_PUBLIC_USE_CONFIRMED;
  process.env.WGC_CENTRAL_BANK_GOLD_PUBLIC_USE_CONFIRMED = "false";
  process.env.WGC_GOLD_ETF_PUBLIC_USE_CONFIRMED = "false";
  try {
    const config = {
      ...commodityConfigurations.gold,
      contextProvider: undefined,
      scoreSources: {
        "central-bank-purchases": "wgc-central-bank",
        "etf-holdings": "wgc-etf-holdings",
      },
    };
    const dashboard = await getMacroIndicators(config, "en");
    const cards = dashboard.cards.filter((card) => ["central-bank-purchases", "etf-holdings"].includes(card.id));
    assert.equal(cards.length, 2);
    assert.ok(cards.every((card) => card.value === "—" && card.dataHealth.status === "unavailable"));
    assert.ok(cards.every((card) => card.chart.points.length === 0));
  } finally {
    process.env.WGC_CENTRAL_BANK_GOLD_PUBLIC_USE_CONFIRMED = previousCentralBankFlag;
    process.env.WGC_GOLD_ETF_PUBLIC_USE_CONFIRMED = previousEtfFlag;
  }
});

test("CFTC Gold COT parser calculates weekly Managed Money net contracts", () => {
  const retrievedAt = Date.parse("2026-11-14T12:00:00Z") / 1000;
  const observations = parseCftcGoldManagedMoney([
    { cftc_contract_market_code: "088691", report_date_as_yyyy_mm_dd: "2026-11-03T00:00:00.000", m_money_positions_long_all: "122283", m_money_positions_short_all: "18669" },
    { cftc_contract_market_code: "088691", report_date_as_yyyy_mm_dd: "2025-10-28T00:00:00.000", m_money_positions_long_all: "100000", m_money_positions_short_all: "20000" },
  ], retrievedAt);
  assert.deepEqual(observations.map((point) => point.value), [80, 103.614]);
  assert.equal(observations.at(-1).reportingPeriod.frequency, "weekly");
  assert.equal(observations.at(-1).provenance.seriesId, cftcGoldCotSeriesId);
  assert.equal(observations.at(-1).provenance.rawUnit, "contracts");
  assert.deepEqual(parseCftcGoldManagedMoney([
    { cftc_contract_market_code: "088691", report_date_as_yyyy_mm_dd: "2026-11-03", m_money_positions_long_all: "not-a-number", m_money_positions_short_all: "1" },
  ], retrievedAt), []);
});

test("Gold dashboard uses the approved CFTC COT feed as a sourced score factor", async () => {
  const originalFetch = globalThis.fetch;
  const previousFlag = process.env.CFTC_COT_GOLD_PUBLIC_USE_CONFIRMED;
  process.env.CFTC_COT_GOLD_PUBLIC_USE_CONFIRMED = "true";
  const latestDate = new Date();
  latestDate.setUTCHours(0, 0, 0, 0);
  latestDate.setUTCDate(latestDate.getUTCDate() - (latestDate.getUTCDay() + 5) % 7);
  const priorDate = new Date(latestDate);
  priorDate.setUTCDate(priorDate.getUTCDate() - 371);
  const formatDate = (date) => date.toISOString().slice(0, 10);
  let fetchCount = 0;
  globalThis.fetch = async (raw) => {
    const url = new URL(String(raw));
    assert.equal(url.hostname, "publicreporting.cftc.gov");
    assert.equal(url.pathname, "/resource/72hh-3qpy.json");
    assert.ok(url.searchParams.get("$where").includes("088691"));
    assert.equal(url.searchParams.get("$limit"), "650");
    fetchCount += 1;
    return Response.json([
      { cftc_contract_market_code: "088691", report_date_as_yyyy_mm_dd: `${formatDate(latestDate)}T00:00:00.000`, m_money_positions_long_all: "123456", m_money_positions_short_all: "20000" },
      { cftc_contract_market_code: "088691", report_date_as_yyyy_mm_dd: `${formatDate(priorDate)}T00:00:00.000`, m_money_positions_long_all: "100000", m_money_positions_short_all: "20000" },
    ]);
  };
  try {
    const config = {
      ...commodityConfigurations.gold,
      contextProvider: undefined,
      scoreSources: { "cot-positioning": "cftc-gold-cot" },
    };
    const dashboard = await getMacroIndicators(config, "en");
    const cot = dashboard.cards.find((card) => card.id === "cot-positioning");
    assert.equal(fetchCount, 1);
    assert.equal(cot.value, "103k");
    assert.equal(cot.dataHealth.status, "fresh");
    assert.equal(cot.dataHealth.frequency, "weekly");
    assert.equal(cot.dataHealth.freshnessBasis, "reporting-lag");
    assert.equal(cot.factorScore, 100);
    assert.equal(cot.scoreExclusion, null);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousFlag === undefined) delete process.env.CFTC_COT_GOLD_PUBLIC_USE_CONFIRMED;
    else process.env.CFTC_COT_GOLD_PUBLIC_USE_CONFIRMED = previousFlag;
  }
});

function excelMonthSerial(year, month) {
  return (Date.UTC(year, month - 1, 1) - Date.UTC(1899, 11, 30)) / 86_400_000;
}

function gprWorksheetRows(latestValue = 150.5) {
  const latest = new Date();
  latest.setUTCDate(1);
  latest.setUTCMonth(latest.getUTCMonth() - 1);
  const prior = new Date(latest);
  prior.setUTCFullYear(prior.getUTCFullYear() - 1);
  const monthSerial = (date) => excelMonthSerial(date.getUTCFullYear(), date.getUTCMonth() + 1);
  return [
    ["month", "GPR", "GPRT", "var_name", "var_label"],
    [1, null, null, "GPR", "Recent GPR (Index: 1985:2019=100)"],
    [32, null, null, "GPRT", "Recent GPR Threats (Index: 1985:2019=100)"],
    [monthSerial(prior), 140, 110, null, null],
    [monthSerial(latest), latestValue, 120, null, null],
  ];
}

test("GPR parser selects only the monthly Recent GPR index and retains its vintage", () => {
  const retrievedAt = Date.now() / 1000;
  const observations = parseRecentGprRows(gprWorksheetRows(), retrievedAt);
  assert.deepEqual(observations.map((point) => point.value), [140, 150.5]);
  assert.equal(observations.at(-1).reportingPeriod.frequency, "monthly");
  assert.equal(observations.at(-1).reportingPeriod.label, observations.at(-1).reportingPeriod.start.slice(0, 7));
  assert.equal(observations.at(-1).provenance.seriesId, gprSeriesId);
  assert.equal(observations.at(-1).provenance.vintage, new Date(retrievedAt * 1000).toISOString().slice(0, 10));
  assert.equal(observations.at(-1).provenance.revisionStatus, "preliminary");
  assert.equal(observations.at(-1).provenance.aggregation, "monthly-index");
  const otherVariant = gprWorksheetRows();
  otherVariant[1][4] = "Historical GPR Index";
  assert.deepEqual(parseRecentGprRows(otherVariant, retrievedAt), []);
});

test("Gold and Oil hydrate the licensed GPR workbook as sourced monthly data without scoring approval", async () => {
  const originalFetch = globalThis.fetch;
  const previousFlag = process.env.GPR_CI_PUBLIC_USE_CONFIRMED;
  process.env.GPR_CI_PUBLIC_USE_CONFIRMED = "true";
  const worksheet = XLSX.utils.aoa_to_sheet(gprWorksheetRows());
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  const workbookBytes = XLSX.write(workbook, { type: "array", bookType: "biff8" });
  let fetchCount = 0;
  globalThis.fetch = async (raw, options) => {
    assert.equal(String(raw), gprDownloadUrl);
    assert.equal(options.cache, "no-store");
    fetchCount += 1;
    return new Response(workbookBytes, { headers: { "content-type": "application/vnd.ms-excel" } });
  };
  try {
    for (const configuration of [commodityConfigurations.gold, commodityConfigurations.oil]) {
      const config = { ...configuration, contextProvider: undefined, scoreSources: { "geopolitical-risk": "gpr" } };
      const dashboard = await getMacroIndicators(config, "en");
      const gpr = dashboard.cards.find((card) => card.id === "geopolitical-risk");
      assert.equal(gpr.value, "151");
      assert.equal(gpr.dataHealth.status, "fresh");
      assert.equal(gpr.dataHealth.frequency, "monthly");
      assert.equal(gpr.dataHealth.provenance.aggregation, "monthly-index");
      assert.equal(gpr.scoreExclusion, "unapproved");
    }
    assert.equal(fetchCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousFlag === undefined) delete process.env.GPR_CI_PUBLIC_USE_CONFIRMED;
    else process.env.GPR_CI_PUBLIC_USE_CONFIRMED = previousFlag;
  }
});

function derivedFixture() {
  const now = Date.parse("2026-11-11T12:00:00Z") / 1000;
  const values = { gold: [100, 110], dxy: [100, 95], "real-rates": [0, 1] };
  const inputs = Object.entries(values).map(([id, amounts]) => ({ id, source: id, maxAgeDays: id === "real-rates" ? 5 : 10,
    points: [{ time: now - 90 * 86400, value: amounts[0] }, { time: now, value: amounts[1] }],
  }));
  return { now, inputs };
}

test("derived health inherits a stale rate dependency instead of a fresh output date", () => {
  const { now, inputs } = derivedFixture();
  inputs[2].points = inputs[2].points.map((point) => ({ ...point, time: point.time - 101 * 86400 }));
  const result = currentStressIndex(inputs, now);
  assert.equal(result.score, null);
  assert.equal(result.health.status, "stale");
  assert.equal(result.health.observedAt, now - 101 * 86400);
  assert.equal(result.health.dependencies.find((input) => input.id === "real-rates").status, "stale");
});

test("stress index uses bounded observations and a common calculation date", () => {
  const { now, inputs } = derivedFixture();
  assert.equal(currentStressIndex(inputs, now).score, 62);
  inputs[2].points = inputs[2].points.map((point) => ({ ...point, time: point.time - 2 * 86400 }));
  for (const input of inputs.slice(0, 2)) {
    input.points.push({ time: now - 92 * 86400, value: 100 }, { time: now - 2 * 86400, value: 100 });
  }
  const result = currentStressIndex(inputs, now);
  assert.equal(result.asOf, now - 2 * 86400);
  assert.equal(result.score, 33);
  assert.equal(result.health.status, "fresh");
});

test("derived missing inputs, historical gaps and future-only observations fail closed", () => {
  const { now, inputs } = derivedFixture();
  assert.equal(currentStressIndex(inputs.slice(0, 2), now).health.status, "unavailable");
  assert.equal(currentStressIndex(inputs.slice(0, 2), now).score, null);
  inputs[1].points[0].time -= 30 * 86400;
  assert.equal(stressIndexAt(inputs, now), null);
  assert.equal(currentStressIndex(inputs, now).health.status, "unavailable");
  inputs[1].points = [{ time: now + 86400, value: 100 }];
  assert.equal(derivedDataHealth(inputs, now).status, "unavailable");
  assert.equal(stressIndexAt(inputs, now + 500 * 86400), null);
});

test("Silver stress card propagates stale and missing dependency health through actual assembly", async () => {
  const originalFetch = globalThis.fetch;
  const day = new Date(Date.now() - 86400000);
  day.setUTCHours(12, 0, 0, 0);
  const now = day.getTime() / 1000;
  const offsets = [182, 101, 92, 90, 8, 2, 0];
  let scenario = "fresh";
  globalThis.fetch = async (raw) => {
    const url = new URL(String(raw));
    if (url.hostname === "api.stlouisfed.org") {
      if (scenario === "missing-rates") return new Response("Unavailable", { status: 503 });
      const shift = scenario === "stale-rates" ? 101 : scenario === "delayed-rates" ? 7 : 0;
      return fredResponse("DFII10", offsets.map((offset, index) => [
        new Date((now - (offset + shift) * 86400) * 1000).toISOString().slice(0, 10),
        [-1, -0.1, -0.05, 0, 0.1, 0.9, 1][index],
      ]));
    }
    const symbol = decodeURIComponent(url.pathname.split("/").at(-1));
    const shift = scenario === "stale-gold" && symbol === "GC=F" ? 60 : 0;
    const timestamp = offsets.map((offset) => now - (offset + shift) * 86400);
    return Response.json({ chart: { result: [{ meta: { regularMarketTime: timestamp.at(-1), regularMarketPrice: 110 }, timestamp, indicators: { quote: [{ close: offsets.map((_, index) => 100 + index * 2.5) }] } }] } });
  };
  try {
    const dashboard = () => getMacroIndicators({ ...commodityConfigurations.silver, scoreSources: undefined }, "en");
    const fresh = (await dashboard()).cards.find((card) => card.id === "stress-index");
    assert.equal(fresh.dataHealth.status, "fresh");
    assert.notEqual(fresh.value, "—");
    assert.equal(fresh.dataHealth.dependencies.length, 3);
    const realRates = (await dashboard()).cards.find((card) => card.id === "live-real-rates");
    assert.equal(realRates.trend, "up");
    assert.equal(realRates.impact, "bearish");
    scenario = "stale-rates";
    const stale = (await dashboard()).cards.find((card) => card.id === "stress-index");
    assert.equal(stale.value, "—");
    assert.equal(stale.score, undefined);
    assert.equal(stale.impact, "unavailable");
    assert.equal(stale.dataHealth.status, "stale");
    assert.equal(stale.dataHealth.dependencies.find((input) => input.id === "real-rates").observedAt, now - 101 * 86400);
    assert.ok(stale.chart.points.some((point) => point.time === now - 90 * 86400));
    scenario = "delayed-rates";
    const delayed = await dashboard();
    const delayedStress = delayed.cards.find((card) => card.id === "stress-index");
    assert.equal(delayedStress.dataHealth.status, "fresh");
    assert.notEqual(delayedStress.value, "—");
    assert.equal(delayedStress.dataHealth.dependencies.find((input) => input.id === "real-rates").maxAgeDays, 14);
    assert.equal(delayed.cards.find((card) => card.id === "live-real-rates").dataHealth.status, "fresh");
    scenario = "missing-rates";
    const missing = (await dashboard()).cards.find((card) => card.id === "stress-index");
    assert.equal(missing.value, "—");
    assert.equal(missing.dataHealth.status, "unavailable");
    scenario = "stale-gold";
    const oldGold = await dashboard();
    assert.equal(oldGold.cards.find((card) => card.id === "stress-index").value, "—");
    const ratio = oldGold.cards.find((card) => card.id === "gold-silver");
    assert.equal(ratio.value, "—");
    assert.equal(ratio.impact, "unavailable");
    assert.notEqual(ratio.dataHealth.status, "fresh");
  } finally { globalThis.fetch = originalFetch; }
});

test("ratio freshness cannot be established by fresh quote metadata over stale aligned history", async () => {
  const originalFetch = globalThis.fetch;
  const now = Math.floor(Date.now() / 1000) - 86400;
  globalThis.fetch = async (raw) => {
    const url = new URL(String(raw));
    if (url.hostname === "api.stlouisfed.org") return new Response("Offline", { status: 503 });
    const timestamp = [now - 465 * 86400, now - 100 * 86400];
    return Response.json({ chart: { result: [{ meta: { regularMarketPrice: 110, regularMarketTime: now, exchangeTimezoneName: "America/New_York" }, timestamp, indicators: { quote: [{ close: [100, 110] }] } }] } });
  };
  try {
    const ids = { gold: ["gold-sp", "gold-oil", "gold-silver"], silver: ["gold-silver"], copper: ["copper-gold"], oil: ["oil-gold-ratio"] };
    for (const [commodity, config] of Object.entries(commodityConfigurations)) {
      const dashboard = await getMacroIndicators({ ...config, scoreSources: undefined }, "en");
      for (const id of ids[commodity]) {
        const card = dashboard.cards.find((candidate) => candidate.id === id);
        assert.equal(card.value, "—");
        assert.equal(card.dataHealth.status, "stale");
        assert.equal(card.impact, "unavailable");
        assert.equal(card.dataHealth.dependencies.find((input) => input.id === "matched-history").observedAt, now - 100 * 86400);
      }
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("monthly FRED periods retain provenance and convert M2 billions to trillions", () => {
  const checkedAt = Date.parse("2026-11-11T12:00:00Z") / 1000;
  const points = parseFredObservations("observation_date,M2SL\n2026-09-01,23413.9\n", fredSeriesDefinitions.M2SL, checkedAt);
  assert.equal(points.length, 1);
  assert.ok(Math.abs(points[0].value - 23.4139) < 1e-10);
  assert.equal(points[0].reportingPeriod.start, "2026-09-01");
  assert.equal(points[0].reportingPeriod.end, "2026-09-30");
  assert.equal(points[0].provenance.rawUnit, "USD billions");
  assert.equal(points[0].provenance.normalizedUnit, "USD trillions");
  assert.equal(points[0].provenance.publishedAt, null);
  assert.equal(points[0].provenance.vintage, null);
  assert.equal(monthlyPeriodIsRecent(points[0], checkedAt, 2), true);
  assert.equal(monthlyPeriodIsRecent(points[0], Date.parse("2026-12-01") / 1000, 2), false);
});

test("FRED DTWEXBGS parses as a daily broad-dollar index rather than a rate", () => {
  const checkedAt = Date.parse("2026-11-11T12:00:00Z") / 1000;
  const points = parseFredObservations("observation_date,DTWEXBGS\n2026-11-06,121.8803\n", fredSeriesDefinitions.DTWEXBGS, checkedAt);
  assert.equal(points.length, 1);
  assert.equal(points[0].value, 121.8803);
  assert.equal(points[0].provenance.measurement, "index");
  assert.equal(points[0].provenance.normalizedUnit, "index points");
  assert.equal(points[0].provenance.seasonalAdjustment, "NSA");
});

test("monthly changes match reporting months, including unequal month ends", () => {
  const checkedAt = Date.parse("2025-10-10") / 1000;
  const points = parseFredObservations("observation_date,M2SL\n2024-09-01,10000\n2025-06-01,11000\n2025-08-01,11500\n2025-09-01,12000\n", fredSeriesDefinitions.M2SL, checkedAt);
  const current = points.at(-1);
  const input = { ...changesFixture(), currentValues: { demand: current }, historicalValues: { demand: points } };
  const result = calculateCommodityChanges(input)[0].changes;
  assert.ok(Math.abs(result.monthly - 0.5 / 11.5 * 100) < 1e-8);
  assert.ok(Math.abs(result.quarterly - 1 / 11 * 100) < 1e-8);
  assert.equal(result.yoy, 20);
  input.historicalValues.demand = points.filter((point) => point.reportingPeriod.start !== "2025-08-01");
  assert.equal(calculateCommodityChanges(input)[0].changes.monthly, null);
});

test("FRED parsing rejects mismatched series, bad dates, forecasts and conflicting rows", () => {
  const checkedAt = Date.parse("2026-11-11") / 1000;
  assert.deepEqual(parseFredObservations("observation_date,T10YIE\n2026-11-01,2\n", fredSeriesDefinitions.T5YIE, checkedAt), []);
  assert.deepEqual(parseFredObservations("observation_date,M2SL\n2026-02-30,1\n2026-11-01,2\n2027-01-01,3\n2026-09-01,.\n", fredSeriesDefinitions.M2SL, checkedAt), []);
  assert.deepEqual(parseFredObservations("observation_date,M2SL\n2026-09-01,10\n2026-09-01,11\n", fredSeriesDefinitions.M2SL, checkedAt), []);
  const yieldPoints = parseFredObservations("observation_date,DFII10\n2026-11-09,0\n2026-11-10,-0.5\n", fredSeriesDefinitions.DFII10, checkedAt);
  assert.deepEqual(yieldPoints.map((point) => point.value), [0, -0.5]);
});

test("sourced-only configurations do not require placeholder annual values", () => {
  const config = publicFixture();
  config.years = [];
  config.indicators.forEach((indicator) => { delete indicator.values; });
  assert.equal(scoreCommodity(config).score, 50);
});

test("monthly hydration uses a reporting lag policy and preserves scoring restrictions", () => {
  const checkedAt = Date.parse("2026-11-11T12:00:00Z") / 1000;
  const m2 = parseFredObservations("observation_date,M2SL\n2025-09-01,22000\n2026-08-01,23000\n2026-09-01,23413.9\n", fredSeriesDefinitions.M2SL, checkedAt);
  const evidence = { m2: { release: { status: "matched", sourceUrl: "https://www.federalreserve.gov/releases/h6/20261027/default.htm", checkedAt, releaseDate: "2026-10-27", referencePeriod: "2026-09" } } };
  const config = hydrateCommodityObservations(commodityConfigurations.gold, { m2 }, checkedAt, evidence);
  const factor = config.indicators.find((indicator) => indicator.id === "m2");
  assert.equal(factor.dataHealth.frequency, "monthly");
  assert.equal(factor.dataHealth.status, "fresh");
  assert.equal(factor.dataHealth.freshnessBasis, "reporting-lag");
  assert.equal(factor.dataHealth.provenance.aggregation, "monthly-average");
  assert.equal(factor.dataHealth.provenance.publishedAt, null);
  assert.equal(scoreCommodity(config).score, null);
  assert.equal(scoreCommodity(config).indicators.find((indicator) => indicator.id === "m2").exclusionReason, "unapproved");
  const later = Date.parse("2026-12-01") / 1000;
  const old = hydrateCommodityObservations(commodityConfigurations.gold, { m2 }, later, { m2: { release: { ...evidence.m2.release, checkedAt: later } } });
  assert.equal(old.indicators.find((indicator) => indicator.id === "m2").dataHealth.status, "stale");
  const unknown = hydrateCommodityObservations(commodityConfigurations.gold, { m2 }, checkedAt);
  assert.equal(unknown.indicators.find((indicator) => indicator.id === "m2").dataHealth.status, "unavailable");
  for (const status of ["behind", "mismatch"]) {
    const changed = hydrateCommodityObservations(commodityConfigurations.gold, { m2 }, checkedAt, { m2: { release: { ...evidence.m2.release, status } } });
    assert.equal(changed.indicators.find((indicator) => indicator.id === "m2").dataHealth.status, "stale");
  }
  const expired = hydrateCommodityObservations(commodityConfigurations.gold, { m2 }, checkedAt + 86401, evidence);
  assert.equal(expired.indicators.find((indicator) => indicator.id === "m2").dataHealth.status, "unavailable");
});

test("forecast, future release and inconsistent unit metadata are rejected", () => {
  const checkedAt = Date.parse("2026-11-11T12:00:00Z") / 1000;
  const point = parseFredObservations("observation_date,M2SL\n2026-09-01,23000\n", fredSeriesDefinitions.M2SL, checkedAt)[0];
  assert.equal(availableObservation(point, checkedAt), true);
  for (const patch of [{ valueType: "forecast" }, { publishedAt: checkedAt + 86400 }, { retrievedAt: checkedAt + 1 }, { multiplier: 1 }]) {
    const invalid = { ...point, provenance: { ...point.provenance, ...patch } };
    assert.equal(availableObservation(invalid, checkedAt), false);
    assert.equal(hydrateCommodityObservations(commodityConfigurations.gold, { m2: [invalid] }, checkedAt).indicators.find((indicator) => indicator.id === "m2").dataHealth.status, "unavailable");
  }
});

test("Gold M2 and five-year breakeven reach reference cards with actual metadata and no sample fallback", async () => {
  const originalFetch = globalThis.fetch;
  const now = new Date(Date.now() - 86400000);
  now.setUTCHours(0, 0, 0, 0);
  const yearAgo = new Date(now);
  yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
  const monthly = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const monthlyPrevious = new Date(Date.UTC(monthly.getUTCFullYear() - 1, monthly.getUTCMonth(), 1));
  const date = (value) => value.toISOString().slice(0, 10);
  let offline = false;
  let releaseOffline = false;
  const releaseFetchModes = [];
  const fredFetchModes = [];
  const yahooFetchModes = [];
  globalThis.fetch = async (raw, options) => {
    const url = new URL(String(raw));
    if (url.hostname === "api.stlouisfed.org") fredFetchModes.push(options?.cache);
    if (url.hostname === "query1.finance.yahoo.com") yahooFetchModes.push(options?.cache);
    if (url.hostname === "www.federalreserve.gov") {
      releaseFetchModes.push(options?.cache);
      if (releaseOffline) return new Response("Offline", { status: 503 });
      if (url.pathname.endsWith("releaseDates.json")) return Response.json([{ yearValue: String(now.getUTCFullYear()), Months: [{ MonthValue: date(now).slice(0, 7).replace("-", ""), Dates: [date(now).replaceAll("-", "")] }] }]);
      const releaseDate = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(now);
      const period = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(monthly);
      return new Response(`<div class="dates">Release Date: ${releaseDate}</div><table id="t1tg1"><thead><tr><th>Seasonally adjusted M2</th></tr></thead><tbody><tr><th>${period}</th></tr></tbody></table>`);
    }
    const id = url.searchParams.get("series_id");
    if (offline && ["M2SL", "T5YIE"].includes(id)) return new Response("Offline", { status: 503 });
    if (id === "M2SL") return fredResponse(id, [[date(monthlyPrevious), 22000], [date(monthly), 23413.9]]);
    if (id === "T5YIE") return fredResponse(id, [[date(yearAgo), 2], [date(now), 2.25]]);
    if (id) return fredResponse(id, []);
    return Response.json({ chart: { result: [{ timestamp: [yearAgo.getTime() / 1000, now.getTime() / 1000], indicators: { quote: [{ close: [100, 95] }] } }] } });
  };
  try {
    const config = { ...withoutWgcSources(commodityConfigurations.gold), contextProvider: undefined };
    const dashboard = await getMacroIndicators(config, "en");
    const m2 = dashboard.cards.find((card) => card.id === "m2");
    const breakeven = dashboard.cards.find((card) => card.id === "breakeven");
    assert.equal(m2.value, "$23.4T");
    assert.equal(m2.dataHealth.frequency, "monthly");
    assert.equal(m2.dataHealth.provenance.seriesId, "M2SL");
    assert.equal(m2.dataHealth.archive.status, "disabled");
    assert.equal(m2.dataHealth.release.status, "matched");
    assert.equal(m2.dataHealth.status, "fresh");
    assert.deepEqual(releaseFetchModes, ["no-store", "no-store"]);
    assert.ok(fredFetchModes.slice(0, 3).every((mode) => mode === "no-store"));
    assert.ok(yahooFetchModes.slice(0, 1).every((mode) => mode === "no-store"));
    assert.equal(m2.ninetyDayChange, undefined);
    assert.equal(breakeven.value, "2.25%");
    assert.equal(breakeven.dataHealth.provenance.seriesId, "T5YIE");
    assert.equal(dashboard.summary.release.referenceSampleWeight, 30);
    assert.equal(dashboard.summary.score, null);
    assert.equal(dashboard.summary.release.approvedCount, 7);
    assert.equal(m2.factorScore, null);
    releaseOffline = true;
    const unchecked = await getMacroIndicators(config, "en");
    const uncheckedM2 = unchecked.cards.find((card) => card.id === "m2");
    assert.equal(uncheckedM2.value, "$23.4T");
    assert.equal(uncheckedM2.dataHealth.status, "unavailable");
    assert.equal(uncheckedM2.dataHealth.release.status, "unknown");
    assert.equal(unchecked.summary.score, null);
    offline = true;
    const missing = await getMacroIndicators(config, "en");
    assert.equal(missing.cards.find((card) => card.id === "m2").value, "—");
    assert.equal(missing.cards.find((card) => card.id === "breakeven").value, "—");
  } finally { globalThis.fetch = originalFetch; }
});

test("archive persistence is opt-in and reports failed writes without claiming retention", async () => {
  const enabled = process.env.SOURCE_ARCHIVE_ENABLED;
  const archivePermission = process.env.FRED_ARCHIVE_PERMITTED_SERIES;
  const firstTime = Date.parse("2026-10-28T12:00:00Z") / 1000;
  const nextTime = Date.parse("2026-11-11T12:00:00Z") / 1000;
  const first = createSourceSnapshot("DATE,M2SL\n2026-09-01,23400\n", fredSeriesDefinitions.M2SL, firstTime);
  const next = createSourceSnapshot("DATE,M2SL\n2026-09-01,23413.9\n", fredSeriesDefinitions.M2SL, nextTime);
  let calls = 0;
  const capture = async () => { calls += 1; return { captured_at: new Date(nextTime * 1000).toISOString(), first_captured_at: new Date(firstTime * 1000).toISOString(), previous: first, changed: true }; };
  try {
    delete process.env.SOURCE_ARCHIVE_ENABLED;
    assert.deepEqual(await archiveSourceSnapshot(next, capture), { status: "disabled" });
    assert.deepEqual(await archivedSnapshotKnownAt("M2SL", nextTime), { status: "disabled", snapshot: null });
    assert.equal(calls, 0);
    process.env.SOURCE_ARCHIVE_ENABLED = "true";
    assert.deepEqual(await archiveSourceSnapshot(next, capture), { status: "disabled" });
    assert.equal(calls, 0);
    process.env.FRED_ARCHIVE_PERMITTED_SERIES = "M2SL";
    const saved = await archiveSourceSnapshot(next, capture);
    assert.equal(saved.status, "stored");
    assert.equal(saved.firstCapturedAt, firstTime);
    assert.deepEqual(saved.changes, { added: 0, revised: 1, removed: 0 });
    assert.deepEqual(await archiveSourceSnapshot(next, async () => { throw new Error("Offline"); }), { status: "failed" });
    assert.deepEqual(await archiveSourceSnapshot(next, async () => ({ captured_at: "bad", first_captured_at: "bad" })), { status: "failed" });
    const reordered = { ...next, definition: Object.fromEntries(Object.entries(next.definition).reverse()) };
    assert.equal(verifySourceSnapshot(reordered)[0].value, 23.4139);
    const returned = { ...first, capturedAt: nextTime + 86400 };
    assert.equal(snapshotKnownAt([first, next, returned], "M2SL", nextTime + 86400).checksum, first.checksum);
  } finally {
    if (enabled === undefined) delete process.env.SOURCE_ARCHIVE_ENABLED;
    else process.env.SOURCE_ARCHIVE_ENABLED = enabled;
    if (archivePermission === undefined) delete process.env.FRED_ARCHIVE_PERMITTED_SERIES;
    else process.env.FRED_ARCHIVE_PERMITTED_SERIES = archivePermission;
  }
});

test("H.6 release checks use official structured dates and the actual released reference period", () => {
  const now = Date.parse("2026-11-11T12:00:00Z") / 1000;
  const index = [{ yearValue: "2026", Months: [{ MonthValue: "202610", Dates: ["20261027"] }, { MonthValue: "202611", Dates: ["20261124"] }] }];
  assert.equal(latestH6Release(index, now).date, "2026-10-27");
  assert.equal(latestH6Release([{ yearValue: "2021", Months: [{ MonthValue: "202102", Dates: ["20210223***"] }] }], now).date, "2021-02-23");
  assert.equal(latestH6Release("<html>Unavailable</html>", now), null);
  assert.equal(latestH6Release([{ yearValue: "2026", Months: [{ MonthValue: "202602", Dates: ["20260230"] }] }], now), null);
  assert.equal(latestH6Release([{ yearValue: "2026", Months: [{ MonthValue: "202610", Dates: ["20261101"] }] }], now), null);
  const html = '<div class="dates">Release Date: October 27, 2026</div><table id="t1tg1"><thead><tr><th>Seasonally adjusted M2</th></tr></thead><tbody><tr><th>Aug. 2026</th></tr><tr><th>Sept. 2026</th></tr></tbody></table>';
  const point = parseFredObservations("DATE,M2SL\n2026-09-01,23413.9", fredSeriesDefinitions.M2SL, now)[0];
  assert.equal(compareH6Release(html, "2026-10-27", point, now).status, "matched");
  const older = parseFredObservations("DATE,M2SL\n2026-08-01,23300.9", fredSeriesDefinitions.M2SL, now)[0];
  assert.equal(compareH6Release(html, "2026-10-27", older, now).status, "behind");
  const ahead = parseFredObservations("DATE,M2SL\n2026-10-01,23500", fredSeriesDefinitions.M2SL, now)[0];
  assert.equal(compareH6Release(html, "2026-10-27", ahead, now).status, "mismatch");
  assert.equal(compareH6Release(html, "2026-11-01", point, now).status, "unknown");
  assert.equal(compareH6Release(html.replace("t1tg1", "other"), "2026-10-27", point, now).status, "unknown");
  assert.equal(point.provenance.publishedAt, null);
});

test("source snapshots preserve raw evidence and detect local revisions without inventing publication vintages", () => {
  const firstAt = Date.parse("2026-10-28T12:00:00Z") / 1000;
  const secondAt = Date.parse("2026-11-11T12:00:00Z") / 1000;
  const first = createSourceSnapshot("observation_date,M2SL\n2026-08-01,23000\n2026-09-01,23400\n", fredSeriesDefinitions.M2SL, firstAt);
  const second = createSourceSnapshot("observation_date,M2SL\n2026-09-01,23413.9\n2026-10-01,23500\n", fredSeriesDefinitions.M2SL, secondAt);
  assert.equal(first.checksum.length, 64);
  assert.deepEqual(snapshotChanges(first, second), { added: 1, revised: 1, removed: 1 });
  assert.equal(snapshotKnownAt([second, first], "M2SL", firstAt - 1), null);
  assert.equal(snapshotKnownAt([second, first], "M2SL", firstAt).id, first.id);
  assert.equal(snapshotKnownAt([second, first], "M2SL", secondAt).id, second.id);
  const observations = verifySourceSnapshot(second);
  assert.equal(observations[0].provenance.publishedAt, null);
  assert.equal(observations[0].provenance.vintage, null);
  assert.equal(observations[0].provenance.revisionStatus, "unknown");
  assert.equal(observations[0].provenance.retrievedAt, secondAt);
});

test("snapshot integrity and source identity fail closed", () => {
  const capturedAt = Date.parse("2026-11-11") / 1000;
  const snapshot = createSourceSnapshot("observation_date,M2SL\n2026-09-01,23000\n", fredSeriesDefinitions.M2SL, capturedAt);
  assert.throws(() => verifySourceSnapshot({ ...snapshot, rawCsv: snapshot.rawCsv.replace("23000", "24000") }), /integrity/);
  assert.throws(() => verifySourceSnapshot({ ...snapshot, seriesId: "T5YIE" }), /Unsupported/);
  assert.throws(() => createSourceSnapshot("<html>error</html>", fredSeriesDefinitions.M2SL, capturedAt), /Invalid/);
  assert.deepEqual(snapshotChanges(snapshot, snapshot), { added: 0, revised: 0, removed: 0 });
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
  const config = withoutWgcSources({ ...commodityConfigurations.gold, scoringPolicy: researchPolicy });
  const fresh = hydrateCommodityObservations(config, { dxy: points, "real-yields": [] }, now);
  assert.equal(fresh.indicators.find((item) => item.id === "dxy").dataHealth.status, "fresh");
  assert.equal(fresh.indicators.find((item) => item.id === "real-rates").dataHealth.status, "unavailable");
  assert.equal(fresh.indicators.find((item) => item.id === "etf-holdings").dataHealth.status, "sample");
  assert.equal(scoreCommodity(fresh).coverage, 45);
  const stale = hydrateCommodityObservations(config, { dxy: [points[1]] }, now);
  assert.equal(stale.indicators.find((item) => item.id === "dxy").dataHealth.status, "stale");
  assert.equal(scoreCommodity(stale).coverage, 35);
  assert.deepEqual(calculateCommodityChanges(commodityChangesInput(stale)).find((item) => item.id === "dxy").changes, { monthly: null, quarterly: null, yoy: null });
  const withinWindow = [{ time: now - 14 * 86400, value: 100 }];
  const freshFred = hydrateCommodityObservations(config, {
    dxy: withinWindow, "real-yields": withinWindow, "breakeven-5y": withinWindow,
  }, now);
  for (const id of ["dxy", "real-rates", "breakeven"]) {
    assert.equal(freshFred.indicators.find((item) => item.id === id).dataHealth.status, "fresh");
  }
  const beyondWindow = [{ time: now - 15 * 86400, value: 100 }];
  const staleFred = hydrateCommodityObservations(config, {
    dxy: beyondWindow, "real-yields": beyondWindow, "breakeven-5y": beyondWindow,
  }, now);
  for (const id of ["dxy", "real-rates", "breakeven"]) {
    assert.equal(staleFred.indicators.find((item) => item.id === id).dataHealth.status, "stale");
  }
});

test("FRED and DXY observations reach the score and change engine; FRED blanks are not zero yields", async () => {
  const originalFetch = globalThis.fetch;
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  day.setUTCDate(day.getUTCDate() - 1);
  const previous = new Date(day);
  previous.setUTCFullYear(previous.getUTCFullYear() - 1);
  const asDate = (date) => date.toISOString().slice(0, 10);
  globalThis.fetch = async (raw) => {
    const url = new URL(String(raw));
    if (url.hostname === "api.stlouisfed.org") {
      const id = url.searchParams.get("series_id");
      if (id === "DFII10") return fredResponse(id, [
        [asDate(previous), 2], [asDate(day), 1], [asDate(new Date(day.getTime() + 86400000)), "."],
      ]);
      if (id === "DTWEXBGS") return fredResponse(id, [[asDate(previous), 100], [asDate(day), 95]]);
      return fredResponse(id, []);
    }
    return Response.json({ chart: { result: [{ timestamp: [previous.getTime() / 1000, day.getTime() / 1000], indicators: { quote: [{ close: [100, 95] }] } }] } });
  };
  try {
    const dashboard = await getMacroIndicators({ ...withoutWgcSources(commodityConfigurations.gold), contextProvider: undefined, scoringPolicy: researchPolicy }, "en");
    assert.equal(dashboard.cards.find((card) => card.id === "real-rates").value, "1.00%");
    assert.equal(dashboard.cards.find((card) => card.id === "dxy").value, "95.0");
    assert.equal(dashboard.summary.dataMix.sourcedWeight, 40);
    assert.equal(dashboard.summary.coverage, 70);
    const changes = calculateCommodityChanges(commodityChangesInput(dashboard.config));
    assert.equal(changes.find((item) => item.id === "real-rates").changes.yoy, -1);
    assert.equal(changes.find((item) => item.id === "dxy").changes.yoy, -5);
    globalThis.fetch = async () => { throw new Error("Feed offline"); };
    const offline = await getMacroIndicators({ ...withoutWgcSources(commodityConfigurations.gold), contextProvider: undefined, scoringPolicy: researchPolicy }, "en");
    assert.equal(offline.cards.find((card) => card.id === "dxy").factorScore, null);
    assert.equal(offline.cards.find((card) => card.id === "dxy").value, "—");
    assert.equal(offline.summary.coverage, 35);
    assert.equal(offline.summary.dataMix.sourcedWeight, 5);
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
  globalThis.fetch = async (raw) => {
    const url = new URL(String(raw));
    if (url.hostname === "api.stlouisfed.org") {
      const id = url.searchParams.get("series_id");
      if (id === "DFII10") return fredResponse(id, [
        [asDate(priorYear), 1], [asDate(prior90), 0], [asDate(day), 2],
      ]);
      if (id === "DTWEXBGS") return fredResponse(id, [
        [asDate(priorYear), 110], [asDate(prior90), 100], [asDate(day), 95],
      ]);
      return fredResponse(id, []);
    }
    return Response.json({ chart: { result: [{ timestamp: [priorYear.getTime() / 1000, prior90.getTime() / 1000, day.getTime() / 1000], indicators: { quote: [{ close: [110, 100, 95] }] } }] } });
  };
  try {
    const expectedContexts = { gold: 3, silver: 2, copper: 2, oil: 4 };
    for (const config of Object.values(commodityConfigurations)) {
      const dashboard = await getMacroIndicators(config, "en");
      assert.equal(dashboard.cards.filter((card) => card.group === "context").length, expectedContexts[config.commodity]);
      assert.ok(dashboard.cards.every((card) => !["live-dxy", "live-real-rates", "oil-dxy"].includes(card.id)));
      assert.equal(dashboard.cards.find((card) => card.id === "dxy").ninetyDayChange, "-5.0%");
      if (config.commodity !== "oil") assert.equal(dashboard.cards.find((card) => card.id === "real-rates").ninetyDayChange, "+2.00 pp");
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("Gold ratio averages use five years while charts retain ten years of weekly history", async () => {
  const originalFetch = globalThis.fetch;
  const now = Math.floor(Date.now() / 86400000) * 86400 - 86400;
  let sparse = false;
  let mismatchedQuoteSession = false;
  globalThis.fetch = async (raw) => {
    const url = String(raw);
    if (new URL(url).hostname === "api.stlouisfed.org") return new Response("Offline", { status: 503 });
    const symbol = decodeURIComponent(new URL(url).pathname.split("/").at(-1));
    const timestamps = sparse ? [now - 3 * 365 * 86400, now] : Array.from({ length: 11 }, (_, index) => now - (10 - index) * 365 * 86400);
    const values = timestamps.map((_, index) => symbol === "GC=F" ? 100 : symbol === "^GSPC" || symbol === "CL=F" ? (index < timestamps.length - 6 ? 100 : 50) : 200);
    return Response.json({ chart: { result: [{ meta: { regularMarketPrice: values.at(-1), regularMarketTime: mismatchedQuoteSession && symbol === "^GSPC" ? now - 86400 : now,
      exchangeTimezoneName: "America/New_York" }, timestamp: timestamps,
      indicators: { quote: [{ close: values, high: values, low: values }] } }] } });
  };
  try {
    const config = { ...commodityConfigurations.gold, scoreSources: undefined };
    const dashboard = await getMacroIndicators(config, "en");
    const goldSp = dashboard.cards.find((card) => card.id === "gold-sp");
    const goldOil = dashboard.cards.find((card) => card.id === "gold-oil");
    assert.equal(goldSp.comparison.value, "2.000");
    assert.equal(goldOil.comparison.value, "2.00");
    assert.equal(goldSp.comparison.label, "5-year average · weekly matched closes");
    assert.equal(goldSp.chart.label, "10 years · weekly matched closes");
    assert.equal(goldSp.chart.points.length, 11);
    sparse = true;
    const missingYear = await getMacroIndicators(config, "en");
    assert.equal(missingYear.cards.find((card) => card.id === "gold-sp").yoyChange, "—");
    sparse = false;
    mismatchedQuoteSession = true;
    const mismatched = await getMacroIndicators(config, "en");
    assert.equal(mismatched.cards.find((card) => card.id === "gold-sp").value, "—");
    assert.equal(mismatched.cards.find((card) => card.id === "gold-sp").dataHealth.status, "unavailable");
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

test("explicit research mode scores sample inputs and signed contributions", () => {
  const expected = { silver: 73, copper: 70, oil: 64 };
  for (const [commodity, config] of Object.entries(commodityConfigurations)) {
    const result = scoreCommodity({ ...config, scoringPolicy: researchPolicy });
    if (commodity === "gold") {
      const priorWeights = { ...config.weights, "real-rates": 30, "gold-seasonality": 0 };
      const priorScore = scoreCommodity({ ...config, weights: priorWeights, scoringPolicy: researchPolicy });
      const seasonalityScore = result.indicators.find((indicator) => indicator.id === "gold-seasonality").score;
      const realRatesScore = result.indicators.find((indicator) => indicator.id === "real-rates").score;
      const legacyWeightedScore = priorScore.indicators.reduce((sum, indicator) => sum + indicator.weightedScore, 0);
      assert.equal(result.score, Math.round(legacyWeightedScore + (seasonalityScore - realRatesScore) * 0.05));
    } else assert.equal(result.score, expected[commodity]);
    assert.equal(result.indicators.length, config.indicators.length);
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
  const boundaries = [[0, "strongly-bearish"], [19, "strongly-bearish"], [20, "bearish"], [39, "bearish"], [40, "bearish"], [59, "neutral"], [60, "bullish"], [79, "bullish"], [80, "bullish"], [81, "strongly-bullish"], [100, "strongly-bullish"]];
  for (const [score, outlook] of boundaries) assert.equal(generateMacroSummary(summaryFixture(score), "en").outlook, outlook);
  assert.throws(() => generateMacroSummary(summaryFixture(NaN), "en"), /Invalid/);
});

test("factor status and narrative share tolerant configured score boundaries", () => {
  const config = fixture([0], [100]);
  config.indicators[0].changeKind = "points";
  config.indicators[0].values = [2.29, 2.34];
  config.scoreRules.factors["factor-0"].scale = 0.25;
  const factor = scoreCommodity(config).indicators[0];
  assert.ok(factor.score < 60);
  assert.equal(factor.status, "bullish");
  const aggregateConfig = fixture([-1], [100]);
  aggregateConfig.scoreRules.factors["factor-0"].scale = 5;
  const aggregate = scoreCommodity(aggregateConfig);
  assert.equal(aggregate.score, 40);
  assert.equal(aggregate.status, "bearish");
  const atBearish = generateMacroSummary(summaryFixture(40, [40], [100]), "en");
  assert.equal(atBearish.outlook, "bearish");
  assert.equal(atBearish.confidence, "high");
  assert.equal(generateMacroSummary(summaryFixture(59.999999999999964, [59.999999999999964], [100]), "en").outlook, "bullish");
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

test("explicit research summaries can use each commodity's configured indicators", async () => {
  for (const config of Object.values(commodityConfigurations)) {
    const dashboard = await getMacroIndicators({ ...config, contextProvider: undefined, scoreSources: undefined, scoringPolicy: researchPolicy }, "en");
    const input = {
      indicatorScores: dashboard.cards.map((card) => ({ id: card.id, name: card.name, score: card.factorScore, trend: card.trend })),
      indicatorWeights: config.weights,
    };
    assert.equal(countActiveIndicators(input), config.indicators.length);
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
    const dashboard = await getMacroIndicators({ ...config, contextProvider: undefined, scoreSources: undefined, scoringPolicy: researchPolicy }, "en");
    for (const card of dashboard.cards) {
      assert.equal(card.commodityName, config.name.en);
      assert.equal(card.priceCorrelation, config.priceRelationships?.[card.id]);
      if (config.commodity !== "gold") assert.equal(card.priceCorrelation, undefined);
    }
  }
  assert.equal(commodityConfigurations.gold.priceRelationships["etf-holdings"], 0.81);
  assert.equal(classifyPriceRelationship(commodityConfigurations.gold.priceRelationships.dxy).stars, 4);
  const publicDashboard = await getMacroIndicators({ ...commodityConfigurations.gold, contextProvider: undefined, scoreSources: undefined }, "en");
  assert.ok(publicDashboard.cards.every((card) => card.priceCorrelation === undefined));
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

test("header daily return uses the latest completed exchange-session close", async () => {
  const originalFetch = globalThis.fetch;
  const quoteTime = Date.parse("2026-11-11T15:00:00Z") / 1000;
  const sessionTime = (date) => Date.parse(`${date}T14:30:00Z`) / 1000;
  const config = commodityConfigurations.gold;
  let timestamps = [sessionTime("2026-11-09"), sessionTime("2026-11-10")];
  globalThis.fetch = async () => Response.json({ chart: { result: [{
    meta: { regularMarketPrice: 110, regularMarketTime: quoteTime, exchangeTimezoneName: "America/New_York" },
    timestamp: timestamps, indicators: { quote: [{ close: timestamps.map((_, index) => [100, 105][index]), high: [102, 107], low: [98, 103] }] },
  }] } });
  try {
    const priorSession = await getCommodityHeaderData(config);
    assert.ok(Math.abs(priorSession.dailyChange - (110 - 105) / 105 * 100) < 1e-10);
    timestamps = [sessionTime("2026-11-10"), sessionTime("2026-11-11")];
    const inSession = await getCommodityHeaderData(config);
    assert.equal(inSession.dailyChange, 10);
    timestamps = [sessionTime("2026-11-10"), sessionTime("2026-11-11")];
    globalThis.fetch = async () => Response.json({ chart: { result: [{
      meta: { regularMarketPrice: 110, regularMarketTime: quoteTime }, timestamp: timestamps,
      indicators: { quote: [{ close: [100, 105], high: [102, 107], low: [98, 103] }] },
    }] } });
    assert.equal((await getCommodityHeaderData(config)).dailyChange, null);
  } finally { globalThis.fetch = originalFetch; }
});

test("Yahoo and FRED public feeds fail closed until source-specific reuse permission is recorded", async () => {
  const originalFetch = globalThis.fetch;
  const permissionKeys = ["YAHOO_FINANCE_AUTOMATED_ACCESS_CONFIRMED", "MARKET_DATA_PUBLIC_DISTRIBUTION_CONFIRMED", "FRED_M2SL_PUBLIC_USE_CONFIRMED", "FRED_T5YIE_PUBLIC_USE_CONFIRMED", "FRED_DFII10_PUBLIC_USE_CONFIRMED", "FRED_DTWEXBGS_PUBLIC_USE_CONFIRMED", "CFTC_COT_GOLD_PUBLIC_USE_CONFIRMED", "GPR_CI_PUBLIC_USE_CONFIRMED"];
  const previous = Object.fromEntries(permissionKeys.map((key) => [key, process.env[key]]));
  let fetchCount = 0;
  globalThis.fetch = async () => { fetchCount += 1; throw new Error("Unapproved source was fetched"); };
  for (const key of permissionKeys) delete process.env[key];
  try {
    const config = { ...commodityConfigurations.gold, contextProvider: undefined };
    const dashboard = await getMacroIndicators(config, "en");
    const header = await getCommodityHeaderData(config);
    assert.equal(fetchCount, 0);
    assert.equal(header.price, null);
    assert.equal(header.rights[0].status, "review-required");
    assert.equal(dashboard.cards.find((card) => card.id === "dxy").value, "—");
    assert.equal(dashboard.cards.find((card) => card.id === "dxy").dataHealth.rights[0].status, "review-required");
    assert.equal(dashboard.cards.find((card) => card.id === "m2").dataHealth.rights[0].status, "review-required");
    assert.equal(getSourceRights("eia").allowed, true);
    assert.equal(getSourceRights("eia").disclosure.status, "public-domain-attribution");
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of permissionKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});