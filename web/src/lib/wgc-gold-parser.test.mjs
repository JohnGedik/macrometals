import assert from "node:assert/strict";
import { mkdtemp, rmdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import ExcelJS from "exceljs";
import { parseWgcGoldWorkbooks } from "./wgc-gold-parser.ts";

async function workbookFile(path, build) {
  const workbook = new ExcelJS.Workbook();
  build(workbook);
  await workbook.xlsx.writeFile(path);
}

test("parses reported country net changes and monthly global ETF holdings", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wgc-parser-"));
  const centralBankPath = join(directory, "central-bank.xlsx");
  const etfPath = join(directory, "etf.xlsx");
  try {
    await workbookFile(centralBankPath, (workbook) => {
      const monthly = workbook.addWorksheet("Monthly");
      monthly.addRow(["Country", "Comments", new Date(Date.UTC(2025, 0, 1)), new Date(Date.UTC(2025, 1, 1))]);
      monthly.addRow(["Country A", null, 2.5, -1]);
      monthly.addRow(["Country B", null, 1.25, 0.5]);
    });
    await workbookFile(etfPath, (workbook) => {
      const holdings = workbook.addWorksheet("Holdings by month");
      holdings.getCell("A6").value = "Date";
      holdings.getCell("D6").value = "Tonnes";
      holdings.addRow([]);
      holdings.addRow([new Date(Date.UTC(2025, 0, 31)), null, null, 4100.25]);
      holdings.addRow([new Date(Date.UTC(2025, 1, 28)), null, null, 4122.5]);
    });

    const parsed = await parseWgcGoldWorkbooks(centralBankPath, etfPath, 1_800_000_000);
    assert.deepEqual(parsed, {
      generatedAt: 1_800_000_000,
      centralBankNetChanges: [["2025-01", 3.75], ["2025-02", -0.5]],
      centralBankCountryChanges: {
        "Country A": [["2025-01", 2.5], ["2025-02", -1]],
        "Country B": [["2025-01", 1.25], ["2025-02", 0.5]],
      },
      etfHoldingsTonnes: [["2025-01", 4100.25], ["2025-02", 4122.5]],
    });
  } finally {
    await rm(centralBankPath, { force: true });
    await rm(etfPath, { force: true });
    await rmdir(directory);
  }
});

test("rejects unexpected workbook layouts and non-numeric country changes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wgc-parser-"));
  const centralBankPath = join(directory, "central-bank.xlsx");
  const badCentralBankPath = join(directory, "bad-central-bank.xlsx");
  const etfPath = join(directory, "etf.xlsx");
  try {
    await workbookFile(badCentralBankPath, (workbook) => {
      workbook.addWorksheet("Wrong sheet");
    });
    await workbookFile(etfPath, (workbook) => {
      const holdings = workbook.addWorksheet("Holdings by month");
      holdings.getCell("A6").value = "Date";
      holdings.getCell("D6").value = "Tonnes";
    });
    await assert.rejects(parseWgcGoldWorkbooks(badCentralBankPath, etfPath), /missing the expected Monthly sheet/);

    await workbookFile(centralBankPath, (workbook) => {
      const monthly = workbook.addWorksheet("Monthly");
      monthly.addRow(["Country", "Comments", new Date(Date.UTC(2025, 0, 1))]);
      monthly.addRow(["Country A", null, "unknown"]);
    });
    await assert.rejects(parseWgcGoldWorkbooks(centralBankPath, etfPath), /non-numeric change/);
  } finally {
    await rm(centralBankPath, { force: true });
    await rm(badCentralBankPath, { force: true });
    await rm(etfPath, { force: true });
    await rmdir(directory);
  }
});
