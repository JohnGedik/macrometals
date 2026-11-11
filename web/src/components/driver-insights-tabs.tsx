"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { messages, type Locale } from "@/lib/i18n";
import { useDashboardPreference } from "@/lib/dashboard-preferences";

export function DriverInsightsTabs({ commodity, locale, scoreDrivers, recentChanges }: {
  commodity: string;
  locale: Locale;
  scoreDrivers: ReactNode;
  recentChanges: ReactNode;
}) {
  const t = messages[locale].macro;
  const [preferredTab, setPreferredTab] = useDashboardPreference("driver-tab");
  const selected = preferredTab === "changes" ? 1 : 0;
  const setSelected = (index: number) => setPreferredTab(index === 1 ? "changes" : "drivers");
  const tabs = [{ label: t.scoreDriversTab, content: scoreDrivers }, { label: t.recentChangesTab, content: recentChanges }];
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
      : event.key === "ArrowRight" ? (selected + 1) % tabs.length : event.key === "ArrowLeft" ? (selected + tabs.length - 1) % tabs.length : null;
    if (index === null) return;
    event.preventDefault();
    setSelected(index);
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus();
  };
  return (
    <section className="driver-insights" aria-label={t.driverInsights}>
      <div className="driver-insights-tablist" role="tablist" aria-label={t.driverInsights} onKeyDown={onKeyDown}>
        {tabs.map((tab, index) => <button key={tab.label} type="button" role="tab" id={`${commodity}-insights-tab-${index}`}
          aria-controls={`${commodity}-insights-panel-${index}`} aria-selected={selected === index} tabIndex={selected === index ? 0 : -1}
          onClick={() => setSelected(index)}>{tab.label}</button>)}
      </div>
      {tabs.map((tab, index) => <div key={tab.label} role="tabpanel" id={`${commodity}-insights-panel-${index}`}
        aria-labelledby={`${commodity}-insights-tab-${index}`} hidden={selected !== index} tabIndex={0}>{tab.content}</div>)}
    </section>
  );
}