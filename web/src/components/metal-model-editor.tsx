"use client";

import { useRef, useState, useTransition } from "react";
import { changeMetalModel } from "@/app/models/actions";
import type { Locale } from "@/lib/i18n";
import { previewMetalModel, rebalanceModelWeights, type MetalModelCommodity, type ModelWeights, type SavedMetalModel } from "@/lib/metal-model";
import { metalModelCopy } from "@/lib/metal-model-copy";

type Props = {
  commodity: MetalModelCommodity;
  locale: Locale;
  baseWeights: ModelWeights;
  factors: { id: string; name: string; score: number | null }[];
  initialModels: SavedMetalModel[];
  initialDefault: string | null;
};

export function MetalModelEditor({ commodity, locale, baseWeights, factors, initialModels, initialDefault }: Props) {
  const t = metalModelCopy[locale];
  const orderWeights = (weights: ModelWeights) => Object.fromEntries(factors.map(({ id }) => [id, weights[id]]));
  const firstModel = initialModels.find(({ id }) => id === initialDefault);
  const [models, setModels] = useState(initialModels);
  const [defaultId, setDefaultId] = useState(initialDefault);
  const [activeId, setActiveId] = useState(firstModel?.id ?? "");
  const [name, setName] = useState(firstModel?.name ?? "");
  const [weights, setWeights] = useState(() => orderWeights(firstModel?.weights ?? baseWeights));
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>();
  const [busy, startTransition] = useTransition();
  const drag = useRef<{ id: string; weights: ModelWeights } | null>(null);
  const selected = models.find(({ id }) => id === activeId);
  const dirty = name !== (selected?.name ?? "") || factors.some(({ id }) => weights[id] !== (selected?.weights ?? baseWeights)[id]);
  const { score, coverage } = previewMetalModel(weights, factors);

  function load(model?: SavedMetalModel) {
    setActiveId(model?.id ?? "");
    setName(model?.name ?? "");
    setWeights(orderWeights(model?.weights ?? baseWeights));
  }

  function change(command: Parameters<typeof changeMetalModel>[1]) {
    setNotice(undefined);
    startTransition(async () => {
      try {
        const result = await changeMetalModel(commodity, command);
        if (!result.ok) {
          setNotice({ text: t.errors[result.error], error: true });
          return;
        }
        if (result.model) {
          const saved = result.model;
          setModels((previous) => [...previous.filter(({ id }) => id !== saved.id), saved]);
          load(saved);
          setNotice({ text: t.saved });
        } else if (command.kind === "default") {
          setDefaultId(command.id);
          setNotice({ text: t.defaultSet });
        } else if (command.kind === "delete") {
          setModels((previous) => previous.filter(({ id }) => id !== command.id));
          if (defaultId === command.id) setDefaultId(null);
          load(models.find(({ id }) => id === defaultId && id !== command.id));
          setNotice({ text: t.deleted });
        }
      } catch {
        setNotice({ text: t.errors.failed, error: true });
      }
    });
  }

  return (
    <div className="metal-model-editor">
      <section className="metal-model-preview" aria-label={t.preview}>
        <div role="status" aria-atomic="true">
          <strong>{score === null ? "—" : `${score}/100`}</strong>
          <p>{t.coverage.replace("{coverage}", String(coverage)).replace("{excluded}", String(100 - coverage))}</p>
          {score === null && <p>{t.noScore}</p>}
        </div>
        <p>{t.basis}</p>
      </section>
      <form onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        change(selected
          ? { kind: "save", id: selected.id, revision: selected.revision, name, weights }
          : { kind: "create", name, weights });
      }}>
        <fieldset disabled={busy}>
          <div className="metal-model-fields">
            <label>{t.models}
              <select value={activeId} onChange={(event) => {
                if (dirty && !window.confirm(t.discard)) return;
                load(models.find(({ id }) => id === event.target.value));
                setNotice(undefined);
              }}>
                <option value="">{t.starter}</option>
                {[...models].sort((a, b) => a.name.localeCompare(b.name, locale)).map((model) =>
                  <option key={model.id} value={model.id}>{model.name}{model.id === defaultId ? ` (${t.default})` : ""}</option>)}
              </select>
            </label>
            <label>{t.name}<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} /></label>
          </div>
          <div className="metal-model-actions">
            <button type="submit" className="button-primary" disabled={!name.trim() || (!!selected && !dirty)}>{t.save}</button>
            {selected && <>
              <button type="button" disabled={!name.trim() || name.trim().toLowerCase() === selected.name.toLowerCase()}
                onClick={() => change({ kind: "create", name, weights })}>{t.copy}</button>
              <button type="button" disabled={selected.id === defaultId || dirty}
                onClick={() => change({ kind: "default", id: selected.id })}>{selected.id === defaultId ? t.default : t.useDefault}</button>
              <button type="button" onClick={() => {
                if (window.confirm(t.confirmDelete)) change({ kind: "delete", id: selected.id, revision: selected.revision });
              }}>{t.remove}</button>
            </>}
          </div>
          <div role={notice?.error ? "alert" : "status"} className="metal-model-notice">{notice?.text}</div>
          <h2>{t.weights}</h2>
          <p><strong>{t.total}: {new Intl.NumberFormat(locale, { style: "percent" }).format(Object.values(weights).reduce((sum, weight) => sum + weight, 0) / 100)}</strong></p>
          <div className="metal-model-weights">
            {factors.map((factor) => (
              <label key={factor.id}>
                <span>{factor.name} <strong>{new Intl.NumberFormat(locale, { style: "percent" }).format(weights[factor.id] / 100)}</strong></span>
                <input type="range" min={0} max={100} step={1} value={weights[factor.id]}
                  aria-label={factor.name} aria-valuetext={new Intl.NumberFormat(locale, { style: "percent" }).format(weights[factor.id] / 100)}
                  onPointerDown={(event) => {
                    if (event.isPrimary && event.button === 0) drag.current = { id: factor.id, weights };
                  }}
                  onPointerUp={() => { drag.current = null; }}
                  onPointerCancel={() => { drag.current = null; }}
                  onBlur={() => { drag.current = null; }}
                  onKeyDown={() => { drag.current = null; }}
                  onChange={(event) => {
                    const value = event.currentTarget.valueAsNumber;
                    const basis = drag.current?.id === factor.id ? drag.current.weights : null;
                    setWeights((previous) => rebalanceModelWeights(basis ?? previous, factor.id, value));
                  }} />
                <small>{factor.score === null ? t.unavailable : t.eligible.replace("{score}", String(Math.round(factor.score)))}</small>
              </label>
            ))}
          </div>
        </fieldset>
      </form>
    </div>
  );
}
