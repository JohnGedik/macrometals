import type { IndicatorDataHealth as DataHealth } from "@/lib/commodity-score";
import { messages, type Locale } from "@/lib/i18n";

export function IndicatorDataHealth({ health, locale, exclusionReason }: { health: DataHealth; locale: Locale; exclusionReason?: "sample" | "unapproved" | "unavailable" | null }) {
  const t = messages[locale].macro;
  const statuses = { fresh: t.healthFresh, stale: t.healthStale, unavailable: t.unavailable, sample: t.healthSample };
  const frequencies = { annual: t.frequencyAnnual, daily: t.frequencyDaily, weekly: t.frequencyWeekly, monthly: t.frequencyMonthly, derived: t.frequencyDerived, unknown: t.unavailable };
  const formatDate = (time: number | null) => time === null ? t.unavailable : new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(time * 1000));
  const date = health.observedAt === null ? t.unavailable : new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
    year: "numeric", ...(health.frequency === "annual" ? {} : { month: "short" as const, day: "numeric" as const }), timeZone: "UTC",
  }).format(new Date(health.observedAt * 1000));
  const source = health.kind === "sample" ? t.sampleDataSource : health.source === "unconfigured" ? t.unconfiguredSource : health.source;
  return (
    <section className={`indicator-data-health health-${health.status}`} aria-label={t.dataHealthTitle}>
      <div className="indicator-health-heading"><h4>{t.dataHealthTitle}</h4><span className="indicator-health-status">{statuses[health.status]}</span></div>
      <dl>
        <div><dt>{t.dataSourceLabel}</dt><dd>{health.url ? <a href={health.url} target="_blank" rel="noopener noreferrer">{source}</a> : source}</dd></div>
        <div><dt>{health.kind === "sample" && health.frequency === "annual" ? t.sampleYearLabel : t.observationDateLabel}</dt><dd>{date}</dd></div>
        <div><dt>{t.frequencyLabel}</dt><dd>{frequencies[health.frequency]}</dd></div>
      </dl>
      {health.dependencies && <details className="indicator-health-dependencies">
        <summary>{t.requiredInputsLabel}</summary>
        <p>{t.derivedHealthNote}</p>
        <ul>{health.dependencies.map((input) => <li key={input.id}>
          <strong>{input.id === "matched-history" ? t.alignedHistoryLabel : input.source}</strong>
          <span>{formatDate(input.observedAt)} · {statuses[input.status]}</span>
        </li>)}</ul>
      </details>}
      {exclusionReason && <p className="indicator-health-note">{exclusionReason === "sample" ? t.sampleExcludedScoreNote : exclusionReason === "unapproved" ? t.unapprovedScoreNote : t.excludedScoreNote}</p>}
    </section>
  );
}