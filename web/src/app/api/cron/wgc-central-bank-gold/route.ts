import { downloadWgcChangesWorkbook } from "@/lib/wgc-gold-download";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (process.env.WGC_CENTRAL_BANK_GOLD_AUTOMATION_CONFIRMED !== "true") {
    return Response.json({ error: "WGC automation is disabled" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "Cron authentication is not configured" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const result = await downloadWgcChangesWorkbook();
    return Response.json({ status: "downloaded", ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("WGC monthly workbook download failed", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "WGC workbook download failed" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
