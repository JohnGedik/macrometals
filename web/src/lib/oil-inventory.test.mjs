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
  assert.deepEqual(calculateInventory(points.reverse()), { date: "2026-01-02", change: 6, average: 3 });
});

test("does not invent a seasonal average or bridge missing weeks", () => {
  assert.deepEqual(calculateInventory([{ date: "2026-01-02", value: 1000 }, { date: "2026-01-09", value: 2000 }]), { date: "2026-01-09", change: 1, average: null });
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