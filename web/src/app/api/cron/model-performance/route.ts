import { captureDailyModelSnapshots, evaluateDueModelPerformance } from "@/lib/model-performance";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "Cron authentication is not configured" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const snapshots = await captureDailyModelSnapshots();
    const evaluated = await evaluateDueModelPerformance();
    return Response.json({
      status: "completed",
      snapshotsCreated: snapshots.filter((snapshot) => snapshot.created).length,
      snapshotsUnchanged: snapshots.filter((snapshot) => !snapshot.created).length,
      evaluationsUpdated: evaluated,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Daily model performance job failed", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "Daily model performance job failed" }, {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
