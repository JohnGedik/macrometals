import assert from "node:assert/strict";
import test from "node:test";
import { marketComparisonAssets, normalizeMarketComparison } from "./market-comparison.ts";

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
