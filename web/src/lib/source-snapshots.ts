import { createHash } from "node:crypto";
import { parseFredObservations, type FredSeriesDefinition } from "@/lib/observation-data";

export type SourceSnapshot = {
  id: string;
  schemaVersion: 1;
  seriesId: string;
  sourceUrl: string;
  checksum: string;
  capturedAt: number;
  definition: FredSeriesDefinition;
  rawCsv: string;
};

export function createSourceSnapshot(rawCsv: string, definition: FredSeriesDefinition, capturedAt = Date.now() / 1000): SourceSnapshot {
  if (!Number.isFinite(capturedAt) || Buffer.byteLength(rawCsv, "utf8") > 2 * 1024 * 1024
    || !parseFredObservations(rawCsv, definition, capturedAt).length) throw new Error("Invalid source snapshot");
  const checksum = createHash("sha256").update(rawCsv).digest("hex");
  const identity = { seriesId: definition.seriesId, frequency: definition.frequency, rawUnit: definition.rawUnit,
    normalizedUnit: definition.normalizedUnit, multiplier: definition.multiplier, measurement: definition.measurement,
    seasonalAdjustment: definition.seasonalAdjustment };
  const id = createHash("sha256").update(JSON.stringify({ schemaVersion: 1, definition: identity, checksum })).digest("hex");
  return { id, schemaVersion: 1, seriesId: definition.seriesId,
    sourceUrl: `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${definition.seriesId}`,
    checksum, capturedAt, definition: { ...definition }, rawCsv };
}

export function verifySourceSnapshot(snapshot: SourceSnapshot) {
  if (snapshot.schemaVersion !== 1 || snapshot.seriesId !== snapshot.definition.seriesId) throw new Error("Unsupported source snapshot");
  const rebuilt = createSourceSnapshot(snapshot.rawCsv, snapshot.definition, snapshot.capturedAt);
  if (rebuilt.checksum !== snapshot.checksum || rebuilt.id !== snapshot.id || rebuilt.sourceUrl !== snapshot.sourceUrl) throw new Error("Source snapshot integrity mismatch");
  return parseFredObservations(snapshot.rawCsv, snapshot.definition, snapshot.capturedAt);
}

export function snapshotChanges(previous: SourceSnapshot | null, current: SourceSnapshot) {
  const next = verifySourceSnapshot(current);
  if (!previous) return { added: next.length, revised: 0, removed: 0 };
  if (previous.seriesId !== current.seriesId) throw new Error("Cannot compare different source series");
  const prior = verifySourceSnapshot(previous);
  const oldValues = new Map(prior.map((point) => [point.provenance!.sourceDate, point.provenance!.rawValue]));
  const newValues = new Map(next.map((point) => [point.provenance!.sourceDate, point.provenance!.rawValue]));
  return {
    added: [...newValues.keys()].filter((date) => !oldValues.has(date)).length,
    revised: [...newValues].filter(([date, value]) => oldValues.has(date) && oldValues.get(date) !== value).length,
    removed: [...oldValues.keys()].filter((date) => !newValues.has(date)).length,
  };
}

export function snapshotKnownAt(snapshots: readonly SourceSnapshot[], seriesId: string, asOf: number) {
  if (!Number.isFinite(asOf)) return null;
  const snapshot = snapshots.filter((item) => item.seriesId === seriesId && item.capturedAt <= asOf)
    .toSorted((first, second) => second.capturedAt - first.capturedAt || first.id.localeCompare(second.id))[0];
  if (!snapshot) return null;
  verifySourceSnapshot(snapshot);
  return snapshot;
}