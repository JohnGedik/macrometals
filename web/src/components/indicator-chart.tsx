"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { IndicatorChartPoint } from "@/lib/indicators";
import type { Locale } from "@/lib/i18n";

export function IndicatorChart({
  name,
  points,
  locale,
  unit,
  digits,
  axisDigits,
  lastYearLabel,
  chartLabel,
  zeroBaseline = false,
}: {
  name: string;
  points: IndicatorChartPoint[];
  locale: Locale;
  unit: string;
  digits: number;
  axisDigits?: number;
  lastYearLabel: string;
  chartLabel: string;
  zeroBaseline?: boolean;
}) {
  const localeCode = locale === "tr" ? "tr-TR" : "en-US";
  const numberFormat = new Intl.NumberFormat(localeCode, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const axisNumberFormat = new Intl.NumberFormat(localeCode, { maximumFractionDigits: axisDigits ?? digits });
  const dateFormat = new Intl.DateTimeFormat(localeCode, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const monthYearFormat = new Intl.DateTimeFormat(localeCode, { month: "short", year: "2-digit", timeZone: "UTC" });
  const annualSeries = points.length > 0 && points.every((point) => point.label && /^\d{4}$/.test(point.label));
  const multiYearSeries = points.length > 1 && points.at(-1)!.time - points[0].time > 2.5 * 365 * 86400;
  const yearlyTicks = points.reduce<number[]>((ticks, point) => {
    const year = new Date(point.time * 1000).getUTCFullYear();
    if (!ticks.some((time) => new Date(time * 1000).getUTCFullYear() === year)) ticks.push(point.time);
    return ticks;
  }, []).filter((_, index) => index % 2 === 0);
  const quarterlyTicks = annualSeries
    ? points.filter((_, index) => index % 2 === 0).map((point) => point.time)
    : multiYearSeries
      ? yearlyTicks
      : points.reduce<number[]>((ticks, point) => {
          const date = new Date(point.time * 1000);
          const month = date.getUTCMonth();
          if (month % 3 === 0 && !ticks.some((tick) => new Date(tick * 1000).getUTCMonth() === month && new Date(tick * 1000).getUTCFullYear() === date.getUTCFullYear())) {
            ticks.push(point.time);
          }
          return ticks;
        }, []);
  const formatMonthYear = (time: number) => {
    if (annualSeries) return points.find((point) => point.time === time)?.label ?? "";
    if (multiYearSeries) return String(new Date(time * 1000).getUTCFullYear());
    const parts = monthYearFormat.formatToParts(new Date(time * 1000));
    return `${parts.find((part) => part.type === "month")?.value ?? ""}-${parts.find((part) => part.type === "year")?.value ?? ""}`;
  };
  const formatAxisValue = (value: number) => `${axisNumberFormat.format(value)}${unit}`;

  return (
    <div className="indicator-chart" role="img" aria-label={`${name}, ${lastYearLabel}`}>
      <span className="indicator-chart-caption">{chartLabel}</span>
      <div className="indicator-chart-plot">
        <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 3, left: 3 }}>
          <CartesianGrid stroke="#333333" strokeOpacity={0.3} horizontal vertical />
          <XAxis
            dataKey="time"
            type="number"
            domain={["dataMin", "dataMax"]}
            ticks={quarterlyTicks}
            padding={{ left: 18, right: 18 }}
            tickFormatter={formatMonthYear}
            tick={{ fill: "#888888", fontSize: 9 }}
            tickLine={false}
            axisLine={{ stroke: "#888888" }}
            height={18}
            interval={0}
            minTickGap={12}
          />
          <YAxis
            dataKey="value"
            domain={["auto", "auto"]}
            tickFormatter={formatAxisValue}
            tick={{ fill: "#888888", fontSize: 9 }}
            tickLine={false}
            axisLine={{ stroke: "#888888" }}
            width={54}
            tickCount={5}
            allowDataOverflow={false}
          />
          <Tooltip
            cursor={{ stroke: "var(--chart-cursor)", strokeDasharray: "3 3" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as IndicatorChartPoint;
              const value = typeof payload[0].value === "number" ? payload[0].value : Number(payload[0].value);
              return (
                <div className="indicator-chart-tooltip">
                  <span>{point.label ?? dateFormat.format(new Date(Number(label) * 1000))}</span>
                  <strong>{numberFormat.format(value)}{unit}</strong>
                </div>
              );
            }}
          />
          {zeroBaseline && <ReferenceLine y={0} stroke="var(--muted)" strokeDasharray="4 3" strokeOpacity={0.75} />}
          <Line type="monotone" dataKey="value" stroke="#D4AF37" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#D4AF37", stroke: "var(--paper-light)", strokeWidth: 2 }} isAnimationActive={false} />
        </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}