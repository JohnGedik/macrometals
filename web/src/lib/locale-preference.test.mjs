import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";

const aliases = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`${specifier.slice(2)}.ts`, new URL("../", import.meta.url)).href, context);
    }
    return nextResolve(specifier, context);
  },
});
const { localeFromAcceptLanguage } = await import("./locale-preference.ts");
aliases.deregister();

test("localeFromAcceptLanguage uses the highest-quality supported language", () => {
  assert.equal(localeFromAcceptLanguage("fr-FR, tr-TR;q=0.9, en-US;q=0.8"), "tr");
  assert.equal(localeFromAcceptLanguage("tr;q=0.4, en-GB;q=0.9"), "en");
  assert.equal(localeFromAcceptLanguage("tr-TR,en-US;q=0.9"), "tr");
});

test("localeFromAcceptLanguage falls back to English", () => {
  assert.equal(localeFromAcceptLanguage(null), "en");
  assert.equal(localeFromAcceptLanguage("de-DE,fr;q=0.8"), "en");
  assert.equal(localeFromAcceptLanguage("tr;q=0, en;q=invalid"), "en");
  assert.equal(localeFromAcceptLanguage("*"), "en");
});
