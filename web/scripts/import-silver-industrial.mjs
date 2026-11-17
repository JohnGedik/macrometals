import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  parseSilverIndustrialTable, parseSilverSolarTable, silverIndustrialObservations, silverSolarObservations,
  parseSilverMineTable, parseSilverEtpTable, silverMineObservations, silverEtpObservations,
  silverSurveyEdition, silverSurveyPdfPage, silverEtpPdfPage, silverSurveyUrl,
} from "../src/lib/silver-industrial-parser.ts";

async function main() {
  const [pdfPath, ...extra] = process.argv.slice(2);
  if (extra.length) throw new Error("Usage: npm run import:silver [-- <World-Silver-Survey-2026.pdf>]");
  let bytes;
  if (pdfPath) {
    bytes = new Uint8Array(await readFile(pdfPath));
  } else {
    const response = await fetch(silverSurveyUrl, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`Silver survey download failed: HTTP ${response.status}`);
    bytes = new Uint8Array(await response.arrayBuffer());
  }
  const sourceSha256 = createHash("sha256").update(bytes).digest("hex");
  const document = await getDocument({ data: bytes, disableFontFace: true, useSystemFonts: true }).promise;
  try {
    async function pageText(pageNumber) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      return content.items.filter((item) => "str" in item)
        .map((item) => item.str + (item.hasEOL ? "\n" : " ")).join("")
        .split("\n").map((line) => line.trim().replace(/\s+/g, " ")).join("\n");
    }
    const [text, etpText] = await Promise.all([pageText(silverSurveyPdfPage), pageText(silverEtpPdfPage)]);
    const snapshot = {
      generatedAt: Date.now() / 1000, edition: silverSurveyEdition, sourceUrl: silverSurveyUrl,
      sourceSha256, pdfPage: silverSurveyPdfPage, observations: parseSilverIndustrialTable(text),
      solarObservations: parseSilverSolarTable(text),
      mineObservations: parseSilverMineTable(text),
      etpPdfPage: silverEtpPdfPage, etpObservations: parseSilverEtpTable(etpText),
    };
    silverIndustrialObservations(snapshot);
    silverSolarObservations({ ...snapshot, observations: snapshot.solarObservations });
    silverMineObservations({ ...snapshot, observations: snapshot.mineObservations });
    silverEtpObservations({ ...snapshot, pdfPage: snapshot.etpPdfPage, observations: snapshot.etpObservations });
    if (snapshot.solarObservations.some(([year, value], index) =>
      year !== snapshot.observations[index][0] || value > snapshot.observations[index][1])) {
      throw new Error("Photovoltaic demand must be a subset of industrial demand for each reporting year");
    }
    await writeFile(new URL("../src/lib/silver-industrial-observations.json", import.meta.url), `${JSON.stringify(snapshot, null, 2)}\n`);
    console.log(`Imported ${snapshot.observations.length} annual industrial silver observations from World Silver Survey ${snapshot.edition}.`);
    console.log(`Latest actual: ${snapshot.observations.at(-1).join(": ")} million troy ounces. Forecasts excluded.`);
    console.log(`Imported ${snapshot.solarObservations.length} annual photovoltaic observations. Latest actual: ${snapshot.solarObservations.at(-1).join(": ")} million troy ounces.`);
    console.log(`Imported ${snapshot.mineObservations.length} annual mine production observations. Latest actual: ${snapshot.mineObservations.at(-1).join(": ")} million troy ounces.`);
    console.log(`Imported ${snapshot.etpObservations.length} global year-end ETP holdings observations. Latest actual: ${snapshot.etpObservations.at(-1).join(": ")} million troy ounces (rounded source totals).`);
  } finally {
    await document.destroy();
  }
}

main().catch((error) => {
  console.error("Silver survey import failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
