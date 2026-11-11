import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { IndicatorCardData } from "@/lib/indicators";
import { messages, type Locale } from "@/lib/i18n";
import { IndicatorCard } from "@/components/indicator-card";

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
  metal: "gold" | "silver" | "copper" | "oil";
  locale: Locale;
}) {
  const t = messages[locale].macro;

  return (
    <section className={`macro-indicators${metal === "gold" ? " macro-gold" : ""}`} aria-labelledby="macro-indicators-title">
      <div className="macro-heading">
        <div>
          <p className="eyebrow">{locale === "tr" ? "Piyasa göstergeleri" : "Cross-asset dashboard"}</p>
          <h2 id="macro-indicators-title">{metal === "gold" ? t.goldDashboardTitle : t.title}</h2>
        </div>
        <span className="macro-refresh">{metal === "oil" ? (locale === "tr" ? "Piyasa verisi 15 dakika, EIA verisi 6 saat önbelleklenir." : "Market data is cached for 15 minutes; EIA data for 6 hours.") : t.refresh}</span>
      </div>
      <div className="indicator-grid">
        {metal === "gold" ? cards.map((card) => <IndicatorCard key={card.id} card={card} locale={locale} />) : cards.map((card) => {
          const TrendIcon = trendIcons[card.trend];
          return (
            <article className={`indicator-card indicator-${card.id} impact-${card.impact}`} key={card.id}>
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
              {card.provenance && <p className="indicator-source">{card.provenance}</p>}
            </article>
          );
        })}
      </div>
      <p className="indicator-source">{source}</p>
      <details className="macro-methodology">
        <summary>{t.methodologyTitle}</summary>
        <div className="macro-methodology-content">
          <section>
            <h3>{metal === "oil" ? (locale === "tr" ? "Petrol göstergeleri nasıl okunmalı?" : "How to read Oil indicators") : metal === "gold" ? t.goldMethodTitle : metal === "silver" ? t.silverMethodTitle : t.copperMethodTitle}</h3>
            <p>{metal === "oil" ? (locale === "tr" ? "Vadeli fiyat momentumu, stok değişimi, dolar ve altın/petrol oranı piyasa koşullarına dair bağlam sağlar; tahmin değildir." : "Futures momentum, inventory changes, the dollar and the gold/oil ratio provide market context, not forecasts.") : metal === "gold" ? t.goldMethodology : metal === "silver" ? t.silverMethodology : t.copperMethodology}</p>
          </section>
          <section>
            <h3>{t.formulasTitle}</h3>
            {metal === "oil" ? <p>{locale === "tr" ? "90 günlük değişim, son günlük kapanışı en az 90 gün önceki kapanışla karşılaştırır. Stok değişimi, SPR hariç haftalık ABD ham petrol stoklarının farkıdır; beş yıllık mevsimsel ortalama önceki beş yılın aynı tarihe en yakın haftalık değişimlerini kullanır. Altın/petrol oranı eşleşen günlük kapanışların beş yıllık aritmetik ortalamasıyla karşılaştırılır. Pozitif yakın vade eksi sonraki vade farkı backwardation, negatif fark contango gösterir." : "The 90-day change compares the latest daily close with the closest close at least 90 days earlier. Inventory change is the weekly difference in U.S. crude stocks excluding SPR; its five-year seasonal average uses the nearest weekly change to the same date in each of the previous five years. Gold/oil is compared with the five-year arithmetic mean of matched daily closes. A positive near-minus-later contract spread indicates backwardation; a negative spread indicates contango."}</p> : <><p>{metal === "copper" ? t.copperRatioFormula : t.ratioFormula}</p><p>{metal === "copper" ? t.copperTrendFormula : t.trendFormula}</p>{metal !== "copper" && <p>{t.stressFormula}</p>}</>}
          </section>
          <section>
            <h3>{t.sourcesTitle}</h3>
            <p>{metal === "oil" ? (locale === "tr" ? "Yahoo Finance: CL=F ve BZ=F (WTI ve Brent vadeli işlemleri), GC=F (altın vadeli işlemleri), DX-Y.NYB (DXY). EIA WCESTUS1: SPR hariç ABD ham petrol stokları. EIA API anahtarı gerekir. EIA'nın vadeli kontrat serisi 2024'te sonlandığından fark için güncel kaynak henüz yok." : "Yahoo Finance: CL=F and BZ=F (WTI and Brent futures), GC=F (gold futures), DX-Y.NYB (DXY). EIA WCESTUS1: U.S. crude stocks excluding SPR. An EIA API key is required. EIA's futures contract series ended in 2024, so a current spread source is not yet available.") : metal === "copper" ? t.copperDataSources : t.dataSources}</p>
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