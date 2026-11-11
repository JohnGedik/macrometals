"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CommodityHeaderData } from "@/lib/indicators";
import type { Locale } from "@/lib/i18n";

export function CommodityHeader({
  name,
  description,
  data,
  labels,
  locale,
}: {
  name: string;
  description: string;
  data: CommodityHeaderData;
  labels: {
    currentPrice: string;
    dailyChange: string;
    oneYearReturn: string;
    high52Week: string;
    low52Week: string;
    chartLabel: string;
    unavailable: string;
    observed: string;
  };
  locale: Locale;
}) {
  const localeCode = locale === "tr" ? "tr-TR" : "en-US";
  const priceFormat = new Intl.NumberFormat(localeCode, { minimumFractionDigits: data.unit === "lb" ? 3 : 2, maximumFractionDigits: data.unit === "lb" ? 3 : 2 });
  const percentFormat = new Intl.NumberFormat(localeCode, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "always" });
  const monthYearFormat = new Intl.DateTimeFormat(localeCode, { month: "short", year: "2-digit", timeZone: "UTC" });
  const dateFormat = new Intl.DateTimeFormat(localeCode, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const quarterTicks = data.points.reduce<number[]>((ticks, point) => {
    const date = new Date(point.time * 1000);
    if (date.getUTCMonth() % 3 === 0 && !ticks.some((time) => {
      const existing = new Date(time * 1000);
      return existing.getUTCMonth() === date.getUTCMonth() && existing.getUTCFullYear() === date.getUTCFullYear();
    })) ticks.push(point.time);
    return ticks;
  }, []);
  const formatPrice = (value: number | null) => value === null ? "—" : `$${priceFormat.format(value)} / ${data.unit}`;
  const formatPercent = (value: number | null) => value === null ? "—" : `${percentFormat.format(value)}%`;
  const observed = data.observedAt === null ? "—" : dateFormat.format(new Date(data.observedAt * 1000));

  return (
    <section className="commodity-header" aria-label={`${name} market summary`}>
      <div className="commodity-header-overview">
        <p className="eyebrow">{labels.currentPrice}</p>
        <h1>{name}</h1>
        <p className="listing-intro">{description}</p>
        <strong className="commodity-current-price">{formatPrice(data.price)}</strong>
        <dl className="commodity-metrics">
          <div className={data.dailyChange === null ? "" : data.dailyChange >= 0 ? "metric-positive" : "metric-negative"}>
            <dt>{labels.dailyChange}</dt><dd>{formatPercent(data.dailyChange)}</dd>
          </div>
          <div className={data.oneYearReturn === null ? "" : data.oneYearReturn >= 0 ? "metric-positive" : "metric-negative"}>
            <dt>{labels.oneYearReturn}</dt><dd>{formatPercent(data.oneYearReturn)}</dd>
          </div>
          <div><dt>{labels.high52Week}</dt><dd>{formatPrice(data.high52Week)}</dd></div>
          <div><dt>{labels.low52Week}</dt><dd>{formatPrice(data.low52Week)}</dd></div>
        </dl>
        <p className="commodity-observed">{labels.observed}: {observed}</p>
      </div>
      <div className="commodity-header-chart" role="img" aria-label={`${name}, ${labels.chartLabel}`}>
        {data.points.length ? <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.points} margin={{ top: 10, right: 12, bottom: 3, left: 3 }}>
            <XAxis
              dataKey="time"
              type="number"
              domain={["dataMin", "dataMax"]}
              ticks={quarterTicks}
              padding={{ left: 20, right: 20 }}
              tickFormatter={(time: number) => {
                const parts = monthYearFormat.formatToParts(new Date(time * 1000));
                return `${parts.find((part) => part.type === "month")?.value ?? ""}-${parts.find((part) => part.type === "year")?.value ?? ""}`;
              }}
              tick={{ fill: "var(--muted)", fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "var(--line)" }}
              height={20}
              interval={0}
              minTickGap={14}
            />
            <YAxis
              dataKey="value"
              domain={[0, "auto"]}
              tickFormatter={(value: number) => `$${priceFormat.format(value)}`}
              tick={{ fill: "var(--muted)", fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              width={58}
              tickCount={4}
              allowDataOverflow={false}
            />
            <Tooltip
              cursor={{ stroke: "var(--muted)", strokeDasharray: "4 4" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const value = Number(payload[0].value);
                return <div className="commodity-chart-tooltip"><span>{dateFormat.format(new Date(Number(label) * 1000))}</span><strong>{formatPrice(value)}</strong></div>;
              }}
            />
            <Line type="monotone" dataKey="value" stroke="var(--green)" strokeWidth={2.2} dot={false} activeDot={{ r: 4, fill: "var(--green)", stroke: "var(--paper-light)", strokeWidth: 2 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer> : <p className="commodity-unavailable">{labels.unavailable}</p>}
      </div>
    </section>
  );
}
