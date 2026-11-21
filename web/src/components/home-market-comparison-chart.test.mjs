import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import ts from "typescript";

const src = resolve(dirname(fileURLToPath(import.meta.url)), "..");
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(pathToFileURL(resolve(src, `${specifier.slice(2)}.ts`)).href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (!url.endsWith(".tsx")) return nextLoad(url, context);
    const result = nextLoad(url, { ...context, format: "module" });
    return {
      format: "module",
      shortCircuit: true,
      source: ts.transpileModule(String(result.source), {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext },
      }).outputText,
    };
  },
});

const { HomeMarketComparisonChart } = await import("./home-market-comparison-chart.tsx");
const { messages } = await import("../lib/i18n.ts");

test("the default comparison selects five years, Gold and the S&P 500", () => {
  const point = (date, value) => ({
    time: Date.parse(`${date}T00:00:00Z`) / 1000,
    gold: value, silver: value, copper: value, oil: value, nasdaq: value, sp500: value,
  });
  const t = messages.en.home;
  const html = renderToStaticMarkup(createElement(HomeMarketComparisonChart, {
    points: [point("2021-11-20", 100), point("2026-11-20", 200)],
    locale: "en", labels: t.marketComparisonAssets, observedAt: null,
    sourceNote: t.marketComparisonSource, noSelectionLabel: t.marketComparisonNoSelection,
    seriesLabel: t.marketComparisonSeriesLabel, titles: t.marketComparisonTitles,
    ranges: t.marketComparisonRanges, rangeLabel: t.marketComparisonRangeLabel,
    unavailableLabel: t.marketComparisonUnavailable, eyebrow: t.macroSnapshot,
    note: t.marketComparisonNote,
  }));
  const $ = load(html);
  assert.equal($("h2").text(), "Five-year market comparison");
  assert.deepEqual($(".home-market-comparison-ranges button").map((_, button) => $(button).text()).get(),
    ["10 years", "5 years", "1 year", "6 months", "1 month"]);
  assert.equal($(".home-market-comparison-ranges button[aria-pressed='true']").text(), "5 years");
  assert.deepEqual($(".home-market-comparison-legend label").filter((_, label) => $(label).find("input").is(":checked"))
    .map((_, label) => $(label).text()).get(), ["Gold", "S&P 500"]);
  assert.equal($(".home-market-comparison-source").text(), "Source: Yahoo Finance");
});
