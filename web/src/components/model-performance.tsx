import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import { messages } from "@/lib/i18n";
import type { ModelPerformanceHorizon } from "@/lib/model-performance-dashboard";

export function ModelPerformance({
  metrics,
  locale,
  id,
  action,
}: {
  metrics: ModelPerformanceHorizon[];
  locale: Locale;
  id: string;
  action?: ReactNode;
}) {
  const t = messages[locale].macro;
  const horizons = [7, 30, 90, 180] as const;
  const completeMetrics = horizons.map((horizon_days) => metrics.find((metric) =>
    metric.horizon_days === horizon_days) ?? {
    horizon_days,
    total_predictions: 0,
    correct_predictions: 0,
    accuracy_percentage: null,
    average_forward_return: null,
    average_return_after_bullish_signals: null,
    average_return_after_bearish_signals: null,
  });
  const number = new Intl.NumberFormat(locale === "tr" ? "tr-TR" : "en-US", {
    maximumFractionDigits: 1,
  });
  const percent = (value: number | null) => value === null ? "N/A" : `${value > 0 ? "+" : ""}${number.format(value)}%`;
  const accuracy = (value: number | null) => value === null ? "N/A" : `${number.format(value)}%`;

  return <section className="model-performance" aria-labelledby={`${id}-performance-title`}>
    <div className="model-performance-heading">
      <div className="model-performance-title-row">
        <h4 id={`${id}-performance-title`}>{t.performanceTitle}</h4>
        {action}
      </div>
      <p>{t.performanceNote}</p>
    </div>
    <div className="model-performance-grid">
      {completeMetrics.map((metric) => <article className="model-performance-horizon" key={metric.horizon_days}>
        <h5>{metric.horizon_days}D</h5>
        <div className="model-performance-accuracy">
          <span>{t.performanceAccuracy}</span>
          <strong>{accuracy(metric.accuracy_percentage)}</strong>
        </div>
        <dl>
          <div><dt>{t.performanceEvaluated}</dt><dd>{metric.total_predictions || "N/A"}</dd></div>
          <div><dt>{t.performanceCorrect}</dt><dd>{metric.total_predictions ? metric.correct_predictions : "N/A"}</dd></div>
          <div><dt>{t.performanceAverageReturn}</dt><dd>{percent(metric.average_forward_return)}</dd></div>
          <div><dt>{t.performanceBullishReturn}</dt><dd>{percent(metric.average_return_after_bullish_signals)}</dd></div>
          <div><dt>{t.performanceBearishReturn}</dt><dd>{percent(metric.average_return_after_bearish_signals)}</dd></div>
        </dl>
      </article>)}
    </div>
  </section>;
}
