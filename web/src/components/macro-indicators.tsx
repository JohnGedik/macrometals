import type { MacroScoreSummary, IndicatorCardData } from "@/lib/indicators";
import { messages, type Locale } from "@/lib/i18n";
import { IndicatorCard } from "@/components/indicator-card";
import { MacroDrivers } from "@/components/macro-drivers";
import type { CommodityConfiguration } from "@/lib/commodity-score";
import { commodityChangesInput } from "@/lib/commodity-changes";
import { WhatsChangedCard } from "@/components/whats-changed-card";
import { MacroSummaryCard } from "@/components/macro-summary-card";
import { DriverInsightsTabs } from "@/components/driver-insights-tabs";
import { Info } from "lucide-react";
import Link from "next/link";
import type { DashboardModel } from "@/lib/metal-model-default";
import { metalModelCopy } from "@/lib/metal-model-copy";
import { Suspense, type ReactNode } from "react";
import { PersonalModelScore } from "@/components/personal-model-score";

type MacroProps = {
  cards: IndicatorCardData[];
  config: CommodityConfiguration;
  locale: Locale;
  macroScore: MacroScoreSummary;
};

async function PersonalModel({ model, cards, config, locale }: Omit<MacroProps, "macroScore"> & { model: Promise<DashboardModel> }) {
  const dashboardModel = await model;
  const copy = metalModelCopy[locale];
  if (dashboardModel.status !== "ready") {
    return <>
      <h3 id={`${config.commodity}-personal-model-title`}>{copy.personalModel}</h3>
      <p>{dashboardModel.status === "signed-out" ? copy.dashboardSignIn
        : dashboardModel.status === "no-default" ? copy.dashboardNoDefault : copy.unavailableStorage}</p>
    </>;
  }
  const factors = config.indicators.map(({ id }) => ({
    id, score: cards.find((card) => card.id === id)?.factorScore ?? null,
  }));
  return <PersonalModelScore commodity={config.commodity} locale={locale} rules={config.scoreRules}
    factors={factors} models={dashboardModel.models} defaultId={dashboardModel.defaultId} />;
}

export function MacroScorePanel({ cards, config, locale, macroScore, dashboardModel }: MacroProps & { dashboardModel: Promise<DashboardModel> | null }) {
  const t = messages[locale].macro;
  const modelCopy = metalModelCopy[locale];
  const scoreTitle = config.scoreTitle[locale];
  return <>
        {macroScore.score === null && <p className="datafeed-approval-notice" role="status">{t.dataFeedApprovalNotice}</p>}
        <section className={`gold-macro-score impact-${macroScore.status}`} aria-labelledby="macro-score-title">
          <p className="eyebrow macro-score-configured-note">{macroScore.note}</p>
          <div className={dashboardModel ? "macro-model-comparison" : undefined}>
            <div className="macro-model-system">
              <div className="gold-macro-score-heading">
                <div>{dashboardModel && <p className="eyebrow">{modelCopy.systemModel}</p>}<h3 id="macro-score-title">{scoreTitle}</h3></div>
                <div className="gold-macro-score-total"><strong className={macroScore.score === null ? "macro-score-withheld" : undefined}>{macroScore.score === null ? t.scoreWithheld : macroScore.score}</strong>{macroScore.score !== null && <><span>/100</span><span className={`impact-label impact-label-${macroScore.status}`}>{macroScore.statusLabel}</span><span className="indicator-classification">{macroScore.classification}</span></>}</div>
              </div>
              {macroScore.score !== null && <div className="stress-track gold-macro-score-track" role="progressbar" aria-label={scoreTitle} aria-valuemin={0} aria-valuemax={100} aria-valuenow={macroScore.score}><span style={{ width: `${macroScore.score}%` }} /></div>}
              <p className="gold-macro-weights">{macroScore.weights}</p>
              <div className="macro-score-coverage">
                <span>{t.scoreCoverageLabel}: {macroScore.coverage.toFixed(0)}% · {t.approvedSourcedWeightLabel}: {macroScore.dataMix.sourcedWeight.toFixed(0)}% · {t.excludedWeightLabel}: {macroScore.dataMix.excludedWeight.toFixed(0)}%</span>
                <button type="button" className="macro-coverage-info" aria-label={t.coverageDetails} aria-describedby={`${config.commodity}-coverage-tooltip`}><Info size={14} aria-hidden="true" /></button>
                <span className="macro-coverage-tooltip" role="tooltip" id={`${config.commodity}-coverage-tooltip`}>{t.coverageExplanation}</span>
              </div>
              {macroScore.release.mode === "sourced-only" && <div className="macro-score-policy">
                <p>{t.scoreApprovalCount.replace("{count}", String(macroScore.release.approvedCount)).replace("{total}", String(config.indicators.length))} · {t.referenceSamplesExcluded.replace("{weight}", macroScore.release.referenceSampleWeight.toFixed(0))}</p>
                {macroScore.score === null && <>
                  <p>{t.scoreWithheldReason.replace("{minimum}", String(macroScore.release.minimumCoverage))}</p>
                  {macroScore.release.missingRequired.length > 0 && <p>{t.missingCriticalFactors}: {macroScore.release.missingRequired.join(" · ")}</p>}
                </>}
              </div>}
            </div>
            {dashboardModel && <section className="macro-model-personal" aria-labelledby={`${config.commodity}-personal-model-title`}>
              <Suspense fallback={<>
                <h3 id={`${config.commodity}-personal-model-title`}>{modelCopy.personalModel}</h3>
                <p role="status">{t.loadingPersonalModel}</p>
              </>}>
                <PersonalModel model={dashboardModel} cards={cards} config={config} locale={locale} />
              </Suspense>
              <Link href={`/models/${config.commodity}`} prefetch={false}>{modelCopy.edit}</Link>
            </section>}
          </div>
          <p className="gold-macro-disclosure">{macroScore.disclosure}</p>
        </section>
  </>;
}

export function IndicatorGroup({ title, cards, locale }: { title: string; cards: IndicatorCardData[]; locale: Locale }) {
  if (!cards.length) return null;
  return <section className="gold-indicator-group"><h3>{title}</h3><div className="indicator-grid">{cards.map((card) =>
    <IndicatorCard key={card.id} card={card} locale={locale} />)}</div></section>;
}

export function MacroIndicators({ cards, config, locale, macroScore, context }: MacroProps & { context: ReactNode }) {
  const t = messages[locale].macro;
  const methodology = config.methodology[locale];
  return <>
      {macroScore && macroScore.score !== null && <MacroSummaryCard input={{
        commodity: config.commodity,
        commodityName: config.name[locale],
        score: macroScore.score,
        indicatorScores: config.indicators.map((indicator) => {
          const card = cards.find((candidate) => candidate.id === indicator.id)!;
          return { id: indicator.id, name: indicator.name[locale], score: card.factorScore ?? NaN, trend: card.trend };
        }),
        indicatorWeights: config.weights,
        topPositiveDrivers: macroScore.positiveDrivers,
        topNegativeDrivers: macroScore.negativeDrivers,
        tone: config.summaryTone?.[locale],
        rules: config.scoreRules,
      }} locale={locale} isSample={macroScore.dataMix.sampleWeight > 0} dataNote={macroScore.release.mode === "sourced-only" ? t.sourcedOnlySummaryNote : config.scoreSources ? t.mixedSummaryNote : undefined} />}
      {macroScore && macroScore.score === null && <section className="macro-summary-card macro-summary-withheld" aria-labelledby={`${config.commodity}-macro-summary-title`}>
        <h3 id={`${config.commodity}-macro-summary-title`}>{t.macroSummary}</h3><p className="macro-summary-text">{t.summaryWithheld}</p>
      </section>}
      {macroScore && <DriverInsightsTabs commodity={config.commodity} locale={locale}
        scoreDrivers={<MacroDrivers summary={macroScore} locale={locale} />}
        recentChanges={<WhatsChangedCard {...commodityChangesInput(config)} locale={locale} />} />}
      <IndicatorGroup title={t.goldTierOne} cards={cards.filter((card) => card.group === "tier1")} locale={locale} />
      <IndicatorGroup title={t.goldTierTwo} cards={cards.filter((card) => card.group === "tier2")} locale={locale} />
      {context}
      <p className="macro-refresh">{config.refresh[locale]}</p>
      <details className="macro-methodology">
        <summary>{t.methodologyTitle}</summary>
        <div className="macro-methodology-content">
          <section>
            <h3>{methodology.title}</h3>
            <p>{methodology.description}</p>
          </section>
          <section>
            <h3>{t.formulasTitle}</h3>
            <p>{t.macroScoreFormula.replace("{baseline}", String(config.scoreRules.baseline)).replace("{sensitivity}", String(config.scoreRules.sensitivity))}</p>
            {methodology.formulas.map((formula) => <p key={formula}>{formula}</p>)}
          </section>
          <section>
            <h3>{t.sourcesTitle}</h3>
            <p>{methodology.sources}</p>
          </section>
          <section>
            <h3>{t.disclaimerTitle}</h3>
            <p>{t.disclaimer}</p>
          </section>
        </div>
      </details>
  </>;
}