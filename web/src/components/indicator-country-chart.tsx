"use client";

import { useState } from "react";
import type { IndicatorCardData } from "@/lib/indicators";
import type { Locale } from "@/lib/i18n";
import { IndicatorChart } from "@/components/indicator-chart";

export function IndicatorCountryChart({
  chart,
  name,
  locale,
  countryLabel,
  allCountriesLabel,
  lastYearLabel,
}: {
  chart: NonNullable<IndicatorCardData["chart"]>;
  name: string;
  locale: Locale;
  countryLabel: string;
  allCountriesLabel: string;
  lastYearLabel: string;
}) {
  const [selected, setSelected] = useState("");
  const points = chart.series?.find(({ label }) => label === selected)?.points ?? chart.points;

  return <div className="indicator-country-chart">
    {!!chart.series?.length && <label className="indicator-country-filter">
      <span>{countryLabel}</span>
      <select value={selected} onChange={(event) => setSelected(event.target.value)}>
        <option value="">{allCountriesLabel}</option>
        {chart.series.map(({ label }) => <option key={label} value={label}>{label}</option>)}
      </select>
    </label>}
    <IndicatorChart name={selected ? `${name}: ${selected}` : name} points={points} locale={locale}
      unit={chart.unit} digits={chart.digits} axisDigits={chart.axisDigits} lastYearLabel={lastYearLabel}
      chartLabel={chart.label} zeroBaseline={chart.zeroBaseline} />
  </div>;
}
