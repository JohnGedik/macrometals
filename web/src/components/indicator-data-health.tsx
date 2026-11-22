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
  const period = health.reportingPeriod;
  const periodLabel = period?.frequency === "monthly"
    ? new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${period.start}T00:00:00Z`))
    : period?.frequency === "annual" ? period.label : period ? `${period.start} / ${period.end}` : date;
  const provenance = health.provenance;
  const release = health.release;
  const archive = health.archive;
  const releaseStatuses = { matched: t.releaseMatched, behind: t.releaseBehind, mismatch: t.releaseMismatch, unknown: t.metadataUnknown };
  const archiveStatuses = { stored: t.archiveStored, disabled: t.archiveDisabled, failed: t.archiveFailed };
  const rightsStatuses = { "permission-confirmed": t.sourceUsePermissionConfirmed, "review-required": t.sourceUseReviewRequired,
    "public-domain-attribution": t.sourceUseAttribution, "provenance-unverified": t.sampleRightsUnverified };
  const measurements = { stock: t.measurementStock, flow: t.measurementFlow, rate: t.measurementRate, index: t.measurementIndex };
  return (
    <section className={`indicator-data-health health-${health.status}`} aria-label={t.dataHealthTitle}>
      <div className="indicator-health-heading"><h4>{t.dataHealthTitle}</h4><span className="indicator-health-status">{health.status === "fresh" && health.freshnessBasis === "official-release-and-reporting-lag" ? t.releaseMatched : statuses[health.status]}</span></div>
      <dl>
        <div><dt>{t.dataSourceLabel}</dt><dd>{health.url ? <a href={health.url} target="_blank" rel="noopener noreferrer">{source}</a> : source}</dd></div>
        <div><dt>{health.kind === "sample" && health.frequency === "annual" ? t.sampleYearLabel : period && period.frequency !== "daily" ? t.reportingPeriodLabel : t.observationDateLabel}</dt><dd>{period && period.frequency !== "daily" ? periodLabel : date}</dd></div>
        <div><dt>{t.frequencyLabel}</dt><dd>{frequencies[health.frequency]}</dd></div>
      </dl>
      {health.freshnessBasis === "official-release-and-reporting-lag" && <p className="indicator-health-note">{t.monthlyFreshnessNote.replace("{months}", String(health.maxLagMonths))}</p>}
      {provenance?.coverage && <p className="indicator-health-note">
        {locale === "tr"
          ? `Eşleşen ekonomiler: ${provenance.coverage.matchedCountries.length}; son ayda bildirenler: ${provenance.coverage.reportingCountries.length}. Küresel toplam değildir. Eşleşen ülke kodları: ${provenance.coverage.matchedCountries.join(", ")}. JODI erişim tarihi: ${formatDate(provenance.retrievedAt)}.`
          : `Matched economies: ${provenance.coverage.matchedCountries.length}; latest-month reporters: ${provenance.coverage.reportingCountries.length}. Not a global total. Matched economy codes: ${provenance.coverage.matchedCountries.join(", ")}. JODI accessed: ${formatDate(provenance.retrievedAt)}.`}
      </p>}
      {health.rights?.map((rights, index) => <p className="indicator-health-note" key={rights.termsUrl ?? rights.status + index}>
        {rightsStatuses[rights.status]} {rights.termsUrl && <a href={rights.termsUrl} target="_blank" rel="noopener noreferrer">{t.sourceRightsTerms}</a>}
      </p>)}
      {provenance && <details className="indicator-health-dependencies indicator-source-metadata">
        <summary>{t.sourceMetadataLabel}</summary>
        <dl>
          <div><dt>{t.seriesIdLabel}</dt><dd>{provenance.seriesId}</dd></div>
          <div><dt>{t.geographyLabel}</dt><dd>{provenance.geography === "United States" ? t.usGeography : provenance.geography}</dd></div>
          <div><dt>{t.periodRangeLabel}</dt><dd>{period ? `${period.start} / ${period.end}` : t.metadataUnknown}</dd></div>
          <div><dt>{t.unitsLabel}</dt><dd>{provenance.rawUnit} → {provenance.normalizedUnit} (×{provenance.multiplier})</dd></div>
          <div><dt>{t.rawValueLabel}</dt><dd>{new Intl.NumberFormat(locale === "tr" ? "tr-TR" : "en-US", { maximumFractionDigits: 10 }).format(provenance.rawValue)} {provenance.rawUnit}</dd></div>
          <div><dt>{t.measurementLabel}</dt><dd>{measurements[provenance.measurement]} · {provenance.aggregation === "year-end" ? t.yearEndLabel : provenance.aggregation === "month-end" ? t.monthEndLabel : provenance.aggregation === "annual-average" ? t.annualAverageLabel : provenance.aggregation === "weekly-report" ? t.weeklyReportLabel : provenance.aggregation === "annual-total" ? t.annualTotalLabel : provenance.aggregation === "monthly-index" ? t.monthlyIndexLabel : provenance.aggregation === "monthly-average" ? t.monthlyAverageLabel : t.dailyObservationLabel} · {provenance.seasonalAdjustment}</dd></div>
          <div><dt>{t.retrievedLabel}</dt><dd>{formatDate(provenance.retrievedAt)}</dd></div>
          <div><dt>{t.publishedLabel}</dt><dd>{provenance.publishedAt === null ? t.metadataUnknown : formatDate(provenance.publishedAt)}</dd></div>
          <div><dt>{t.vintageLabel}</dt><dd>{provenance.vintage ?? t.metadataUnknown}</dd></div>
          <div><dt>{t.revisionLabel}</dt><dd>{provenance.revisionStatus === "unknown" ? t.metadataUnknown : provenance.revisionStatus}</dd></div>
          {release && <>
            <div><dt>{t.releaseCheckLabel}</dt><dd><a href={release.sourceUrl} target="_blank" rel="noopener noreferrer">{releaseStatuses[release.status]}</a></dd></div>
            <div><dt>{t.providerReleaseDateLabel}</dt><dd>{release.releaseDate ?? t.metadataUnknown}</dd></div>
            <div><dt>{t.releasedPeriodLabel}</dt><dd>{release.referencePeriod ?? t.metadataUnknown}</dd></div>
            <div><dt>{t.releaseCheckedLabel}</dt><dd>{formatDate(release.checkedAt)}</dd></div>
          </>}
          {archive && <>
            <div><dt>{t.archiveLabel}</dt><dd>{archiveStatuses[archive.status]}</dd></div>
            {archive.status === "stored" && <>
              <div><dt>{t.firstCaptureLabel}</dt><dd>{formatDate(archive.firstCapturedAt ?? null)}</dd></div>
              <div><dt>{t.archivedCaptureLabel}</dt><dd>{formatDate(archive.capturedAt ?? null)}</dd></div>
              <div><dt>SHA-256</dt><dd title={archive.checksum}>{archive.checksum?.slice(0, 16)}</dd></div>
              {archive.changes && <div><dt>{t.localChangesLabel}</dt><dd>{t.localChangesValue.replace("{added}", String(archive.changes.added)).replace("{revised}", String(archive.changes.revised)).replace("{removed}", String(archive.changes.removed))}</dd></div>}
            </>}
          </>}
        </dl>
        {release && <p>{t.releaseEvidenceLimit}</p>}
        {archive && <p>{t.archiveEvidenceLimit}</p>}
        <p>{provenance.provider === "U.S. Energy Information Administration" ? t.eiaMetadataLimit : provenance.aggregation === "annual-total" || provenance.aggregation === "year-end" ? t.annualSurveyMetadataLimit : t.csvMetadataLimit}</p>
      </details>}
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