import { Info, Star } from "lucide-react";
import { messages, type Locale } from "@/lib/i18n";
import { classifyPriceRelationship } from "@/lib/price-relationship";

export function PriceRelationship({ commodityName, indicatorName, indicatorId, correlation, locale }: {
  commodityName?: string;
  indicatorName: string;
  indicatorId: string;
  correlation?: number;
  locale: Locale;
}) {
  const t = messages[locale].macro;
  const data = classifyPriceRelationship(correlation);
  const strengths = {
    "strong-positive": t.relationshipStrongPositive,
    "moderate-positive": t.relationshipModeratePositive,
    weak: t.relationshipWeak,
    "moderate-negative": t.relationshipModerateNegative,
    "strong-negative": t.relationshipStrongNegative,
    unavailable: t.unavailable,
  };
  const impacts = { "very-high": t.relationshipVeryHigh, high: t.relationshipHigh, medium: t.relationshipMedium, low: t.relationshipLow, minimal: t.relationshipMinimal, unavailable: t.unavailable };
  const format = new Intl.NumberFormat(locale === "tr" ? "tr-TR" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "always" });
  const coefficient = data.correlation === null ? t.unavailable : format.format(data.correlation);
  const tooltipId = `${indicatorId}-price-relationship-tooltip`;
  const tooltip = data.correlation === null ? t.relationshipUnavailableNote
    : (data.correlation >= 0.3 ? t.relationshipPositiveTooltip : data.correlation <= -0.3 ? t.relationshipNegativeTooltip : t.relationshipWeakTooltip)
      .replace("{commodity}", commodityName ?? "").replace("{indicator}", indicatorName);

  return (
    <section className={`price-relationship relationship-${data.strength}`}>
      <h4>{commodityName ? t.relationshipTitle.replace("{commodity}", commodityName) : t.priceRelationship}</h4>
      <p className="price-relationship-strength"><span className="price-relationship-dot" aria-hidden="true" />{strengths[data.strength]}</p>
      <div className="price-relationship-correlation">
        <span>{t.relationshipCorrelation}: <strong>{coefficient}</strong></span>
        <div className="price-relationship-info">
          <button type="button" aria-label={`${indicatorName}: ${t.relationshipDetails}`} aria-describedby={tooltipId}><Info size={14} aria-hidden="true" /></button>
          <span className="price-relationship-tooltip" id={tooltipId} role="tooltip">{tooltip} {data.correlation !== null && t.relationshipCaveat}</span>
        </div>
      </div>
      <div className="price-relationship-impact">
        <span>{t.relationshipImpact}:</span>
        {data.stars > 0 && <span className="price-relationship-stars" role="img" aria-label={t.relationshipStars.replace("{count}", String(data.stars))}>
          {Array.from({ length: 5 }, (_, index) => <Star key={index} size={12} fill={index < data.stars ? "currentColor" : "none"} className={index < data.stars ? "" : "relationship-star-empty"} aria-hidden="true" />)}
        </span>}
        <strong>{impacts[data.impact]}</strong>
      </div>
      <p className="price-relationship-note">{data.correlation === null ? t.relationshipUnavailableNote : t.relationshipSuppliedNote}</p>
    </section>
  );
}