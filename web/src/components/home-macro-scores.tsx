import Link from "next/link";
import { unstable_cache } from "next/cache";
import { ArrowUpRight } from "lucide-react";
import { getCommodityConfiguration } from "@/lib/commodity-config";
import { loadCommodityIndicators } from "@/lib/indicators";
import { messages, type Locale } from "@/lib/i18n";

const commodities = ["gold", "silver", "copper", "oil"] as const;

const getCachedMacroScores = unstable_cache(
  async (locale: Locale) => {
    const scores = await Promise.all(commodities.map(async (commodity) => {
      const config = getCommodityConfiguration(commodity);
      if (!config) throw new Error(`Missing commodity configuration: ${commodity}`);
      const result = await loadCommodityIndicators(config, locale).model;
      return { commodity, summary: result.summary };
    }));
    return { scores, calculatedAt: Date.now() };
  },
  ["home-macro-scores-v1"],
  { revalidate: 21600 },
);

export async function HomeMacroScores({ locale }: { locale: Locale }) {
  const cached = await getCachedMacroScores(locale);
  const scores = cached.scores.map(({ commodity, summary }) => {
    const config = getCommodityConfiguration(commodity);
    if (!config) throw new Error(`Missing commodity configuration: ${commodity}`);
    return { commodity, config, summary };
  });
  const t = messages[locale].home;
  const updatedAt = new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC",
  }).format(cached.calculatedAt);

  return (
    <section className="home-macro-scores content-width" aria-labelledby="home-macro-scores-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t.macroSnapshot}</p>
          <h2 id="home-macro-scores-title">{t.macroScores}</h2>
        </div>
        <p className="home-macro-scores-note">
          {t.macroScoresNote} · {t.scoresUpdated.replace("{time}", updatedAt)}
        </p>
      </div>
      <div className="home-macro-score-grid">
        {scores.map(({ commodity, config, summary }) => (
          <Link className={`home-macro-score-card impact-${summary.status}`} href={`/tag/${commodity}`} key={commodity}>
            <div className="home-macro-score-heading">
              <h3>{config.name[locale]}</h3>
              <ArrowUpRight size={17} aria-hidden="true" />
            </div>
            <div className="home-macro-score-value">
              <strong>{summary.score ?? "—"}</strong>
              {summary.score !== null && <span>/100</span>}
            </div>
            <div className="home-macro-score-status">
              <span>{summary.statusLabel}</span>
              <span>{summary.classification}</span>
            </div>
            <div className="stress-track home-macro-score-track" aria-hidden="true">
              <span style={{ width: `${summary.score ?? 0}%` }} />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
