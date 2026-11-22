import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";

test("copper providers refresh independently and retain successful data only within the permitted window", async () => {
  const originalNow = Date.now;
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const originalDOMMatrix = Object.getOwnPropertyDescriptor(globalThis, "DOMMatrix");
  const stateKey = Symbol.for("macrometals.test.copper-feed");
  const previousState = globalThis[stateKey];
  const state = { now: Date.parse("2026-11-18T16:00:00Z"), icsgRequests: 0, nbsRequests: 0, failIcsg: false, failNbs: true, errors: [] };
  globalThis[stateKey] = state;
  Date.now = () => state.now;
  delete globalThis.DOMMatrix;
  console.error = (...args) => state.errors.push(args);
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "server-only") return nextResolve(new URL("./server-only.stub.mjs", import.meta.url).href, context);
      if (specifier === "pdfjs-dist/legacy/build/pdf.mjs") {
        const pdf = `if (typeof globalThis.DOMMatrix !== "function") throw new Error("DOMMatrix is missing before PDF module initialization");
        export const getDocument = () => ({ promise: Promise.resolve({
          getPage: async () => ({ getTextContent: async () => ({ items: [
            { str: "TABLE 1. WORLD REFINED COPPER PRODUCTION AND USAGE TRENDS", hasEOL: true },
            { str: "Thousand metric tonnes, copper", hasEOL: true },
            { str: "2022 2023 2024 2025 Jan-Aug 2026", hasEOL: true },
            { str: "(Concentrate & SX-EW) 21,904 22,346 22,955 23,180", hasEOL: true },
            { str: "World Refined Copper Usage 2/ 25,857 26,633 27,416 28,159", hasEOL: true }
          ] }) }), destroy: async () => {}
        }) });`;
        return nextResolve(`data:text/javascript,${encodeURIComponent(pdf)}`, context);
      }
      if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, new URL("../", import.meta.url)).href, context);
      return nextResolve(specifier, context);
    },
  });
  const months = ["2025-October", "November", "December", "2026-January", "February", "March", "April", "May", "June", "July", "August", "September", "October"];
  const pmiHtml = `<table><tr><th>PMI</th><th>Production Index</th><th>New Order Index</th></tr>${months.map((month) =>
    `<tr><td>${month}</td><td>49.3</td></tr>`).join("")}</table>`;
  globalThis.fetch = async (raw) => {
    const url = String(raw);
    if (url.includes("icsg.org")) {
      state.icsgRequests++;
      return state.failIcsg ? new Response("", { status: 503 }) : new Response(new Uint8Array([1]));
    }
    if (url.endsWith("/PressRelease/")) {
      state.nbsRequests++;
      return state.failNbs ? new Response("", { status: 503 })
        : new Response('<a href="./release.html">Purchasing Managers’ Index for October 2026</a>');
    }
    if (url.endsWith("/release.html")) return new Response(pmiHtml);
    throw new Error(`Unexpected source ${url}`);
  };
  try {
    const { getCopperFeeds } = await import("./copper-data.ts");
    const [first, concurrent] = await Promise.all([getCopperFeeds(), getCopperFeeds()]);
    assert.equal(first["copper-industrial-demand"].at(-1).value, 28.159);
    assert.equal(first["copper-mine-supply"].at(-1).value, 23.18);
    assert.equal(first["china-pmi"], undefined);
    assert.deepEqual(concurrent, first);
    assert.equal(state.icsgRequests, 1);
    assert.equal(state.nbsRequests, 2);

    state.failNbs = false;
    const recovered = await getCopperFeeds();
    assert.equal(recovered["china-pmi"].at(-1).value, 49.3);
    assert.equal(state.icsgRequests, 1);
    assert.equal(state.nbsRequests, 3);

    state.now += 60 * 60 * 1000;
    state.failIcsg = true;
    const partialFailure = await getCopperFeeds();
    assert.deepEqual(partialFailure["copper-industrial-demand"], first["copper-industrial-demand"]);
    assert.equal(partialFailure["china-pmi"].at(-1).value, 49.3);
    assert.ok(state.errors.some(([message]) => message === "ICSG copper data download failed"));

    state.now += 5 * 60 * 60 * 1000;
    const expired = await getCopperFeeds();
    assert.equal(expired["copper-industrial-demand"], undefined);
    assert.equal(expired["copper-mine-supply"], undefined);
    assert.equal(expired["china-pmi"].at(-1).value, 49.3);
    state.failIcsg = false;
    assert.equal((await getCopperFeeds())["copper-mine-supply"].at(-1).value, 23.18);
  } finally {
    hooks.deregister();
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
    console.error = originalError;
    if (originalDOMMatrix) Object.defineProperty(globalThis, "DOMMatrix", originalDOMMatrix);
    else delete globalThis.DOMMatrix;
    globalThis[stateKey] = previousState;
  }
});
