import { Info } from "lucide-react";
import { messages, type Locale } from "@/lib/i18n";
import { generateMacroSummary, type MacroSummaryInput, type MacroSummaryResult } from "@/lib/macro-summary";

export function MacroSummaryCard({ input, locale, updatedAt, isSample = false, result }: {
  input: MacroSummaryInput;
  locale: Locale;
  updatedAt: string;
  isSample?: boolean;
  result?: MacroSummaryResult;
}) {
  const t = messages[locale].macro;
  const data = result ?? generateMacroSummary(input, locale);
  const outlookLabels = {
    "strongly-bullish": t.stronglyBullishOutlook,
    bullish: t.bullishOutlook,
    neutral: t.neutralOutlook,
    bearish: t.bearishOutlook,
    "strongly-bearish": t.stronglyBearishOutlook,
  };
  const confidenceLabels = { high: t.confidenceHigh, medium: t.confidenceMedium, low: t.confidenceLow };
  const tooltipId = `${input.commodity}-confidence-tooltip`;
  const updatedLabel = /^\d{4}$/.test(updatedAt) ? updatedAt
    : Number.isFinite(Date.parse(updatedAt)) ? new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(updatedAt)) : updatedAt;

  return (
    <section className={`macro-summary-card outlook-${data.outlook}`} aria-labelledby={`${input.commodity}-macro-summary-title`}>
      <h3 id={`${input.commodity}-macro-summary-title`}>{t.macroSummary}</h3>
      <div className="macro-summary-status">
        <p className="macro-summary-outlook">{outlookLabels[data.outlook]}</p>
        <div className="macro-summary-confidence">
          <button type="button" className={`macro-confidence-badge confidence-${data.confidence}`} aria-describedby={tooltipId}>
            <span className="macro-confidence-dot" aria-hidden="true" />
            <span>{t.confidenceLabel}: {confidenceLabels[data.confidence]}</span>
            <Info size={13} aria-hidden="true" />
          </button>
          <span className="macro-confidence-tooltip" id={tooltipId} role="tooltip">{t.confidenceTooltip}</span>
        </div>
      </div>
      <p className="macro-summary-text">{data.summary}</p>
      <div className="macro-summary-footer">
        <span>{t.lastUpdated}: <time dateTime={updatedAt}>{updatedLabel}</time></span>
        {isSample && <span>{t.summarySampleNote}</span>}
      </div>
    </section>
  );
}