"use client";

import { useState } from "react";
import { messages, type Locale } from "@/lib/i18n";
import { classifyScoreStatus, type CommodityConfiguration } from "@/lib/commodity-score";
import { previewMetalModel, type ModelWeights } from "@/lib/metal-model";
import { metalModelCopy } from "@/lib/metal-model-copy";

type Props = {
  commodity: string;
  locale: Locale;
  rules: CommodityConfiguration["scoreRules"];
  factors: { id: string; score: number | null }[];
  models: { id: string; name: string; weights: ModelWeights }[];
  defaultId: string;
};

export function PersonalModelScore({ commodity, locale, rules, factors, models, defaultId }: Props) {
  const [selectedId, setSelectedId] = useState(defaultId);
  const copy = metalModelCopy[locale];
  const t = messages[locale].macro;
  const selected = models.find(({ id }) => id === selectedId) ?? models.find(({ id }) => id === defaultId)!;
  const { score, coverage } = previewMetalModel(selected.weights, factors);
  const status = score === null ? "unavailable" : classifyScoreStatus(score, rules);
  const classification = score === null ? t.unavailable : score <= 25 ? t.severity.low
    : score <= 50 ? t.severity.moderate : score <= 75 ? t.severity.elevated : t.severity.high;

  return <>
    <div className="gold-macro-score-heading">
      <div>
        <select className="eyebrow macro-model-personal-name" aria-label={copy.models} value={selected.id}
          onChange={(event) => setSelectedId(event.target.value)}>
          {[...models].sort((first, second) => first.name.localeCompare(second.name, locale)).map((model) =>
            <option key={model.id} value={model.id}>
              {model.name}{model.id === defaultId ? ` · ${copy.default}` : ""}
            </option>)}
        </select>
        <h3 id={`${commodity}-personal-model-title`}>{copy.personalModel}</h3>
      </div>
      <div className="gold-macro-score-total">
        <strong>{score ?? "—"}</strong>
        {score !== null && <>
          <span>/100</span>
          <span className={`impact-label impact-label-${status}`}>{t.impact[status]}</span>
          <span className="indicator-classification">{classification}</span>
        </>}
      </div>
    </div>
    {score !== null && <div className="stress-track gold-macro-score-track" role="progressbar"
      aria-label={`${selected.name} ${copy.personalModel}`} aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={score}><span style={{ width: `${score}%` }} /></div>}
    <p>{copy.coverage.replace("{coverage}", String(coverage)).replace("{excluded}", String(100 - coverage))}</p>
    <p>{score === null ? copy.noScore : copy.basis}</p>
  </>;
}
