"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  marketComparisonAssets,
  type MarketComparisonAssetId,
  type MarketComparisonPoint,
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
}: {
  points: MarketComparisonPoint[];
  locale: Locale;
  labels: Record<MarketComparisonAssetId, string>;
  observedAt: number | null;
  sourceNote: string;
  noSelectionLabel: string;
  seriesLabel: string;
}) {
  const [visibleAssets, setVisibleAssets] = useState<Set<MarketComparisonAssetId>>(
    () => new Set(marketComparisonAssets.map(({ id }) => id)),
  );
  const localeCode = locale === "tr" ? "tr-TR" : "en-US";
  const numberFormat = new Intl.NumberFormat(localeCode, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const dateFormat = new Intl.DateTimeFormat(localeCode, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const monthFormat = new Intl.DateTimeFormat(localeCode, { month: "short", year: "2-digit", timeZone: "UTC" });
  const quarterlyTicks = points.reduce<number[]>((ticks, point) => {
    const date = new Date(point.time * 1000);
    if (date.getUTCMonth() % 3 === 0 && !ticks.some((tick) => {
      const tickDate = new Date(tick * 1000);
      return tickDate.getUTCMonth() === date.getUTCMonth() && tickDate.getUTCFullYear() === date.getUTCFullYear();
    })) ticks.push(point.time);
    return ticks;
  }, []);
  const updatedLabel = observedAt === null
    ? ""
    : new Intl.DateTimeFormat(localeCode, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
      .format(observedAt * 1000);

  return (
    <div className="home-market-comparison-panel">
      <div className="home-market-comparison-plot" role="img" aria-label={sourceNote}>
        {visibleAssets.size ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 12, bottom: 3, left: 3 }}>
              <CartesianGrid stroke="#333333" strokeOpacity={0.22} vertical horizontal />
              <XAxis
                dataKey="time"
                type="number"
                domain={["dataMin", "dataMax"]}
                ticks={quarterlyTicks}
                tickFormatter={(time: number) => monthFormat.format(new Date(time * 1000))}
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
  );
}
