import ExcelJS from "exceljs";

export type WgcGoldSnapshot = {
  generatedAt: number;
  centralBankNetChanges: [string, number][];
  centralBankCountryChanges: Record<string, [string, number][]>;
  etfHoldingsTonnes: [string, number][];
};

function scalar(value: unknown): unknown {
  if (value && typeof value === "object" && "result" in value) return value.result;
  return value;
}

function monthKey(value: unknown): string | null {
  let date: Date;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "number" && value > 20_000 && value < 100_000) {
    date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000);
  } else if (typeof value === "string") {
    const match = /^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/.exec(value.trim());
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    return Number.isInteger(month) && month >= 1 && month <= 12
      ? `${year}-${String(month).padStart(2, "0")}` : null;
  } else {
    return null;
  }
  if (!Number.isFinite(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function assertAscendingUniqueMonths(rows: readonly [string, number][], source: string) {
  for (let index = 0; index < rows.length; index += 1) {
    if (index > 0 && rows[index][0] <= rows[index - 1][0]) {
      throw new Error(`${source} months were duplicated or out of order`);
    }
    if (!Number.isFinite(rows[index][1])) throw new Error(`${source} contained a non-finite value`);
  }
}

function parseCentralBankChanges(workbook: ExcelJS.Workbook) {
  const sheet = workbook.getWorksheet("Monthly");
  if (!sheet || scalar(sheet.getCell("A1").value) !== "Country") {
    throw new Error("WGC central-bank workbook is missing the expected Monthly sheet");
  }

  const columns: { column: number; month: string }[] = [];
  for (let column = 3; column <= sheet.columnCount; column += 1) {
    const header = scalar(sheet.getRow(1).getCell(column).value);
    if (header === null || header === undefined || header === "") continue;
    const month = monthKey(header);
    if (!month) throw new Error(`WGC Monthly sheet has an invalid date header in column ${column}`);
    columns.push({ column, month });
  }

  const countryChanges = new Map<string, [string, number][]>();
  const countries = new Set<string>();
  const rows = columns.map(({ column, month }): [string, number] => {
    let total = 0;
    let numericCells = 0;
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const country = scalar(sheet.getRow(rowNumber).getCell(1).value);
      if (typeof country !== "string" || !country.trim()) continue;
      const countryName = country.trim();
      const value = scalar(sheet.getRow(rowNumber).getCell(column).value);
      if (value === null || value === undefined || value === "") continue;
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`WGC Monthly sheet has a non-numeric change at row ${rowNumber}, column ${column}`);
      }
      if (countryChanges.has(countryName) && countryChanges.get(countryName)!.at(-1)?.[0] === month) {
        throw new Error(`WGC Monthly sheet has duplicate country data for ${countryName} in ${month}`);
      }
      countryChanges.set(countryName, [...(countryChanges.get(countryName) ?? []), [month, value]]);
      countries.add(countryName);
      total += value;
      numericCells += 1;
    }
    if (numericCells === 0) throw new Error(`WGC Monthly sheet has no country values for ${month}`);
    return [month, total];
  });
  assertAscendingUniqueMonths(rows, "WGC central-bank");
  for (const country of countries) assertAscendingUniqueMonths(countryChanges.get(country)!, `WGC central-bank ${country}`);
  return {
    centralBankNetChanges: rows,
    centralBankCountryChanges: Object.fromEntries([...countryChanges].sort(([first], [second]) => first.localeCompare(second))),
  };
}

function parseEtfHoldings(workbook: ExcelJS.Workbook): [string, number][] {
  const sheet = workbook.getWorksheet("Holdings by month");
  if (!sheet || String(scalar(sheet.getCell("A6").value) ?? "").trim().toLowerCase() !== "date"
    || !/tonnes/i.test(String(scalar(sheet.getCell("D6").value) ?? ""))) {
    throw new Error("WGC ETF workbook is missing the expected Holdings by month layout");
  }

  const rows: [string, number][] = [];
  for (let rowNumber = 7; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const rawDate = scalar(row.getCell(1).value);
    if (rawDate === null || rawDate === undefined || rawDate === "") continue;
    const month = monthKey(rawDate);
    if (!month) throw new Error(`WGC ETF holdings sheet has an invalid date at row ${rowNumber}`);
    const value = scalar(row.getCell(4).value);
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`WGC ETF holdings sheet has an invalid global total at row ${rowNumber}`);
    }
    rows.push([month, value]);
  }
  if (rows.length === 0) throw new Error("WGC ETF holdings sheet contained no dated totals");
  assertAscendingUniqueMonths(rows, "WGC ETF holdings");
  return rows;
}

async function loadWorkbook(path: string) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  return workbook;
}

export async function parseWgcGoldWorkbooks(
  centralBankPath: string,
  etfPath: string,
  generatedAt = Date.now() / 1000,
): Promise<WgcGoldSnapshot> {
  if (!Number.isFinite(generatedAt) || generatedAt <= 0) throw new Error("WGC snapshot timestamp was invalid");
  const [centralBank, etf] = await Promise.all([
    loadWorkbook(centralBankPath),
    loadWorkbook(etfPath),
  ]);
  const { centralBankNetChanges, centralBankCountryChanges } = parseCentralBankChanges(centralBank);
  return {
    generatedAt,
    centralBankNetChanges,
    centralBankCountryChanges,
    etfHoldingsTonnes: parseEtfHoldings(etf),
  };
}
