import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateInventory, getOilInventory } from "./oil-inventory.ts";

test("compares weekly changes with the closest week in each previous year", () => {
  const points = [
    ["2020-12-25", 100000], ["2021-01-01", 101000],
    ["2021-12-24", 100000], ["2021-12-31", 102000],
    ["2022-12-23", 100000], ["2022-12-30", 103000],
    ["2023-12-22", 100000], ["2023-12-29", 104000],
    ["2024-12-27", 100000], ["2025-01-03", 105000],
    ["2025-12-26", 100000], ["2026-01-02", 106000],
  ].map(([date, value]) => ({ date, value }));
  const result = calculateInventory(points.reverse());
  assert.equal(result.date, "2026-01-02");
  assert.equal(result.change, 6);
  assert.equal(result.average, 3);
  assert.ok(result.history.some((point) => point.time === Date.parse("2026-01-02T00:00:00Z") / 1000 && point.value === 6));
});

test("does not invent a seasonal average or bridge missing weeks", () => {
  const result = calculateInventory([{ date: "2026-01-02", value: 1000 }, { date: "2026-01-09", value: 2000 }]);
  assert.equal(result.date, "2026-01-09");
  assert.equal(result.change, 1);
  assert.equal(result.average, null);
  assert.equal(calculateInventory([{ date: "2026-01-02", value: 1000 }, { date: "2026-01-16", value: 2000 }]), null);
});

test("returns unavailable when no EIA key is configured", async () => {
  const key = process.env.EIA_API_KEY;
  delete process.env.EIA_API_KEY;
  try {
    assert.equal(await getOilInventory(), null);
  } finally {
    if (key !== undefined) process.env.EIA_API_KEY = key;
  }
});