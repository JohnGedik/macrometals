import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { IndicatorCardData } from "@/lib/indicators";
import { messages, type Locale } from "@/lib/i18n";
import { IndicatorChart } from "@/components/indicator-chart";
import { PriceRelationship } from "@/components/price-relationship";
import { IndicatorDataHealth } from "@/components/indicator-data-health";

const trendIcons = {
  up: ArrowUp,
  down: ArrowDown,
  flat: Minus,
  unavailable: Minus,
};

export function IndicatorStatus({
  impact,
  impactLabel,
  trend,
  trendLabel,
  subject,
  severity,
}: Pick<IndicatorCardData, "impact" | "impactLabel" | "trend" | "trendLabel" | "subject" | "severity">) {
  const TrendIcon = trendIcons[trend];
  return (
    <div className="gold-indicator-status">
      <span className={`indicator-trend trend-${trend}`} aria-label={trendLabel} title={trendLabel}>
        <TrendIcon size={15} aria-hidden="true" />
        <span>{trendLabel}</span>
      </span>
      <span className={`impact-label impact-label-${impact}`}>{impactLabel} {subject}</span>
      {severity && <span className="indicator-classification">{severity}</span>}
    </div>
  );
}

export function IndicatorInterpretation({ text }: { text: string }) {
  return <p className="indicator-explanation">{text}</p>;
}

export function IndicatorCard({ card, locale }: { card: IndicatorCardData; locale: Locale }) {
  const t = messages[locale].macro;
  return (
    <article className={`indicator-card trend-indicator-card impact-${card.impact}`}>
      <div className="indicator-card-top"><h3>{card.name}</h3></div>
      <span className="indicator-current-label">{card.scoreExclusion === "sample" ? t.sampleValueLabel : t.current}</span>
      <div className="indicator-value">{card.value}</div>
      {(card.previousValue || card.yoyChange || card.ninetyDayChange) && (
        <div className="indicator-period-values">
          {card.previousValue && <div><span>{t.previousValue}</span><strong>{card.previousValue}</strong></div>}
          {card.yoyChange && <div><span>{t.yearOverYear}</span><strong>{card.yoyChange}</strong></div>}
          {card.ninetyDayChange && <div><span>{t.ninetyDayChange}</span><strong>{card.ninetyDayChange}</strong></div>}
        </div>
      )}
      {card.comparison && <div className="indicator-comparison"><span>{card.comparison.label}</span><strong>{card.comparison.value}</strong></div>}
      <IndicatorStatus impact={card.impact} impactLabel={card.impactLabel} trend={card.trend} trendLabel={card.trendLabel} subject={card.subject} severity={card.severity} />
      {card.chart && <IndicatorChart name={card.name} points={card.chart.points} locale={locale} unit={card.chart.unit} digits={card.chart.digits} axisDigits={card.chart.axisDigits} lastYearLabel={t.lastYear} chartLabel={card.chart.label} zeroBaseline={card.chart.zeroBaseline} />}
      {card.score !== undefined && (
        <div className="stress-meter">
          <div className="stress-meter-labels"><span>0</span><strong>{card.severity}</strong><span>100</span></div>
          <div className="stress-track" role="progressbar" aria-label={card.name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={card.score}><span style={{ width: `${card.score}%` }} /></div>
        </div>
      )}
      <IndicatorInterpretation text={card.explanation} />
      {card.dataHealth && <IndicatorDataHealth health={card.dataHealth} locale={locale} exclusionReason={card.group !== "context" ? card.scoreExclusion : undefined} />}
      <PriceRelationship commodityName={card.commodityName} indicatorName={card.name} indicatorId={card.id} correlation={card.priceCorrelation} locale={locale} />
      {card.provenance && <p className="indicator-source">{card.provenance}</p>}
    </article>
  );
}