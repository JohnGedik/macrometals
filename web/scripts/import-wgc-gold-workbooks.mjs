import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseWgcGoldWorkbooks } from "../src/lib/wgc-gold-parser.ts";

async function main() {
  const [centralBankPath, etfPath, ...extraArgs] = process.argv.slice(2);
  if (!centralBankPath || !etfPath || extraArgs.length > 0) {
    throw new Error("Usage: npm run import:wgc -- <changes-workbook.xlsx> <etf-workbook.xlsx>");
  }
  const snapshot = await parseWgcGoldWorkbooks(resolve(centralBankPath), resolve(etfPath));
  const outputPath = fileURLToPath(new URL("../src/lib/wgc-gold-observations.json", import.meta.url));
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(`Generated ${snapshot.centralBankNetChanges.length} central-bank and ${snapshot.etfHoldingsTonnes.length} ETF monthly observations.`);
  console.log(`Latest central-bank period: ${snapshot.centralBankNetChanges.at(-1)?.[0] ?? "none"}`);
  console.log(`Latest ETF holdings period: ${snapshot.etfHoldingsTonnes.at(-1)?.[0] ?? "none"}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error("WGC workbook import failed", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  });
}
