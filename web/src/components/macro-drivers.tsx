import type { MacroScoreSummary } from "@/lib/indicators";
import { messages, type Locale } from "@/lib/i18n";

export function MacroDrivers({ summary, locale }: { summary: MacroScoreSummary; locale: Locale }) {
  const t = messages[locale].macro;
  if (summary.score === null) return <section className="macro-drivers" aria-labelledby="macro-drivers-title">
    <h3 id="macro-drivers-title">{t.topDrivers}</h3><p className="macro-drivers-note">{t.scoreDriversWithheld}</p>
  </section>;
  const format = new Intl.NumberFormat(locale === "tr" ? "tr-TR" : "en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "always",
  });
  return (
    <section className="macro-drivers" aria-labelledby="macro-drivers-title">
      <h3 id="macro-drivers-title">{t.topDrivers}</h3>
      <p className="macro-drivers-note">{t.driverContributionNote}</p>
      <div className="macro-driver-columns">
        {([
          { key: "positive", title: t.positiveContributors, empty: t.noPositiveContributors, drivers: summary.positiveDrivers },
          { key: "negative", title: t.negativeContributors, empty: t.noNegativeContributors, drivers: summary.negativeDrivers },
        ] as const).map((group) => (
          <section className={`macro-driver-list macro-driver-${group.key}`} key={group.key}>
            <h4>{group.title}</h4>
            {group.drivers.length ? <ol>{group.drivers.map((driver) => (
              <li key={driver.id}>
                <span>{driver.name}</span>
                <strong title={`${t.weightsLabel}: ${driver.weight}% · ${t.indicatorScore}: ${driver.score.toFixed(1)}/100`}>
                  {format.format(driver.contribution)} <small>{t.scorePoints}</small>
                </strong>
              </li>
            ))}</ol> : <p className="macro-driver-empty">{group.empty}</p>}
          </section>
        ))}
      </div>
    </section>
  );
}