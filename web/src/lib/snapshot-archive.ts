import { snapshotChanges, verifySourceSnapshot, type SourceSnapshot } from "@/lib/source-snapshots";
import { fredArchivePermitted } from "@/lib/source-rights";

export type ArchiveEvidence = {
  status: "stored" | "disabled" | "failed";
  checksum?: string;
  firstCapturedAt?: number;
  capturedAt?: number;
  changes?: { added: number; revised: number; removed: number };
};

type CaptureResult = { captured_at: string; first_captured_at: string; previous: SourceSnapshot | null; changed: boolean };

async function captureInSupabase(snapshot: SourceSnapshot): Promise<CaptureResult> {
  const { createAdminClient } = await import("@supabase/server/core");
  const client = createAdminClient();
  const { data, error } = await client.rpc("capture_fred_snapshot", {
    p_id: snapshot.id, p_series_id: snapshot.seriesId, p_checksum: snapshot.checksum,
    p_definition: snapshot.definition, p_raw_csv: snapshot.rawCsv, p_schema_version: snapshot.schemaVersion,
  }).abortSignal(AbortSignal.timeout(4000));
  if (error || !data || typeof data !== "object") throw new Error("Source archive unavailable");
  return data as CaptureResult;
}

export async function archiveSourceSnapshot(snapshot: SourceSnapshot, capture = captureInSupabase): Promise<ArchiveEvidence> {
  if (typeof window !== "undefined") throw new Error("Source archive is server-only");
  if (process.env.SOURCE_ARCHIVE_ENABLED !== "true" || !fredArchivePermitted(snapshot.seriesId)) return { status: "disabled" };
  try {
    verifySourceSnapshot(snapshot);
    const row = await capture(snapshot);
    const capturedAt = Date.parse(row.captured_at) / 1000;
    const firstCapturedAt = Date.parse(row.first_captured_at) / 1000;
    if (!Number.isFinite(capturedAt) || !Number.isFinite(firstCapturedAt) || firstCapturedAt < 0 || firstCapturedAt > capturedAt) throw new Error("Invalid archive dates");
    const stored = { ...snapshot, capturedAt };
    const changes = row.changed ? snapshotChanges(row.previous, stored) : { added: 0, revised: 0, removed: 0 };
    return { status: "stored", checksum: snapshot.checksum, capturedAt, firstCapturedAt, changes };
  } catch {
    return { status: "failed" };
  }
}

export async function archivedSnapshotKnownAt(seriesId: string, asOf: number): Promise<{ status: "available" | "disabled" | "failed"; snapshot: SourceSnapshot | null }> {
  if (typeof window !== "undefined") throw new Error("Source archive is server-only");
  if (process.env.SOURCE_ARCHIVE_ENABLED !== "true" || !fredArchivePermitted(seriesId)) return { status: "disabled", snapshot: null };
  try {
    const { createAdminClient } = await import("@supabase/server/core");
    const { data, error } = await createAdminClient().from("fred_source_captures")
      .select("captured_at,snapshot:fred_source_snapshots(*)")
      .eq("series_id", seriesId).lte("captured_at", new Date(asOf * 1000).toISOString())
      .order("captured_at", { ascending: false }).order("id", { ascending: false })
      .limit(1).abortSignal(AbortSignal.timeout(4000)).maybeSingle();
    if (error) throw new Error("Source archive unavailable");
    if (!data) return { status: "available", snapshot: null };
    const row = data as unknown as { captured_at: string; snapshot: {
      id: string; schema_version: 1; series_id: string; checksum: string;
      definition: SourceSnapshot["definition"]; raw_csv: string;
    } };
    const stored = row.snapshot;
    const snapshot: SourceSnapshot = { id: stored.id, schemaVersion: stored.schema_version,
      seriesId: stored.series_id, sourceUrl: `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${stored.series_id}`,
      checksum: stored.checksum, capturedAt: Date.parse(row.captured_at) / 1000, definition: stored.definition, rawCsv: stored.raw_csv };
    verifySourceSnapshot(snapshot);
    if (snapshot.seriesId !== seriesId || snapshot.capturedAt > asOf) throw new Error("Invalid archived capture");
    return { status: "available", snapshot };
  } catch {
    return { status: "failed", snapshot: null };
  }
}