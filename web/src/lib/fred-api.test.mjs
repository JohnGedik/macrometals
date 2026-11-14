import assert from "node:assert/strict";
import test from "node:test";
import { fredApiResponseToCsv, fredSeriesDefinitions, parseFredObservations } from "./observation-data.ts";

test("converts FRED API observations into validated source observations", () => {
  const csv = fredApiResponseToCsv({
    observations: [
      { date: "2025-01-01", value: "4.25" },
      { date: "2025-01-02", value: "." },
    ],
  }, "DFII10");

  assert.equal(csv, "observation_date,DFII10\n2025-01-01,4.25\n2025-01-02,.");
  assert.deepEqual(parseFredObservations(csv, fredSeriesDefinitions.DFII10, Date.parse("2025-01-03T00:00:00Z") / 1000)
    .map(({ value }) => value), [4.25]);
});

test("rejects malformed FRED API observations", () => {
  assert.equal(fredApiResponseToCsv({ observations: [{ date: "not-a-date", value: "1.2" }] }, "DFII10"), null);
  assert.equal(fredApiResponseToCsv({ error_code: 400, error_message: "bad request" }, "DFII10"), null);
});
