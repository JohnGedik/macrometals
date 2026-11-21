"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  marketComparisonAssets,
  marketComparisonForRange,
  marketComparisonRanges,
  type MarketComparisonAssetId,
  type MarketComparisonPoint,
  type MarketComparisonRange,
} from "@/lib/market-comparison";
import type { Locale } from "@/lib/i18n";

export function HomeMarketComparisonChart({
  points,
  locale,
  labels,
  observedAt,
  sourceNote,
  noSelectionLabel,
  seriesLabel,
  titles,
  ranges,
  rangeLabel,
  unavailableLabel,
  eyebrow,
  note,
}: {
  points: MarketComparisonPoint[];
  locale: Locale;
  labels: Record<MarketComparisonAssetId, string>;
  observedAt: number | null;
  sourceNote: string;
  noSelectionLabel: string;
  seriesLabel: string;
  titles: Record<MarketComparisonRange, string>;
  ranges: Record<MarketComparisonRange, string>;
  rangeLabel: string;
  unavailableLabel: string;
  eyebrow: string;
  note: string;
}) {
  const [visibleAssets, setVisibleAssets] = useState<Set<MarketComparisonAssetId>>(
    () => new Set(["gold", "sp500"]),
  );
  const [range, setRange] = useState<MarketComparisonRange>("5y");
  const rangePoints = useMemo(() => marketComparisonForRange(points, range), [points, range]);
  const localeCode = locale === "tr" ? "tr-TR" : "en-US";
  const numberFormat = new Intl.NumberFormat(localeCode, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const dateFormat = new Intl.DateTimeFormat(localeCode, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const axisFormat = new Intl.DateTimeFormat(localeCode, range === "1m"
    ? { month: "short", day: "numeric", timeZone: "UTC" }
    : range === "5y" || range === "10y"
      ? { year: "numeric", timeZone: "UTC" }
      : { month: "short", year: "2-digit", timeZone: "UTC" });
  const tickCount = Math.min(6, rangePoints.length);
  const ticks = Array.from({ length: tickCount }, (_, index) =>
    rangePoints[Math.floor(index * (rangePoints.length - 1) / (tickCount - 1))].time);
  const updatedLabel = observedAt === null
    ? ""
    : new Intl.DateTimeFormat(localeCode, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
      .format(observedAt * 1000);

  return (
    <>
    <div className="section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id="home-market-comparison-title">{titles[range]}</h2>
      </div>
      <p className="home-market-comparison-note">{note}</p>
    </div>
    {points.length ? (
    <div className="home-market-comparison-panel">
      <div className="home-market-comparison-ranges" role="group" aria-label={rangeLabel}>
        {marketComparisonRanges.map((option) => (
          <button key={option} type="button" aria-pressed={range === option} onClick={() => setRange(option)}>
            {ranges[option]}
          </button>
        ))}
      </div>
      <div
        className="home-market-comparison-plot"
        role={rangePoints.length && visibleAssets.size ? "img" : undefined}
        aria-label={rangePoints.length && visibleAssets.size ? titles[range] : undefined}
      >
        {!rangePoints.length ? (
          <p className="home-market-comparison-empty" role="status">{unavailableLabel}</p>
        ) : visibleAssets.size ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rangePoints} margin={{ top: 8, right: 12, bottom: 3, left: 3 }}>
              <CartesianGrid stroke="#333333" strokeOpacity={0.22} vertical horizontal />
              <XAxis
                dataKey="time"
                type="number"
                domain={["dataMin", "dataMax"]}
                ticks={ticks}
                tickFormatter={(time: number) => axisFormat.format(new Date(time * 1000))}
                tick={{ fill: "#707970", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "#a7aaa1" }}
                height={22}
                interval={0}
                minTickGap={20}
              />
              <YAxis
                domain={["auto", "auto"]}
                tickFormatter={(value: number) => numberFormat.format(value)}
                tick={{ fill: "#707970", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={48}
                tickCount={5}
              />
              <Tooltip
                cursor={{ stroke: "#707970", strokeDasharray: "3 3" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload as MarketComparisonPoint;
                  return (
                    <div className="home-market-comparison-tooltip">
                      <strong>{dateFormat.format(new Date(Number(label) * 1000))}</strong>
                      {marketComparisonAssets.filter(({ id }) => visibleAssets.has(id)).map(({ id, color }) => (
                        <span key={id}>
                          <i style={{ backgroundColor: color }} aria-hidden="true" />
                          {labels[id]}: {numberFormat.format(row[id])} ({row[id] >= 100 ? "+" : ""}{numberFormat.format(row[id] - 100)}%)
                        </span>
                      ))}
                    </div>
                  );
                }}
              />
              <ReferenceLine y={100} stroke="#707970" strokeDasharray="4 4" strokeOpacity={0.7} />
              {marketComparisonAssets.filter(({ id }) => visibleAssets.has(id)).map(({ id, color }) => (
                <Line
                  key={id}
                  type="monotone"
                  dataKey={id}
                  stroke={color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, stroke: "var(--paper-light)", strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="home-market-comparison-empty" role="status">{noSelectionLabel}</p>
        )}
      </div>
      <fieldset className="home-market-comparison-legend">
        <legend className="sr-only">{seriesLabel}</legend>
        {marketComparisonAssets.map(({ id, color }) => (
          <label key={id}>
            <input
              type="checkbox"
              checked={visibleAssets.has(id)}
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                setVisibleAssets((current) => {
                  const next = new Set(current);
                  if (checked) next.add(id);
                  else next.delete(id);
                  return next;
                });
              }}
            />
            <i style={{ backgroundColor: color }} aria-hidden="true" />
            {labels[id]}
          </label>
        ))}
      </fieldset>
      <p className="home-market-comparison-source">
        {sourceNote}{updatedLabel ? ` · ${locale === "tr" ? "Son gözlem" : "Latest observation"}: ${updatedLabel} UTC` : ""}
      </p>
    </div>
    ) : <p className="home-market-comparison-unavailable" role="status">{unavailableLabel}</p>}
    </>
  );
}
