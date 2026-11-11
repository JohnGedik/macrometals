"use client";

import { ArrowDown, ArrowUp, Info } from "lucide-react";
import { messages, type Locale } from "@/lib/i18n";
import { calculateCommodityChanges, rankCommodityChanges, type ChangePeriod, type CommodityChangesInput } from "@/lib/commodity-changes";
import { useDashboardPreference } from "@/lib/dashboard-preferences";

export function WhatsChangedCard({ locale, ...input }: CommodityChangesInput & { locale: Locale }) {
  const t = messages[locale].macro;
  const changes = calculateCommodityChanges(input);
  const options: { period: ChangePeriod; label: string }[] = [
    { period: "monthly", label: t.monthlyChange },
    { period: "quarterly", label: t.quarterlyChange },
    { period: "yoy", label: t.yearOverYear },
  ];
  const available = options.filter((option) => changes.some((indicator) => indicator.changes[option.period] !== null));
  const [preferredPeriod, setPreferredPeriod] = useDashboardPreference("change-period");
  const period = available.some((option) => option.period === preferredPeriod) ? preferredPeriod
    : available.some((option) => option.period === "yoy") ? "yoy" : available[0]?.period ?? "yoy";
  const ranked = rankCommodityChanges(input, changes, period);
  const comparisonCount = changes.filter((indicator) => indicator.changes[period] !== null).length;
  const format = new Intl.NumberFormat(locale === "tr" ? "tr-TR" : "en-US", {
    minimumFractionDigits: 1, maximumFractionDigits: 2, signDisplay: "always",
  });

  return (
    <section className="whats-changed-card" aria-labelledby={`${input.commodity}-whats-changed-title`}>
      <div className="whats-changed-heading">
        <h3 id={`${input.commodity}-whats-changed-title`}>{t.whatsChanged}</h3>
        <div className="whats-changed-periods" role="group" aria-label={t.changePeriod}>
          {options.map((option) => {
            const enabled = available.some((candidate) => candidate.period === option.period);
            return <button key={option.period} type="button" disabled={!enabled} aria-pressed={enabled && period === option.period}
              title={!enabled ? t.periodHistoryUnavailable : undefined} onClick={() => setPreferredPeriod(option.period)}>{option.label}</button>;
          })}
        </div>
      </div>
      <p className="whats-changed-note">{t.changeCoverage.replace("{count}", String(comparisonCount)).replace("{total}", String(input.indicators.length))}{comparisonCount < input.indicators.length && ` ${t.periodHistoryUnavailable}`}</p>
      {input.scoringRestricted && <p className="whats-changed-note">{t.approvedChangesOnly}</p>}
      <div className="whats-changed-columns">
        {([
          { key: "positive", title: t.positiveDevelopments, drivers: ranked.positive, empty: t.noPositiveContributors },
          { key: "negative", title: t.negativeDevelopments, drivers: ranked.negative, empty: t.noNegativeContributors },
        ] as const).map((group) => (
          <section className={`whats-changed-group whats-changed-${group.key}`} key={group.key}>
            <h4>{group.title}</h4>
            {group.drivers.length ? <ul>{group.drivers.map((driver) => {
              const indicator = input.indicators.find((candidate) => candidate.id === driver.id)!;
              const suffix = indicator.changeKind === "percentage" ? "%" : indicator.changeKind === "points"
                ? (locale === "tr" ? " yüzde puan" : " pp") : (locale === "tr" ? " endeks puanı" : " index pts");
              const explanation = indicator.explanation[locale];
              const tooltip = typeof explanation === "string" ? explanation : explanation[driver.positive ? "bullish" : "bearish"];
              const tooltipId = `${input.commodity}-${driver.id}-change-tooltip`;
              const Arrow = driver.positive ? ArrowUp : ArrowDown;
              return <li className="whats-changed-row" key={driver.id}>
                <Arrow size={15} aria-hidden="true" />
                <span className="whats-changed-name">{indicator.name[locale]}</span>
                <strong>{format.format(driver.change)}{suffix}</strong>
                <button className="whats-changed-info" type="button" aria-label={`${indicator.name[locale]}: ${t.changeDetails}`} aria-describedby={tooltipId}>
                  <Info size={14} aria-hidden="true" />
                </button>
                <span className="whats-changed-tooltip" id={tooltipId} role="tooltip">{tooltip}<br />{t.changeImpactNote}</span>
              </li>;
            })}</ul> : <p className="whats-changed-empty">{available.length ? group.empty : t.periodHistoryUnavailable}</p>}
          </section>
        ))}
      </div>
    </section>
  );
}