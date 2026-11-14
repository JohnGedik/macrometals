import assert from "node:assert/strict";
import test from "node:test";
import { downloadWgcChangesWorkbook, wgcGoldReservesPageUrl } from "./wgc-gold-download.ts";

test("downloads the latest WGC changes workbook without returning its contents", async () => {
  const calls = [];
  const workbook = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]);
  const fetcher = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url === wgcGoldReservesPageUrl) {
      return new Response('<a href="/download/file/7741/Changes_latest_as_of_Nov2026_IFS.xlsx">Download Changes in World Official Gold Reserves</a>');
    }
    return new Response(workbook, {
      headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    });
  };

  const result = await downloadWgcChangesWorkbook(fetcher);
  assert.equal(calls.length, 2);
  assert.equal(result.sourceUrl, "https://www.gold.org/download/file/7741/Changes_latest_as_of_Nov2026_IFS.xlsx");
  assert.equal(result.bytes, workbook.byteLength);
  assert.deepEqual(Object.keys(result).sort(), ["bytes", "downloadedAt", "sourceUrl"]);
});

test("rejects workbook links outside the WGC download host", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return new Response('<a href="https://example.com/download/file/1/Changes_latest.xlsx">Changes in World Official Gold Reserves</a>');
  };

  await assert.rejects(downloadWgcChangesWorkbook(fetcher), /outside the approved download location/);
  assert.equal(calls, 1);
});
