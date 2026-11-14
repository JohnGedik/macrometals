import { load } from "cheerio";

export const wgcGoldReservesPageUrl = "https://www.gold.org/goldhub/data/gold-reserves-by-country";

const wgcOrigin = new URL(wgcGoldReservesPageUrl).origin;
const maxPageBytes = 2 * 1024 * 1024;
const maxWorkbookBytes = 10 * 1024 * 1024;

function findLatestChangesWorkbookUrl(html: string) {
  if (Buffer.byteLength(html, "utf8") > maxPageBytes) throw new Error("WGC data page exceeded the size limit");
  const page = load(html);
  const anchor = page("a[href]").toArray().find((element) => {
    const item = page(element);
    const searchable = [item.text(), item.attr("title"), item.attr("aria-label"), item.attr("href")]
      .filter((value): value is string => !!value).join(" ");
    return /changes_latest|changes in world official gold reserves/i.test(searchable);
  });
  const href = anchor ? page(anchor).attr("href") : undefined;
  if (!href) throw new Error("WGC changes workbook link was not found");
  const url = new URL(href, wgcGoldReservesPageUrl);
  if (url.origin !== wgcOrigin || !/^\/download\/file\/\d+\/[^/]+\.xlsx$/i.test(url.pathname)) {
    throw new Error("WGC changes workbook link was outside the approved download location");
  }
  return url;
}

export async function downloadWgcChangesWorkbook(fetcher: typeof fetch = fetch) {
  const options = {
    cache: "no-store" as const,
    headers: { Accept: "text/html,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    signal: AbortSignal.timeout(20_000),
  };
  const pageResponse = await fetcher(wgcGoldReservesPageUrl, options);
  if (!pageResponse.ok) throw new Error(`WGC data page returned ${pageResponse.status}`);
  const pageHtml = await pageResponse.text();
  const workbookUrl = findLatestChangesWorkbookUrl(pageHtml);
  const workbookResponse = await fetcher(workbookUrl, {
    ...options,
    headers: { Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  });
  if (!workbookResponse.ok) throw new Error(`WGC workbook returned ${workbookResponse.status}`);
  if (workbookResponse.url && new URL(workbookResponse.url).origin !== wgcOrigin) {
    throw new Error("WGC workbook redirected outside the approved download location");
  }
  const declaredLength = Number(workbookResponse.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxWorkbookBytes) {
    throw new Error("WGC workbook exceeded the size limit");
  }
  const bytes = await workbookResponse.arrayBuffer();
  if (bytes.byteLength < 4 || bytes.byteLength > maxWorkbookBytes) throw new Error("WGC workbook size was invalid");
  const signature = new Uint8Array(bytes, 0, 4);
  if (signature[0] !== 0x50 || signature[1] !== 0x4b) throw new Error("WGC response was not an XLSX workbook");

  return { sourceUrl: workbookUrl.href, bytes: bytes.byteLength, downloadedAt: Date.now() };
}
