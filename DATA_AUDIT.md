# Commodity Data Audit and Sample-Replacement Plan

Review date: 2026-11-11. Application baseline: commit `bafff77`.

## F01 Implementation Follow-Up

The application now has a fail-closed public scoring policy addressing F01: samples and unapproved inputs are reference-only, excluded from scores, confidence, narratives and development lists. Aggregate publication requires at least 80% eligible approved original weight and every configured critical Tier 1 factor. The 80% threshold is a conservative guardrail, not a model-accuracy claim. Research-mode sample calculations are explicit internal fixtures, not a public route option.

No input approvals were granted by this change. All current public allowlists are empty, so all four aggregates, their confidence ratings and market narratives are withheld pending actual data approval and sufficient coverage. Reference observations/charts and their source/sample status remain visible. Regression tests cover sample-value poisoning, missing approval, insufficient coverage, absent critical factors and withheld public outputs.

The findings and inventory below record the audit baseline before this follow-up. F02-F08, provider permissions, source replacement and predictive validation are not resolved by the F01 implementation. No production-data certification is implied.

## Decision

The dashboards are research prototypes, not data-certified production analytics. Keep the public prototype warning. Do not equate a sourced observation, a successful HTTP response, or a passing calculation test with independently verified data or a validated forecast.

This review inspected all 32 score-factor entries, source hydration, change/scoring engines, context calculations, summaries, and provider metadata. It ran the existing tests and controlled reproductions without changing application code. This document is the only file added by the review. No replacement feed, paid subscription, model change, or trading strategy is approved by this audit.

Source pages were checked for definitions and access constraints, not used to certify every historical value. Some downloadable files, credentials, licenses, and complete historical series remain unverified. Provider estimates and official statistics can still be revised.

## Current Coverage

These are configured weights when existing sourced feeds are healthy and have usable comparisons, not accuracy percentages.

| Commodity | Score factors | Sourced factors | Sourced weight | Sample factors | Sample weight |
| --- | ---: | --- | ---: | ---: | ---: |
| Gold | 8 | DXY, 10-year U.S. real yield | 45% | 6 | 55% |
| Silver | 8 | DXY, 10-year U.S. real yield | 35% | 6 | 65% |
| Copper | 8 | DXY, 10-year U.S. real yield | 20% | 6 | 80% |
| Oil | 8 | DXY | 10% | 7 | 90% |
| Total | 32 factor entries | 7 sourced entries using 2 underlying feeds | Not comparable across commodities | 25 | Not comparable across commodities |

The 25 remaining entries are listed individually below. Repeated GPR factors can share a provider adapter; COT factors need separate commodity/contract identifiers even if they share one ingestion adapter. Context cards, prices, seasonality, and illustrative correlations require additional checks and are not included in the 32-factor count.

Evidence: [web/src/lib/commodity-config.ts](web/src/lib/commodity-config.ts), [web/src/lib/gold-macro-data.ts](web/src/lib/gold-macro-data.ts), [web/src/lib/silver-macro-data.ts](web/src/lib/silver-macro-data.ts), [web/src/lib/copper-macro-data.ts](web/src/lib/copper-macro-data.ts), [web/src/lib/oil-macro-data.ts](web/src/lib/oil-macro-data.ts).

## Findings

### F01 - High: Sample Inputs Still Determine Scores and Narratives

Samples receive normal positive weights, affect confidence, and appear in driver-based narratives. Missing/stale exclusion applies to sourced inputs, not samples. A fresh DXY observation does not validate the rest of the model. The warning and per-card sample labels are useful disclosures, but not a verification process.

Before a data-certified release, add an explicit production policy: only approved datasets can contribute; define a minimum coverage requirement and required critical factors; otherwise withhold or qualify the aggregate score. Do not simply renormalize two surviving monetary factors and present them as the unchanged eight-factor model.

Evidence: [web/src/lib/commodity-score.ts](web/src/lib/commodity-score.ts#L102), [web/src/lib/commodity-score.ts](web/src/lib/commodity-score.ts#L112), [web/src/lib/macro-summary.ts](web/src/lib/macro-summary.ts).

### F02 - High: Observation Metadata Is Insufficient for Mixed-Frequency Data

An observation is only `{ time, value }`. There is no reporting-period span, publication date, revision vintage, source record identifier, units assertion, stock/flow distinction, or actual/estimate/forecast flag. Sample observations are assigned July 1 timestamps rather than genuine reporting dates. All configured source metadata is daily with a five-calendar-day age limit; only two source types exist.

This cannot safely admit monthly M2, quarterly purchases, annual mine production, or forecast-bearing oil datasets by merely changing a URL. An M2 observation dated at the start of its reference month is not newly published on that day. A scheduled annual report should not become invalid after five days.

The score engine also still requires seed `values` aligned to annual `years` even when sourced observations are available. Remove this structural dependence on sample arrays before a source-only configuration is considered complete.

Evidence: [web/src/lib/commodity-data.ts](web/src/lib/commodity-data.ts#L16), [web/src/lib/commodity-data.ts](web/src/lib/commodity-data.ts#L25), [web/src/lib/commodity-changes.ts](web/src/lib/commodity-changes.ts#L27), [web/src/lib/commodity-score.ts](web/src/lib/commodity-score.ts).

### F03 - High: Derived Context Freshness Can Hide a Stale Dependency

Context health uses the latest chart-point timestamp. The Silver Monetary Stress Index can carry old FRED observations forward with `valueAt`, yet receive a recent status because the Gold/DXY output date is recent.

Controlled reproduction: a 101-day-old real-yield dependency still produced `64/100` and `status: fresh` for the derived stress card. This is separate from the main Macro Score, whose sourced-factor stale exclusion is tested.

Derived health must inspect every required input at the calculation date, preserve component observation dates, and propagate unavailable/stale states. Fetch time and chart-end time are not substitutes for dependency freshness.

Evidence: [web/src/lib/indicators.ts](web/src/lib/indicators.ts#L357), [web/src/lib/indicators.ts](web/src/lib/indicators.ts#L413).

### F04 - Medium: Gold Five-Year Comparisons Use Ten-Year Histories

Gold requests ten years, takes the mean of the entire aligned ratio history, and labels Gold/S&P and Gold/Oil comparisons as five-year averages. Controlled reproduction: the displayed five-year mean was `1.500`, while the true mean of the mock observations in the last five years was `2.000`. This can also change the impact label.

Filter the reference window separately from the chart window. State whether averages use weekly closes, daily closes, or another sampling frequency. Also fix ten-year context charts currently described with the generic last-12-month caption, and use age-bounded YoY references in legacy context comparisons.

Evidence: [web/src/lib/indicators.ts](web/src/lib/indicators.ts#L369), [web/src/lib/indicators.ts](web/src/lib/indicators.ts#L413), [web/src/lib/indicators.ts](web/src/lib/indicators.ts#L539), [web/src/lib/indicators.ts](web/src/lib/indicators.ts#L546).

### F05 - Medium: Legacy Rate Changes Reject a Valid Zero Baseline

`periodChange` treats zero as missing. For rates, subtracting a zero prior yield is valid. Controlled reproduction: complete FRED history containing a zero 90-day reference caused the Silver stress value to become unavailable. The newer score-factor 90-day display handles zero correctly, so the two paths can disagree.

Use explicit null checks for point changes and test the legacy stress/context paths, not only the newer factor engine.

Evidence: [web/src/lib/indicators.ts](web/src/lib/indicators.ts#L140).

### F06 - Medium: Header Daily Returns Can Mix Quote and Bar Times

Current price may come from live metadata, while the reference always uses the penultimate historical bar. If the quote is newer than the final bar, the wrong comparison day is selected. Controlled reproduction: current quote `110`, latest available bar/previous close `105`, preceding bar `100`; the header returned `10%` rather than approximately `4.76%`.

Define the trading session, quote timestamp, prior official close, timezone and missing-bar behavior. Match intraday and historical data by session; do not assume array position establishes the prior close. Apply equivalent timestamp checks to ratios using two independent current quotes.

Evidence: [web/src/lib/indicators.ts](web/src/lib/indicators.ts#L100), [web/src/lib/indicators.ts](web/src/lib/indicators.ts#L657).

### F07 - Medium: Qualitative Labels Have Boundary Inconsistencies

The score engine calls 40 bearish, while the narrative calls 40 neutral. The sample breakeven change `2.34 - 2.29` produces a factor score of `59.999999999999964`, displaying a rounded change equivalent to the bullish boundary while retaining a neutral label.

Use one shared outlook policy, a documented numerical tolerance or decimal policy, and boundary tests covering displayed values, factor labels, aggregate outlooks and confidence. This is a calculation/communication issue, not evidence that the underlying sample values are correct.

Evidence: [web/src/lib/commodity-score.ts](web/src/lib/commodity-score.ts#L85), [web/src/lib/macro-summary.ts](web/src/lib/macro-summary.ts).

### F08 - High Release Gate: Access and Redistribution Rights Are Not Cleared

World Gold Council terms restrict scraping and republication beyond permitted use and require authorization for other uses. Free registration/download availability is not blanket permission for a public dashboard. ICSG's detailed historical database requires subscription. LME identifies paid historical data and licensed distribution routes. Other providers require their own terms review.

Do not implement an unapproved scraper, bypass authentication, or assume attribution alone grants redistribution rights. Record approved permitted uses, derived-data rights, caching limits and attribution per series. Obtain permission or use a properly licensed equivalent; if neither is possible, omit or explicitly redesign the factor rather than invent a substitute. This is an implementation gate, not legal advice.

Verified references: [WGC terms](https://www.gold.org/terms-and-conditions), [ICSG database](https://icsg.org/whats-icsg-online-statistical-database/), [LME data access](https://www.lme.com/en/market-data/accessing-market-data).

## Factor-by-Factor Replacement Backlog

All rows below are currently sample-backed. Providers are candidates, not approved/implemented integrations. Preserve the existing meaning unless a separately approved model version changes it. Weights below are current configured weights, not empirically established importance.

### Gold - Six Factors, 55% Weight

| ID / weight | Required series and candidate | Frequency and units | Implementation and verification requirements |
| --- | --- | --- | --- |
| `m2` / 10% | U.S. M2, FRED `M2SL` | Monthly, seasonally adjusted, USD billions | Label U.S. scope, not global liquidity. Divide by 1,000 for the current USD-trillions display. Match reference months, retain revisions, and honor H.6 reporting lag. Metadata confirmed. |
| `breakeven` / 5% | U.S. 5-year breakeven, FRED `T5YIE` | Daily, percent, not seasonally adjusted | Preserve five-year maturity; label breakeven inflation rather than CPI or a pure expectation. Compare percentage-point changes, not percentage growth. Metadata confirmed. |
| `geopolitical-risk` / 5% | Caldara-Iacoviello Recent GPR | Monthly index; a separate daily variant also exists | Select one version/frequency, retain vintage and revision information, and credit authors under the stated CC BY license. Do not mix historical/recent/old-methodology variants. Current index is a broad risk measure, not a direct gold-demand observation. |
| `cot-positioning` / 5% | CFTC Disaggregated COMEX Gold managed-money positions | Weekly, contracts | Pin market identifier and futures-only versus combined report. Net = managed-money long minus short; show thousands of contracts only after conversion. Store observation and publication dates separately. Replace unstable percent growth around zero with an approved positioning transform/model rule. |
| `central-bank-purchases` / 15% | WGC Gold Demand Trends net purchases, or a clearly distinguished reported-reserve-changes series | Quarterly flow in tonnes, or reported monthly changes | Choose estimated global buying versus reported-only changes. Reserve holdings are a stock, not purchases. Use same-period YoY or approved trailing-four-quarter tonnes; do not compare a quarter with a full year. WGC access/reuse permission and a history reconciliation are blocking gates. |
| `etf-holdings` / 15% | WGC global physically backed gold ETF holdings | Weekly/monthly stock in tonnes | Use physical holdings, not USD AUM or net flows. Define the covered fund universe and historical membership. Do not silently substitute GLD/IAU alone. WGC permission and approved download/access method are blocking gates. |

Source evidence: [M2SL](https://fred.stlouisfed.org/series/M2SL), [T5YIE](https://fred.stlouisfed.org/series/T5YIE), [GPR](https://www.matteoiacoviello.com/gpr.htm), [CFTC descriptions](https://www.cftc.gov/MarketReports/CommitmentsofTraders/DisaggregatedExplanatoryNotes/index.htm), [CFTC history](https://www.cftc.gov/MarketReports/CommitmentsofTraders/HistoricalCompressed/index.htm), [WGC reserves metadata](https://www.gold.org/goldhub/data/gold-reserves-by-country), [WGC demand reports](https://www.gold.org/goldhub/research/gold-demand-trends), [WGC ETF metadata](https://www.gold.org/goldhub/data/gold-etfs-holdings-and-flows).

### Silver - Six Factors, 65% Weight

| ID / weight | Required series and candidate | Frequency and units | Implementation and verification requirements |
| --- | --- | --- | --- |
| `breakeven` / 5% | U.S. 10-year breakeven, FRED `T10YIE` | Daily, percent, not seasonally adjusted | Silver's configured maturity is ten years; do not reuse Gold's five-year series. Current sample arrays happen to match, which does not establish equivalence. Metadata confirmed. |
| `cot-positioning` / 5% | CFTC Disaggregated COMEX Silver managed money | Weekly, contracts | Separate Silver's contract identifier from Gold. Fix report variant, net-position definition, publication lag, display conversion and near-zero transform. |
| `industrial-demand` / 20% | Silver Institute / Metals Focus World Silver Survey industrial fabrication | Annual flow, million troy ounces | Select exact global industrial-demand table and reporting year, not total silver demand or a forecast. Reconcile revised history from one edition/vintage. Source page/archive confirmed; full table extraction and redistribution permission remain pending. |
| `solar-demand` / 15% | World Silver Survey photovoltaic silver consumption | Annual flow, million troy ounces | Measure silver consumed, not installed solar GW or electricity output. PV is included in industrial demand; review the resulting double weighting. If a sector-use table is not obtainable, do not manufacture a consumption estimate without an approved model. |
| `mine-supply` / 10% | World Silver Survey global mine production; USGS as a cross-check/alternative | Annual flow, million troy ounces or metric tonnes | Exclude recycling from mine output. Verify the source's physical-metal units. One metric tonne is approximately 32,150.7466 troy ounces. Do not use U.S.-only monthly production as world output. Select one canonical revised series. |
| `etf-holdings` / 10% | Licensed global physical silver ETP holdings or an explicitly approved named issuer basket | Stock, million troy ounces; frequency depends on chosen source | A global aggregate with adequate history is not yet verified. SLV issuer data establishes one fund only. A basket needs fund membership, share-class deduplication, aligned dates, and approved reuse; relabel and version the factor if its scope changes. |

Source evidence: [T10YIE](https://fred.stlouisfed.org/series/T10YIE), [Silver Institute supply/demand](https://silverinstitute.org/silver-supply-demand/), [World Silver Survey archive](https://silverinstitute.org/all-world-silver-surveys/), [USGS silver](https://www.usgs.gov/centers/national-minerals-information-center/silver-statistics-and-information), [SLV issuer facts](https://www.ishares.com/us/products/239855/ishares-silver-trust-fund).

The fetched Silver Institute overview discusses an older report edition. It is not proof that its displayed overview is the latest available annual history. Verify the selected edition and table before extracting values. The SLV page also distinguishes trade-date holdings from accounting-date bar-list holdings; pick one convention.

### Copper - Six Factors, 80% Weight

| ID / weight | Required series and candidate | Frequency and units | Implementation and verification requirements |
| --- | --- | --- | --- |
| `cot-positioning` / 5% | CFTC Disaggregated COMEX copper managed money | Weekly, contracts | Pin the high-grade copper market and report variant. Retain open interest if normalizing positioning. Handle negative and zero net positions explicitly. |
| `china-pmi` / 20% | NBS/CFLP official manufacturing PMI | Monthly, seasonally adjusted diffusion index | Use the official manufacturing headline, not Caixin/S&P, composite or non-manufacturing PMI. Changes are index points. Decide explicitly whether the scoring rule uses level relative to 50, momentum or both; an improving sub-50 PMI is still contractionary. Release definition confirmed. |
| `mine-supply` / 15% | ICSG global copper mine production; USGS annual world output as a possible alternative | Monthly/annual physical copper content, displayed in million metric tonnes | Mine output is not refined production, ore tonnage or mine capacity. A monthly flow cannot be pasted into an annual-total chart. Choose same-period monthly YoY or a trailing-year physical total and label it. Full ICSG access is gated; USGS alternative needs exact table/history approval. |
| `industrial-demand` / 20% | ICSG global refined copper usage | Monthly/annual physical copper, displayed in million metric tonnes | Preserve refined usage/apparent-use definition, geography and revisions. Do not replace it with refined supply, imports, PMI or a price proxy. Detailed historical database is subscription-based. |
| `exchange-inventories` / 15% | Approved LME / SHFE / COMEX warehouse series, or an explicitly narrower named exchange | Daily/weekly stock, displayed in thousand metric tonnes | Define exchange universe and warrant/category coverage. Do not double-count warrants and warehouse totals or assume all exchanges report metric tonnes. Align different reporting schedules and expose missing-component coverage. Detailed API/history and redistribution rights remain unverified. |
| `energy-transition-demand` / 5% | IEA historical clean-energy copper-demand dataset, subject to access approval | Usually annual physical copper, displayed in million tonnes | Define included technologies. Do not substitute EV sales, grid spending, or future scenarios for observed/estimated historical consumption. It overlaps refined usage. IEA explorer fetch returned HTTP 403; exact obtainable series and license remain unresolved. |

Source evidence: [NBS release](https://www.stats.gov.cn/english/PressRelease/202611/t20261103_1965735.html), [ICSG](https://icsg.org/), [ICSG database](https://icsg.org/whats-icsg-online-statistical-database/), [LME access](https://www.lme.com/en/market-data/accessing-market-data), [IEA critical-minerals explorer](https://www.iea.org/data-and-statistics/data-tools/critical-minerals-data-explorer).

### Oil - Seven Factors, 90% Weight

| ID / weight | Required series and candidate | Frequency and units | Implementation and verification requirements |
| --- | --- | --- | --- |
| `geopolitical-risk` / 5% | Same approved GPR series as Gold | Monthly index, if selected | Share adapter and vintage. Broad geopolitical risk can reduce demand as well as threaten supply; a permanently positive oil-price rule needs model validation, not just authentic input data. |
| `cot-positioning` / 5% | CFTC Disaggregated NYMEX WTI managed money | Weekly, contracts | Use WTI market identity and a fixed futures-only/combined variant. Do not substitute Brent positions or mix exchanges without an approved composite definition. |
| `global-demand` / 20% | EIA STEO historical/estimated world petroleum-and-other-liquids consumption; approved OPEC/IEA equivalent if needed | Monthly average rate, million barrels/day | Exclude forecast rows from an actual-data score, or explicitly create an estimates/forecast factor. Keep current-year forecast totals separate from realized observations. Define liquids scope consistently with supply. Specific API series mapping and history must be verified before implementation. |
| `global-supply` / 20% | Same canonical provider's world liquids production | Monthly average rate, million barrels/day | Do not use U.S. crude production or OPEC crude alone as world total liquids. Track revisions and estimated versus forecast periods. Do not sum monthly rates as if they were physical monthly volumes. |
| `commercial-inventories` / 15% | OECD commercial petroleum stocks from an approved EIA STEO/OPEC appendix/IEA series | Monthly stock, million barrels | Distinguish commercial/industry from strategic/government stocks and crude-only from all petroleum. The current EIA U.S. weekly WCESTUS1 context feed is not an OECD replacement. Metadata indicates candidate tables; exact series and extraction remain pending. |
| `spare-capacity` / 15% | EIA/OPEC/approved energy-provider estimate of OPEC spare crude capacity | Monthly estimated rate, million barrels/day | Follow the source's country membership, operability and availability definition. Capacity minus production is not automatically usable spare capacity. Keep estimates identified and policy decisions separate from technical capability. Exact historical series must be approved. |
| `refinery-runs` / 10% | Approved IEA global refinery-throughput history, or another genuinely global equivalent | Monthly rate, million barrels/day | U.S. runs are not global runs. JODI country data needs a coverage audit; summing incomplete reporters is not a complete world total. OPEC table scope must be inspected. IEA OMR fetch returned HTTP 403; global replacement access remains unresolved. |

Source evidence: [EIA STEO](https://www.eia.gov/outlooks/steo/), [EIA Open Data](https://www.eia.gov/opendata/), [OPEC MOMR and appendix links](https://www.opec.org/monthly-oil-market-report.html), [JODI Oil](https://www.jodidata.org/oil/), [IEA Oil Market Report](https://www.iea.org/reports/oil-market-report).

STEO explicitly contains both history and forecasts. OPEC publishes monthly appendix spreadsheets, but availability alone does not establish the needed global table, a stable API contract, or public-redistribution permission. JODI explicitly reports incomplete country update coverage. EIA API access requires registration and an API key; never put the key in client code or the audit document.

## Existing Sourced Inputs and Context Also Need Certification

| Input | Current implementation | Required verification |
| --- | --- | --- |
| DXY | Yahoo chart `DX-Y.NYB`, daily score history | Confirm cash-index identity, timezone, close convention, acceptable lag, history continuity and authorized public use. A reachable unofficial chart endpoint is not an exchange-supported API/SLA. A candidate ICE information URL returned Not Found in this review, so primary methodology/access verification remains open. Do not swap DXY with a broad trade-weighted dollar index without relabeling/model approval. |
| Real yield | FRED `DFII10` daily percent | Official metadata confirms 10-year U.S. inflation-indexed constant-maturity yield. Retain negative/zero values, reconcile sample dates with Treasury/FRED, and record publication/vintage. It is not a global real-interest-rate measure. Full historical reconciliation was not performed. |
| Commodity prices | Yahoo `GC=F`, `SI=F`, `HG=F`, `CL=F`, `BZ=F` | Define exact instrument, continuous-futures roll convention, quote versus settlement, unit and timezone. They are not interchangeable with physical spot prices or licensed benchmark fixes. Test contract-roll discontinuities and timestamp-aligned returns/ratios. |
| Gold context ratios | Aligned historical closes, but current ratios may use separate latest quotes | Fix reference-window labels and unify timestamp matching. Distinguish 90-day/YoY trends from deviation versus historical average. |
| Silver stress index | Derived from Gold momentum, real yields and DXY | Fix zero-yield handling and stale-dependency propagation. Define a common calculation date and prevent unlimited forward filling. |
| Gold seasonality | Twelve hardcoded monthly average returns | Replace using an approved price series with documented sample window, monthly return construction, minimum observations and averaging method; otherwise retain an explicit sample label or remove. |
| Gold correlations | Five supplied constants: +0.81, -0.74, -0.65, +0.48, +0.55 | No sample dates, method or reconciliation exists. Do not present as verified historical estimates. Recompute from approved aligned data with documented transformations, sample count, window and uncertainty; avoid spurious level correlations. |
| U.S. EIA inventories | `WCESTUS1`, latest weekly difference and five-year seasonal comparator | Verify raw units before `/1000`, series identity, weekly period dates and five distinct prior-year matches. Test gaps, duplicates, leap years, seasonal tolerance and revisions. Production availability depends on server key and API access; this review did not use an API credential. |
| WTI futures curve | Explicitly unavailable | Preserve unavailable state until two named contracts, delivery months, quote timestamps and an approved source are implemented. Do not infer the curve from WTI/Brent or a continuous front-month symbol. |

## Required Data Contract

Introduce this contract before adding monthly/quarterly feeds. Keep raw source records and normalized records separately.

| Field group | Required information |
| --- | --- |
| Identity | Commodity, immutable factor ID, provider, dataset/series ID, method version, URL, approved reuse/attribution record |
| Meaning | Geography, instrument/universe, stock/flow/rate/index, maturity, seasonal adjustment, actual/estimate/forecast status |
| Measurement | Raw unit, normalized unit, exact conversion, scale, currency, physical-metal versus ore content |
| Time | Period start/end, observation date, publication timestamp, retrieval timestamp, timezone, next expected release |
| Revisions | Source release/vintage, provisional/revised flag, previous-vintage values, raw file checksum |
| Quality | Validity checks, completeness, duplicate handling, outlier quarantine, dependency dates, reason for exclusion |
| Model | Transform, comparison horizon, favorable direction, calibration window, weight and model version |

Use explicit series IDs, not page-title matching. Use structured JSON/CSV/XLS parsing, not chart screenshots or undocumented HTML number extraction. Source changes must fail closed on missing columns, unit changes or unexpected geography. Do not use an illustrative value as a fallback for an approved live factor.

## Transformation and Freshness Rules

1. Stock series: compare aligned period-end holdings/inventories; never sum stocks across time.
2. Volume-flow series: compare equivalent periods, or use approved trailing-four-quarter/trailing-twelve-month totals. Never compare a quarterly flow to an annual flow.
3. Rate series in barrels/day: use appropriate day-weighted aggregation when combining months; summing twelve monthly rates is not an annual volume or rate.
4. Interest rates/breakevens and PMI: use percentage-point/index-point differences, with an explicit horizon and threshold policy.
5. Net purchases and COT positioning: zero/negative baselines require an approved absolute-change, open-interest-normalized or percentile transform, not unbounded percentage growth.
6. Monthly/quarterly/annual freshness: evaluate whether the latest scheduled release is present, including known reporting lag and holidays. Do not apply a daily five-day cutoff to M2, annual mine supply or quarterly purchases.
7. Composite freshness: every necessary component must meet its policy at the calculation date. Expose incomplete coverage instead of labeling a derived output fresh because its newest timestamp is recent.
8. Revisions: show whether values are preliminary, archive original releases, and distinguish economic changes from provider revisions in score history.

## Implementation Order

### Phase 0 - Correctness and Definition Gates

- Fix F03-F07 and add regression fixtures for all reproduced failures.
- Introduce the data contract, per-series release/freshness policies, unit conversions and evidence-backed source registry.
- Decide source-only production coverage requirements, model versioning and whether the score can appear when critical factors are missing.
- Audit overlap: Silver industrial/PV demand, Copper refined/electrification demand, Oil demand/refinery runs; review fixed favorable directions and arbitrary scale/weight choices.
- Confirm access and redistribution rights before building adapters for gated providers.

### Phase 1 - FRED Replacements

- Add Gold `M2SL`, Gold `T5YIE`, Silver `T10YIE` as separate definitions with appropriate units and release policies.
- When healthy, configured sourced shares become Gold 60%, Silver 40%, Copper 20%, Oil 10%.
- Preserve raw monthly period dates and publication lag; do not synthesize annual observations just to fit the current seed schema.

### Phase 2 - Shared GPR and CFTC Adapters

- Add the approved GPR version to Gold/Oil, retaining credit and vintage.
- Add four verified CFTC markets with one fixed report variant, correct publication timing and a reviewed near-zero positioning transform.
- With the preceding steps usable, potential sourced shares become Gold 70%, Silver 45%, Copper 25%, Oil 20%.
- These are potential configured coverage figures, not promises of verified access or predictive accuracy.

### Phase 3 - Physical Fundamentals

- Gold: approve central-bank flow definition and ETF universe, obtain rights/history, reconcile, then replace the last 30%.
- Silver: approve one World Silver Survey edition/vintage and a global ETP/basket definition, then replace the remaining 55% without substituting solar GW or U.S.-only production.
- Copper: obtain official PMI and approved mine/refined-usage datasets; resolve exchange licensing and clean-energy historical coverage before replacing the remaining 75%.
- Oil: select one consistent liquids-balance provider, separate actuals/estimates/forecasts, and resolve OECD stocks, OPEC spare capacity and genuinely global refinery throughput before replacing the remaining 80%.

### Phase 4 - Certification, Not Just Integration

- Reconcile raw and normalized history, not just the latest observation.
- Verify seasonal, rate, stock and flow aggregation against published reference examples.
- Add independent-value cross-checks where a genuinely independent source exists; two websites repeating the same upstream series are not independent confirmation.
- Validate model behavior and sensitivity separately from data correctness. Point-in-time out-of-sample backtesting is a separate workstream, not a claim made by this audit.
- Remove the prototype warning only after an explicit release checklist is approved, not merely when all URLs return HTTP 200.

## Acceptance Checklist for Every Replaced Factor

- [ ] Exact definition, scope, units, frequency and observation versus release dates approved.
- [ ] Data access, public display, caching and derived-use permissions recorded.
- [ ] Complete available history reconciled; ten-year display used only where genuine history exists.
- [ ] At least the latest observation, previous equivalent period and selected historical dates matched to authoritative records.
- [ ] Provisional/estimated/forecast rows classified; future information cannot enter a past score.
- [ ] Stock/flow/rate aggregation and unit conversions tested with known fixtures.
- [ ] Zero/negative baselines, gaps, duplicate dates, leap years and invalid units/dates tested.
- [ ] Missing responses, HTML-instead-of-data, malformed payloads, rate limits, timeout and stale-release cases fail safely.
- [ ] Outlier checks quarantine suspicious values instead of silently clamping them into a plausible-looking score.
- [ ] Every chart, driver list, summary, data-health badge and score uses the same canonical observations.
- [ ] Source coverage and exclusion reasons are accurate; missing feeds never fall back to samples.
- [ ] Weights, scales, overlap and favorable-direction assumptions have a separate documented model review.
- [ ] Public staging/production retrieval checked from the actual deployment environment.
- [ ] Monitoring, provider-change alerts, rollback/replay procedures and a responsible data owner established.

## Validation Evidence and Limits

- Existing `npm --prefix web run test:commodities`: 34/34 passed during this review.
- Controlled mocked-fetch reproductions confirmed F03-F06 without editing source files or contacting paid providers.
- Additional direct probes confirmed the score-40 outlook mismatch and floating-point factor-label boundary in F07.
- The tests verify implementation behavior, not dataset authenticity, redistribution rights, completeness or forecast accuracy.
- Source metadata was inspected on FRED, WGC, CFTC, GPR, Silver Institute, iShares, USGS, ICSG, NBS, LME, EIA, OPEC and JODI pages linked above.
- IEA Oil Market Report and critical-minerals explorer requests returned HTTP 403. The candidate ICE metadata path returned Not Found. These are unresolved access/verification items, not evidence that equivalent series can be obtained or redistributed freely.
- WGC permission, exchange/ICSG/IEA licenses, a complete global silver-ETP dataset, all requested historical downloads and independent point-by-point reconciliations remain open.
- No application code was changed, no feeds were added, and no existing data or model was certified as production ready by this review.