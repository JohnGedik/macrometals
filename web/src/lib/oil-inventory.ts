export type InventoryPoint = { date: string; value: number };

export function calculateInventory(points: InventoryPoint[]) {
  const sorted = [...points].sort((left, right) => left.date.localeCompare(right.date));
  const changes = sorted.flatMap((point, index) => {
    const previous = sorted[index - 1];
    if (!previous || Date.parse(point.date) - Date.parse(previous.date) !== 7 * 86400000) return [];
    return [{ date: point.date, value: (point.value - previous.value) / 1000 }];
  });
  const latest = changes.at(-1);
  if (!latest || latest.date !== sorted.at(-1)?.date) return null;

  const date = new Date(`${latest.date}T00:00:00Z`);
  const seasonal = Array.from({ length: 5 }, (_, index) => {
    const target = new Date(date);
    target.setUTCFullYear(date.getUTCFullYear() - index - 1);
    return changes
      .map((point) => ({ point, distance: Math.abs(Date.parse(point.date) - target.getTime()) }))
      .filter((candidate) => candidate.distance <= 4 * 86400000)
      .sort((left, right) => left.distance - right.distance)[0]?.point.value;
  });

  return {
    date: latest.date,
    change: latest.value,
    average: seasonal.every((value) => value !== undefined)
      ? seasonal.reduce<number>((total, value) => total + value!, 0) / 5
      : null,
  };
}

export async function getOilInventory() {
  const key = process.env.EIA_API_KEY;
  if (!key) return null;
  try {
    const url = new URL("https://api.eia.gov/v2/petroleum/stoc/wstk/data/");
    url.searchParams.set("api_key", key);
    url.searchParams.set("frequency", "weekly");
    url.searchParams.append("data[]", "value");
    url.searchParams.append("facets[series][]", "WCESTUS1");
    url.searchParams.set("sort[0][column]", "period");
    url.searchParams.set("sort[0][direction]", "desc");
    url.searchParams.set("length", "400");
    const response = await fetch(url, { next: { revalidate: 21600 }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) return null;
    const payload = (await response.json()) as { response?: { data?: Array<{ period?: string; value?: string | number | null }> } };
    const points = (payload.response?.data ?? []).flatMap((row) => {
      const value = row.value === null || row.value === undefined || row.value === "" ? NaN : Number(row.value);
      return row.period && /^\d{4}-\d{2}-\d{2}$/.test(row.period) && Number.isFinite(value)
        ? [{ date: row.period, value }]
        : [];
    });
    return calculateInventory(points);
  } catch {
    return null;
  }
}