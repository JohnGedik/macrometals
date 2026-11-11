import type { MacroScoreSummary, IndicatorCardData } from "@/lib/indicators";
import { messages, type Locale } from "@/lib/i18n";
import { IndicatorCard } from "@/components/indicator-card";
import { MacroDrivers } from "@/components/macro-drivers";
import type { CommodityConfiguration } from "@/lib/commodity-score";
import { commodityChangesInput } from "@/lib/commodity-changes";
import { WhatsChangedCard } from "@/components/whats-changed-card";
import { MacroSummaryCard } from "@/components/macro-summary-card";

export function MacroIndicators({
  cards,
  source,
  config,
  locale,
  macroScore,
}: {
  cards: IndicatorCardData[];
  source: string;
  config: CommodityConfiguration;
  locale: Locale;
  macroScore?: MacroScoreSummary;
}) {
  const t = messages[locale].macro;
  const scoreTitle = config.scoreTitle[locale];
  const methodology = config.methodology[locale];

  return (
    <section className={`macro-indicators${macroScore ? " macro-gold" : ""}`} aria-labelledby="macro-indicators-title">
      {macroScore && (
        <section className={`gold-macro-score impact-${macroScore.status}`} aria-labelledby="macro-score-title">
          <div className="gold-macro-score-heading">
            <div><p className="eyebrow">{macroScore.note}</p><h3 id="macro-score-title">{scoreTitle}</h3></div>
            <div className="gold-macro-score-total"><strong>{macroScore.score}</strong><span>/100</span><span className={`impact-label impact-label-${macroScore.status}`}>{macroScore.statusLabel}</span><span className="indicator-classification">{macroScore.classification}</span></div>
          </div>
          <div className="stress-track gold-macro-score-track" role="progressbar" aria-label={scoreTitle} aria-valuemin={0} aria-valuemax={100} aria-valuenow={macroScore.score}><span style={{ width: `${macroScore.score}%` }} /></div>
          <p className="gold-macro-weights">{macroScore.weights}</p>
          <p className="gold-macro-disclosure">{macroScore.disclosure}</p>
        </section>
      )}
      {macroScore && <MacroSummaryCard input={{
        commodity: config.commodity,
        commodityName: config.name[locale],
        score: macroScore.score,
        indicatorScores: config.indicators.map((indicator) => {
          const card = cards.find((candidate) => candidate.id === indicator.id)!;
          return { id: indicator.id, name: indicator.name[locale], score: card.factorScore!, trend: card.trend };
        }),
        indicatorWeights: config.weights,
        topPositiveDrivers: macroScore.positiveDrivers,
        topNegativeDrivers: macroScore.negativeDrivers,
        tone: config.summaryTone?.[locale],
        rules: config.scoreRules,
      }} locale={locale} updatedAt={String(config.years.at(-1))} isSample />}
      {macroScore && <WhatsChangedCard {...commodityChangesInput(config)} locale={locale} />}
      {macroScore && <MacroDrivers summary={macroScore} locale={locale} />}
      {macroScore ? (
        (["tier1", "tier2", "context"] as const).map((group) => {
          const groupedCards = cards.filter((card) => card.group === group);
          if (!groupedCards.length) return null;
          const title = group === "tier1" ? t.goldTierOne : group === "tier2" ? t.goldTierTwo : t.goldCrossMarketContext;
          return <section className="gold-indicator-group" key={group}><h3>{title}</h3><div className="indicator-grid">{groupedCards.map((card) => <IndicatorCard key={card.id} card={card} locale={locale} />)}</div></section>;
        })
      ) : (
        <div className="indicator-grid">{cards.map((card) => <IndicatorCard key={card.id} card={card} locale={locale} />)}</div>
      )}
      <p className="indicator-source">{source}</p>
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
    </section>
  );
}