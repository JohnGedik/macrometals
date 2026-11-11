import { Info } from "lucide-react";
import { messages, type Locale } from "@/lib/i18n";
import { countActiveIndicators, generateMacroSummary, type MacroSummaryInput, type MacroSummaryResult } from "@/lib/macro-summary";

export function MacroSummaryCard({ input, locale, isSample = false, result }: {
  input: MacroSummaryInput;
  locale: Locale;
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
  const activeCount = countActiveIndicators(input);

  return (
    <section className={`macro-summary-card outlook-${data.outlook}`} aria-labelledby={`${input.commodity}-macro-summary-title`}>
      <h3 id={`${input.commodity}-macro-summary-title`}>{t.macroSummary}</h3>
      <p className="macro-summary-subtitle" title={t.macroSummaryAutomationNote}>{t.macroSummarySubtitle}</p>
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
      <p className="macro-summary-basis">{t.summaryActiveIndicators.replace("{count}", String(activeCount))}</p>
      <p className="macro-summary-text">{data.summary}</p>
      {isSample && <p className="macro-summary-footer">{t.summarySampleNote}</p>}
    </section>
  );
}