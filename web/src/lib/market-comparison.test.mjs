import assert from "node:assert/strict";
import test from "node:test";
import { marketComparisonAssets, marketComparisonForRange, normalizeMarketComparison } from "./market-comparison.ts";

function makeSeries(values) {
  return values.map(([time, value]) => ({ time, value }));
}

test("normalizes the six series to 100 and carries the last close across market holidays", () => {
  const t1 = 1_000;
  const t2 = 2_000;
  const t3 = 3_000;
  const result = normalizeMarketComparison({
    gold: makeSeries([[t1, 200], [t2, 220], [t3, 210]]),
    silver: makeSeries([[t1, 20], [t3, 22]]),
    copper: makeSeries([[t1, 5], [t2, 4.5], [t3, 5.5]]),
    oil: makeSeries([[t1, 50], [t2, 55], [t3, 45]]),
    nasdaq: makeSeries([[t1, 10_000], [t2, 11_000], [t3, 12_000]]),
    sp500: makeSeries([[t1, 4_000], [t3, 4_200]]),
  });

  assert.equal(result.length, 3);
  assert.deepEqual(
    Object.fromEntries(marketComparisonAssets.map(({ id }) => [id, result[0][id]])),
    { gold: 100, silver: 100, copper: 100, oil: 100, nasdaq: 100, sp500: 100 },
  );
  assert.equal(result[1].silver, 100);
  assert.equal(result[1].sp500, 100);
  assert.equal(result[2].gold, 105);
  assert.equal(result[2].nasdaq, 120);
});

test("returns no comparison when an asset is missing or has no positive starting close", () => {
  const valid = makeSeries([[1_000, 10], [2_000, 11]]);
  const missingSilver = {
    gold: valid, silver: null, copper: valid, oil: valid, nasdaq: valid, sp500: valid,
  };
  assert.deepEqual(normalizeMarketComparison(missingSilver), []);

  const zeroGold = {
    gold: makeSeries([[1_000, 0], [2_000, 1]]),
    silver: valid, copper: valid, oil: valid, nasdaq: valid, sp500: valid,
  };
  assert.deepEqual(normalizeMarketComparison(zeroGold), []);
});

function comparisonPoint(date, value) {
  return {
    time: Date.parse(`${date}T00:00:00Z`) / 1000,
    gold: value,
    silver: value * 2,
    copper: value * 3,
    oil: value * 4,
    nasdaq: value * 5,
    sp500: value * 6,
  };
}

test("each requested period starts at its calendar boundary and rebases all markets", () => {
  const points = [
    comparisonPoint("2016-11-21", 100),
    comparisonPoint("2021-11-21", 150),
    comparisonPoint("2025-11-21", 200),
    comparisonPoint("2026-05-21", 250),
    comparisonPoint("2026-10-21", 300),
    comparisonPoint("2026-11-21", 330),
  ];
  for (const [range, date, expectedEnd] of [
    ["10y", "2016-11-21", 330],
    ["5y", "2021-11-21", 220],
    ["1y", "2025-11-21", 165],
    ["6m", "2026-05-21", 132],
    ["1m", "2026-10-21", 110],
  ]) {
    const result = marketComparisonForRange(points, range);
    assert.equal(result[0].time, Date.parse(`${date}T00:00:00Z`) / 1000);
    for (const { id } of marketComparisonAssets) {
      assert.equal(result[0][id], 100);
      assert.ok(Math.abs(result.at(-1)[id] - expectedEnd) < 1e-10);
    }
  }
});

test("range boundaries clamp month ends and do not claim unavailable history", () => {
  const points = [comparisonPoint("2024-02-29", 100), comparisonPoint("2024-03-31", 110)];
  assert.equal(marketComparisonForRange(points, "1m")[0].time, points[0].time);
  assert.deepEqual(marketComparisonForRange(points, "1y"), []);
  const lateStart = [comparisonPoint("2023-04-10", 100), comparisonPoint("2024-03-31", 110)];
  assert.deepEqual(marketComparisonForRange(lateStart, "1y"), []);
});
