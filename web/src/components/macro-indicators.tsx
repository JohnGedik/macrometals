import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { IndicatorCardData } from "@/lib/indicators";
import { messages, type Locale } from "@/lib/i18n";

const trendIcons = {
  up: ArrowUp,
  down: ArrowDown,
  flat: Minus,
  unavailable: Minus,
};

export function MacroIndicators({
  cards,
  source,
  metal,
  locale,
}: {
  cards: IndicatorCardData[];
  source: string;
  metal: "gold" | "silver" | "copper";
  locale: Locale;
}) {
  const t = messages[locale].macro;

  return (
    <section className="macro-indicators" aria-labelledby="macro-indicators-title">
      <div className="macro-heading">
        <div>
          <p className="eyebrow">{locale === "tr" ? "Piyasa göstergeleri" : "Cross-asset dashboard"}</p>
          <h2 id="macro-indicators-title">{t.title}</h2>
        </div>
        <span className="macro-refresh">{t.refresh}</span>
      </div>
      <div className="indicator-grid">
        {cards.map((card) => {
          const TrendIcon = trendIcons[card.trend];
          return (
            <article className={`indicator-card impact-${card.impact}`} key={card.id}>
              <div className="indicator-card-top">
                <h3>{card.name}</h3>
                <span className={`indicator-trend trend-${card.trend}`} aria-label={card.trendLabel} title={card.trendLabel}>
                  <TrendIcon size={16} aria-hidden="true" />
                </span>
              </div>
              <span className="indicator-current-label">{t.current}</span>
              <div className="indicator-value">{card.value}</div>
              {card.comparison && (
                <div className="indicator-comparison">
                  <span>{card.comparison.label}</span>
                  <strong>{card.comparison.value}</strong>
                </div>
              )}
              {card.score !== undefined && (
                <div className="stress-meter">
                  <div className="stress-meter-labels"><span>0</span><strong>{card.severity}</strong><span>100</span></div>
                  <div className="stress-track" role="progressbar" aria-label={card.name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={card.score}>
                    <span style={{ width: `${card.score}%` }} />
                  </div>
                </div>
              )}
              <div className="indicator-impact-row">
                <span className={`impact-label impact-label-${card.impact}`}>{card.impactLabel}</span>
                <span className="impact-subject">{card.subject}</span>
              </div>
              <p className="indicator-explanation">{card.explanation}</p>
            </article>
          );
        })}
      </div>
      <p className="indicator-source">{source}</p>
      <details className="macro-methodology">
        <summary>{t.methodologyTitle}</summary>
        <div className="macro-methodology-content">
          <section>
            <h3>{metal === "gold" ? t.goldMethodTitle : metal === "silver" ? t.silverMethodTitle : t.copperMethodTitle}</h3>
            <p>{metal === "gold" ? t.goldMethodology : metal === "silver" ? t.silverMethodology : t.copperMethodology}</p>
          </section>
          <section>
            <h3>{t.formulasTitle}</h3>
            <p>{metal === "copper" ? t.copperRatioFormula : t.ratioFormula}</p>
            <p>{metal === "copper" ? t.copperTrendFormula : t.trendFormula}</p>
            {metal !== "copper" && <p>{t.stressFormula}</p>}
          </section>
          <section>
            <h3>{t.sourcesTitle}</h3>
            <p>{metal === "copper" ? t.copperDataSources : t.dataSources}</p>
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