import snapshot from "./silver-industrial-observations.json" with { type: "json" };
import { silverIndustrialObservations, silverSolarObservations, silverMineObservations, silverEtpObservations, type SilverDemandSnapshot } from "@/lib/silver-industrial-parser";

function observationRows(rows: number[][]): SilverDemandSnapshot["observations"] {
  return rows.map((row) => {
    if (row.length !== 2) throw new Error("Invalid silver demand snapshot row");
    return [row[0], row[1]];
  });
}

export const silverIndustrialFeed = silverIndustrialObservations({
  ...snapshot, observations: observationRows(snapshot.observations),
});

export const silverSolarFeed = silverSolarObservations({
  ...snapshot, observations: observationRows(snapshot.solarObservations),
});

export const silverMineFeed = silverMineObservations({
  ...snapshot, observations: observationRows(snapshot.mineObservations),
});

export const silverEtpFeed = silverEtpObservations({
  ...snapshot, pdfPage: snapshot.etpPdfPage, observations: observationRows(snapshot.etpObservations),
});
