import type { DataObservation } from "./observation-data";

export const silverIndustrialSeriesId = "SILVER-INDUSTRIAL-DEMAND";
export const silverSolarSeriesId = "SILVER-SOLAR-DEMAND";
export const silverMineSeriesId = "SILVER-MINE-SUPPLY";
export const silverEtpSeriesId = "SILVER-GLOBAL-ETP-HOLDINGS";
export const silverSurveyUrl = "https://silverinstitute.org/wp-content/uploads/2026/04/World-Silver-Survey-2026.pdf";
export const silverSurveyEdition = 2026;
export const silverSurveyPdfPage = 11;
export const silverEtpPdfPage = 84;
export const silverIndustrialUnit = "million troy ounces";

export type SilverDemandSnapshot = {
  generatedAt: number;
  edition: number;
  sourceUrl: string;
  sourceSha256: string;
  pdfPage: number;
  observations: [number, number][];
};

// Pinned to the 2026 survey's printed page 9, including its separate YoY columns.
function parseSilverSupplyDemandRow(text: string, label: string): [number, number][] {
  // PDF extraction can join the PV sub-row to the electronics row without a newline.
  const lines = text.replace(/(?:\u2026|\.{3})?\s*of which photovoltaics/g, "\nof which photovoltaics")
    .split(/\r?\n/).map((line) => line.trim());
  if (!text.includes(`World Silver Survey ${silverSurveyEdition}`) || !lines.includes("Silver Supply and Demand")
    || !lines.includes("Source: Metals Focus")) throw new Error("Unrecognized World Silver Survey supply/demand table");
  const headers = lines.filter((line) => line.startsWith("Million ounces "));
  const rows = lines.filter((line) => line.startsWith(`${label} `));
  const years = Array.from({ length: 9 }, (_, index) => 2017 + index);
  const columns = [...years.map(String), "2026F", "2025", "2026F"];
  if (headers.length !== 1 || headers[0] !== `Million ounces ${columns.join(" ")}` || rows.length !== 1) {
    throw new Error(`Silver demand table headings or ${label} row changed; review the survey before importing`);
  }
  const values = rows[0].slice(label.length + 1).split(/\s+/);
  if (values.length !== columns.length || values.some((value, index) =>
    index < 10 ? !/^\d+(?:\.\d+)?$/.test(value) || Number(value) <= 0 : !/^[+-]?\d+(?:\.\d+)?%$/.test(value))) {
    throw new Error(`Invalid silver demand table values for ${label}`);
  }
  // The forecast and percentage-change columns are deliberately not observations.
  return years.map((year, index) => [year, Number(values[index])]);
}

export function parseSilverIndustrialTable(text: string): [number, number][] {
  return parseSilverSupplyDemandRow(text, "Industrial (total)");
}

export function parseSilverSolarTable(text: string): [number, number][] {
  return parseSilverSupplyDemandRow(text, "of which photovoltaics");
}

export function parseSilverMineTable(text: string): [number, number][] {
  return parseSilverSupplyDemandRow(text, "Mine Production");
}

export function parseSilverEtpTable(text: string): [number, number][] {
  const compact = text.replace(/\s+/g, " ");
  const header = "Year/Month iShares Silver Trust ZKB WisdomTree Sprott Silver Sprott Gold & Silver India Others Total Holdings (Moz) Total Value ($M)";
  const rows = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^20\d{2}\s/.test(line));
  if (!compact.includes(`World Silver Survey ${silverSurveyEdition}`)
    || !compact.includes("Appendix 22 - Physically Backed Silver Exchange-Traded Product Holdings* Moz")
    || !compact.includes(header) || !compact.includes("*Holdings at end-period;")
    || !compact.includes("Source: Respective ETP providers, Bloomberg") || rows.length !== 10) {
    throw new Error("Unrecognized global silver ETP holdings table");
  }
  const observations = rows.map((row, index): [number, number] => {
    const fields = row.split(/\s+/);
    if (fields.length !== 10 || fields[0] !== String(2016 + index)
      || fields.slice(1).some((value, column) => !(column === 5 && value === "n/a")
        && !/^(?:\d{1,3}(?:,\d{3})+|\d+)$/.test(value))) {
      throw new Error("Silver ETP holdings table columns or annual years changed");
    }
    const value = Number(fields[8].replaceAll(",", ""));
    if (value <= 0) throw new Error("Invalid global silver ETP holdings total");
    return [2016 + index, value];
  });
  return observations.slice(1);
}

function silverSurveyObservations(snapshot: SilverDemandSnapshot, seriesId: string, measurement: "flow" | "stock" = "flow"): DataObservation[] {
  const expectedPage = seriesId === silverEtpSeriesId ? silverEtpPdfPage : silverSurveyPdfPage;
  if (!Number.isFinite(snapshot.generatedAt) || snapshot.generatedAt <= 0 || snapshot.edition !== silverSurveyEdition
    || snapshot.sourceUrl !== silverSurveyUrl || snapshot.pdfPage !== expectedPage
    || !/^[a-f0-9]{64}$/.test(snapshot.sourceSha256) || snapshot.observations.length !== 9) {
    throw new Error(`Invalid silver demand snapshot metadata for ${seriesId}`);
  }
  return snapshot.observations.map(([year, value], index) => {
    if (year !== 2017 + index || !Number.isFinite(value) || value <= 0) throw new Error(`Invalid silver demand observation for ${seriesId}`);
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    return {
      time: Date.parse(`${end}T12:00:00Z`) / 1000, value,
      reportingPeriod: { start, end, label: String(year), frequency: "annual" },
      provenance: {
        provider: "The Silver Institute / Metals Focus", seriesId,
        sourceUrl: `${snapshot.sourceUrl}#page=${snapshot.pdfPage}`, sourceDate: end,
        retrievedAt: snapshot.generatedAt, publishedAt: null, vintage: `World Silver Survey ${snapshot.edition}`,
        revisionStatus: "unknown", valueType: "reported", geography: "Global", measurement,
        rawValue: value, rawUnit: silverIndustrialUnit, normalizedUnit: silverIndustrialUnit,
        multiplier: 1, seasonalAdjustment: "not-applicable", aggregation: measurement === "stock" ? "year-end" : "annual-total",
      },
    };
  });
}

export function silverIndustrialObservations(snapshot: SilverDemandSnapshot): DataObservation[] {
  return silverSurveyObservations(snapshot, silverIndustrialSeriesId);
}

export function silverSolarObservations(snapshot: SilverDemandSnapshot): DataObservation[] {
  return silverSurveyObservations(snapshot, silverSolarSeriesId);
}

export function silverMineObservations(snapshot: SilverDemandSnapshot): DataObservation[] {
  return silverSurveyObservations(snapshot, silverMineSeriesId);
}

export function silverEtpObservations(snapshot: SilverDemandSnapshot): DataObservation[] {
  return silverSurveyObservations(snapshot, silverEtpSeriesId, "stock");
}
