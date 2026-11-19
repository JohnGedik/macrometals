# Macro Metals Monitor

An editorial macro research site focused on gold, silver, oil, and their relationships to the wider economy. The web app lives in [`web/`](web/).

## Run locally

```powershell
cd web
npm install
npm run dev
```

Open http://localhost:3000. The journal and seeded sample articles render without Supabase credentials; authentication, member publishing, voting, comments, profile storage, and newsletter persistence require a Supabase project.

## Supabase setup

1. Copy `web/.env.example` to `web/.env.local` and set `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the Supabase project settings.
2. Apply [`web/supabase/migrations/20261107000000_initial_schema.sql`](web/supabase/migrations/20261107000000_initial_schema.sql), [`web/supabase/migrations/20261111000000_community_publishing.sql`](web/supabase/migrations/20261111000000_community_publishing.sql), [`web/supabase/migrations/20261115010000_community_library_discussions.sql`](web/supabase/migrations/20261115010000_community_library_discussions.sql), and [`web/supabase/migrations/20261116000000_ensure_own_profile.sql`](web/supabase/migrations/20261116000000_ensure_own_profile.sql), in order, in the Supabase SQL editor or with the Supabase CLI.
3. In Supabase Authentication, enable Google and email providers. Email login uses a passwordless sign-in link. Add `http://localhost:3000/auth/callback` and the deployed callback URL to the allowed redirect URLs.
4. Configure the Google OAuth client ID and secret in Supabase, and set its callback URL to the Supabase-provided Google provider callback.

Profile and comment ownership is enforced by row-level security. Avatar uploads are limited to the signed-in user's storage folder. Newsletter addresses can be inserted but are not readable through the public API.

The Next.js site uses `@supabase/ssr` for its cookie-based login flow. `@supabase/server` is available for custom API handlers that need verified JWTs and an RLS-scoped Supabase client; it does not replace `@supabase/ssr`. For those handlers, configure `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_JWKS_URL` in local `.env.local` and Vercel. `SUPABASE_SECRET_KEY` is optional and must remain server-only; it bypasses RLS and is not required for normal user authentication.

## Routes

- `/` publication home
- `/articles/[slug]` article, comments, share links, and social metadata
- `/community` member-published articles with latest, top-rated, most-viewed, and trending sorts
- `/community/topics` topic-filtered articles and discussions; `/discussions/new` and `/discussions/[id]` create and read discussions
- `/library` signed-in user's drafts, published articles, and saved articles
- `/write` create articles and drafts; `/write/[slug]` edit your own articles
- `/tag/[tag]` related articles
- `/search?q=...` article content, title, summary, category, author, and tag search
- `/author/[slug]` author profile and articles
- `/profile/[username]` public member profile, published articles, and received votes
- `/login` Google or email-link sign-in
- `/profile` signed-in profile and avatar editor, draft list, and writing link

The header's Community menu links to articles and discussions; the account menu provides access to the library and writing. Visitors can use these links and will be asked to sign in where required.

## Writing articles

Each article is a Markdown document at `web/content/articles/<slug>/index.md`. YAML frontmatter defines its `id`, `slug`, `title`, `summary`, `coverImage`, `publishedAt`, `tags`, and `author`; the document body supports standard Markdown. Keep the article `id` aligned with its row in the Supabase `articles` table so comments continue to reference the correct article.

To provide a Turkish translation, add `index.tr.md` in the same article directory with matching `id`, `slug`, `tags`, and author identity. Translate the title, summary, author bio, and body. If `index.tr.md` is absent, that article displays in English while the rest of the interface remains Turkish.

Members can publish Markdown articles from `/write`. Drafts are private to their author; publishing makes the article available in the Community feed and existing article routes. Voting is one vote per account per article; selecting the active direction removes the vote, and selecting the opposite direction changes it. Commenting continues to use the existing flat comment system.

If an older account has no profile row, saving a profile or article creates one for that signed-in account. Article submission errors leave the editor content in place so the member can retry; if the session expires, sign in in a separate tab before retrying.

Members can save articles privately, submit short discussions by topic, vote on discussions, and reply up to three levels deep. Topic feeds show up to 100 discussions sorted by the selected order, alongside the latest available articles. A saved article that has been removed or unpublished is shown as unavailable and can be removed from the library.

Reports are private and require manual review by a trusted administrator in the Supabase dashboard's `community_reports` table. Regular API roles cannot read reports; review the target type and ID, investigate the referenced content, and handle it manually. There is no moderator dashboard or automatic content removal.

## Macro indicator methodology

### Commodity configuration and Macro Scores

All commodity dashboards use the registry in [`web/src/lib/commodity-config.ts`](web/src/lib/commodity-config.ts), the pure score engine in [`web/src/lib/commodity-score.ts`](web/src/lib/commodity-score.ts), and the same `/tag/[tag]` route and renderer. Yahoo/FRED factors are permission-gated; source availability is not approval for scoring. Remaining annual histories are illustrative samples, not verified or live market data, and their public values/charts are hidden because origin and reuse rights are undocumented. Market/EIA context cards are not additional score factors.

Public dashboards use a `scoringPolicy` with `mode: "sourced-only"` and an explicit `approvedIndicators` allowlist. Gold retains an 80% minimum coverage and required Tier 1 factors. At the owner's request, Silver, Copper and Oil instead have `minimumCoverage: 0` and no required factors. Silver approves all eight factors; Copper approves only its existing FRED real-rate and broad-dollar feeds; Oil approves seven verified factors, excluding refinery throughput. These partial-score dashboards can publish with any positive eligible weight, rescaling available factors to 100%; the UI still discloses actual coverage and excluded weight. None can publish from zero eligible inputs, samples, unapproved, stale or invalid data. Gold's allowlist includes seasonality, reported WGC reserve changes and ETF holdings, FRED real rates, the broad dollar index (DTWEXBGS), five-year breakeven inflation, and CFTC COMEX Gold Managed Money net positioning. DTWEXBGS is not ICE DXY. Monthly Caldara-Iacoviello Recent GPR is sourced for Gold display but excluded from Gold scoring; it is approved for Oil scoring. Gold's 80% threshold is a conservative publication guardrail, not an empirically validated accuracy threshold. See [DATA_AUDIT.md](DATA_AUDIT.md) for the remaining issues.

Gold uses the original factor weights with five percentage points transferred from real rates to seasonality: real rates 20%, seasonality 5%, broad dollar 20%, central-bank purchases 15%, ETF holdings 15%, M2 10%, breakeven inflation 5%, geopolitical risk 5%, and CFTC positioning 5% (total 100%). Source approvals and publication gates are unchanged.

Samples and unapproved inputs have null factor scores and zero contribution. They cannot influence aggregate score, confidence, narratives, score drivers or Recent Changes. Unverified sample values/charts are hidden publicly and show a provenance/reuse warning; explicit `mode: "research"` remains available for internal fixtures and the public registry/route do not expose a research-mode switch. If eligible approved weight is below the minimum or a critical factor is missing, no aggregate number, bullish/bearish outlook, confidence badge or market narrative is published. Even a small set of approved factors is not silently presented as the full eight-factor model.

A `CommodityConfiguration` contains:

- `commodity`: a URL slug, such as `natural-gas`.
- `indicators`: localized names, interpretations, unit suffixes/prefixes, tier, display precision, change kind, and values aligned to `years`.
- `weights`: indicator ID to percentage weight; weights must total 100.
- `scoreRules`: neutral baseline, sensitivity, bullish/bearish thresholds, and per-indicator favorable direction, positive scale, and trend threshold.
- `market`: a Yahoo Finance symbol and display unit for the shared price header. Yahoo values remain unavailable until automated access and underlying-data public-distribution permissions are separately recorded.
- Localized name, dashboard/score titles, disclosure, source, refresh policy, and methodology.
- Optional `contextProvider`: one of the existing legacy market contexts. Omit it for a new commodity unless that context is appropriate; no context is fetched by default.
- Optional `scoreSources`: maps indicator IDs to `dxy` (Gold, Silver, Copper, and Oil use FRED `DTWEXBGS`, the Nominal Broad U.S. Dollar Index), `real-yields` (FRED `DFII10`), `m2` (FRED `M2SL`), `breakeven-5y` (FRED `T5YIE`), `wgc-central-bank`, or `wgc-etf-holdings`. The broad index is not ICE DXY; source-specific permission flags are required before observations are used, and configuration alone does not approve scoring.

To add Platinum, Palladium, Uranium, Natural Gas, or Steel, register a new configuration under its slug with suitable data and metadata. No new route, score function, or dashboard component is needed. New external data feeds may still require adapters; registration does not invent missing prices or historical observations. The existing seed files are mapped into the normalized configuration, including `weights` and `scoreRules`.

### Personal Metal Models

Apply the [Metal Models migration](web/supabase/migrations/20261117000000_metal_models.sql) after the base Supabase migrations. Sign in, then choose **Customize your model** on Gold, Silver, Copper, or Oil. The editor starts with the site's weights or automatically loads your saved default for that commodity. Moving one slider rebalances the others in whole percentage points, keeping the total at 100%. Change the name and save to rename a model, or use **Save as new** to keep a separate copy. Deleting a default returns the editor to the site's weights unless a different default is set.

The Configured Model panel on each commodity dashboard shows the system score alongside the signed-in user's saved default score, with **Customize your model** next to it. If no default is set, the panel explains how to set one. The editor preview updates immediately using factor scores available when it opened. Both personal scores rescale only eligible weights and show coverage; no eligible positive weight means no score. The personal score does not use public publication thresholds, change public scores, or include stale, unapproved, or sample data.

Commodity dashboards start the chart, score, cross-market, article, and personal model requests together and stream those sections as they are ready. The system score does not wait for the other sections. The scoring and cross-market sections share a single FRED real-yield request per dashboard load; this does not add a shared cache or change data freshness.

Models and defaults are owner-scoped by Supabase RLS. A model has a stable UUID, a definition version for the indicator set, and a revision that advances on save. A future observation/evaluation table can store model ID, revision, exact weights, its scoring-rule version, and observation references independently of the editable model. No evaluation history, backtesting, or performance metrics are collected or exposed.

### WGC gold data

The Gold dashboard uses monthly net changes in reported official reserves from the WGC `Changes in World Official Gold Reserves` workbook and month-end global ETF holdings from the WGC `Gold ETF Flows` workbook. The reserve-change aggregate is not WGC's broader estimate of total central-bank demand, which includes unreported activity.

Because WGC workbook downloads require a signed-in Goldhub account, refresh the derived observation snapshot after downloading both workbooks:

```powershell
cd web
npm run import:wgc -- "C:\path\to\changes-workbook.xlsx" "C:\path\to\etf-workbook.xlsx"
```

The importer writes derived monthly aggregates and country-level reserve changes to `web/src/lib/wgc-gold-observations.json`; do not commit the raw workbooks. Aggregate public display is controlled by `WGC_CENTRAL_BANK_GOLD_PUBLIC_USE_CONFIRMED` and `WGC_GOLD_ETF_PUBLIC_USE_CONFIRMED`. Individual-country display additionally requires `WGC_CENTRAL_BANK_GOLD_COUNTRY_DISPLAY_CONFIRMED=true` and should remain disabled until the applicable permission is confirmed. The anonymous cron downloader is not an authenticated WGC service and does not replace this import step.

### Industrial silver demand

The Silver dashboard uses The Silver Institute / Metals Focus [World Silver Survey 2026](https://silverinstitute.org/wp-content/uploads/2026/04/World-Silver-Survey-2026.pdf#page=11), "Silver Supply and Demand", Industrial (total), printed page 9 / PDF page 11. Its nine annual global flow observations cover 2017-2025 in million troy ounces. The 2026 forecast is excluded; 2025 demand is 657.4 Moz, down 3.2% from the same edition's revised 2024 total of 679.0 Moz.

After confirming the deployment is covered by the approved rights record, set server-only `SILVER_INDUSTRIAL_DEMAND_PUBLIC_USE_CONFIRMED=true`. To regenerate the bundled snapshot:

```powershell
cd web
npm run import:silver
# Or use a previously downloaded copy of the same official edition:
npm run import:silver -- "C:\path\to\World-Silver-Survey-2026.pdf"
```

The importer downloads the pinned report on demand, validates its headings, industrial-total, photovoltaic, mine-production and global ETP rows, excludes forecasts, and writes `web/src/lib/silver-industrial-observations.json` with source URL, pages, edition, retrieval time and PDF SHA-256. It checks that PV demand is a subset of industrial demand before saving the snapshot. It does not save the raw PDF. The PDF extraction dependency is development-only; deployed requests use the bundled snapshot, not an external PDF download. Re-import and rebuild to refresh; this is not a scheduled live API. A new edition requires reviewing the pinned source/page/year schema and tests. Exact publication day and revision status remain unknown.

Annual comparisons require the exact prior calendar year; missing years never fall back to samples. Freshness allows 16 calendar months after year-end (2025 remains fresh through April 2027), then excludes the factor from scoring until refreshed. Industrial demand retains its existing 20% factor weight. Silver's aggregate score now permits partial coverage as described in its scoring policy above.

### Solar silver demand

The same importer now also loads the survey's "of which photovoltaics" sub-row into `solarObservations` in the shared snapshot. It measures global physical silver consumption in PV manufacturing, not installed solar capacity. The nine actual years cover 2017-2025; latest demand is 186.6 Moz in 2025 versus 197.5 Moz in 2024, down 5.5%. Forecasts are excluded.

Enable the approved deployment with server-only `SILVER_SOLAR_DEMAND_PUBLIC_USE_CONFIRMED=true`; this gate is independent of industrial-demand permission. Refresh both series using `npm run import:silver`, then rebuild. PV uses its own `SILVER-SOLAR-DEMAND` provenance and the same annual freshness/comparison rules. Attribution is "The Silver Institute / Metals Focus", with a link to the source report.

PV is a subset of industrial demand, not an additional non-overlapping physical total. The model preserves its existing correlated-factor weights (industrial 20%, solar 15%) and discloses the overlap in the indicator explanations and PV source label.

### Silver Tier 2 feeds

All four Tier 2 indicators are mapped to approved sources, with independent server-side permission flags:

| Indicator | Source and frequency | Permission flag |
| --- | --- | --- |
| Global silver ETP holdings (year-end) | World Silver Survey 2026, Appendix 22, printed page 82 / PDF page 84; annual global physically backed ETP stock | `SILVER_ETP_HOLDINGS_PUBLIC_USE_CONFIRMED` |
| Mine supply | Same survey, Mine Production on PDF page 11; annual global flow | `SILVER_MINE_SUPPLY_PUBLIC_USE_CONFIRMED` |
| Ten-year breakeven inflation | FRED `T10YIE`; daily percent levels, percentage-point changes | `FRED_T10YIE_PUBLIC_USE_CONFIRMED` |
| Managed-money net positioning | CFTC `72hh-3qpy`, COMEX Silver contract `084691`, Disaggregated Futures Only; weekly net contracts / 1,000 | `CFTC_COT_SILVER_PUBLIC_USE_CONFIRMED` |

Set each flag to `true` only for deployments covered by its approved rights-register record. FRED also requires the server-side `FRED_API_KEY`. FRED and CFTC fetch without caching; CFTC raw responses are not archived, and FRED archival remains separately gated. Gold continues to use five-year `T5YIE` and contract `088691`.

The owner selected annual global ETP holdings, not a single-fund proxy or live data. The appendix's Total Holdings (Moz) is rounded to whole Moz; it reports 1,318 Moz at end-2025 versus 1,045 Moz at end-2024. Credit The Silver Institute / Metals Focus and the table's sources, respective ETP providers / Bloomberg. Mine output is 846.6 Moz in 2025 versus 823.6 Moz in 2024; recycling and forecasts are excluded. Both series cover 2017-2025 and refresh alongside industrial/solar via `npm run import:silver`, followed by a rebuild. ETP provenance is a year-end stock, not an annual flow. Annual series use the same 16-month lag and exact prior-year comparison policies; daily/weekly feeds use a 14-day freshness limit.

Existing weights remain ETP 10%, mine 10%, breakeven 5%, positioning 5%. Industrial and solar add 35%; approved real rates (20%) and the broad dollar index (15%) bring possible coverage to 100%. Silver no longer requires 80% coverage or particular Tier 1 factors: any positive eligible weight produces a score normalized over available factors, with coverage disclosed. This partial score may differ substantially from the full model. Missing, denied or stale data remain excluded and never fall back to samples. Gold's publication policy is unchanged.

### Copper partial score

The owner selected enabling only the existing FRED real-rate (`DFII10`, 10% weight) and Nominal Broad U.S. Dollar Index (`DTWEXBGS`, 10%) feeds. Their existing server-side public-use flags and `FRED_API_KEY` apply; no new credentials or permission flags are needed. Both use uncached requests, the existing 14-day freshness limit and valid YoY comparisons.

Copper permits any positive eligible coverage, with no minimum-coverage or required-factor publication gates, and normalizes available factor weights to 100%. With both existing feeds healthy, the displayed score covers only 20% of the configured model, not the full copper-demand/supply picture. If one feed is unavailable, the other may still publish at 10% coverage; if neither is eligible, the score remains unavailable. Coverage and excluded original weight remain visible. Refined demand, China PMI, exchange inventories, mine supply, energy-transition demand and Copper CFTC positioning remain unimplemented and excluded; samples never contribute. This change does not implement those six feeds.

### Oil verified feeds and partial score

The owner selected seven verifiable factors, allowing annual OPEC spare capacity while leaving global refinery throughput unavailable:

| Factor / original weight | Source and reporting basis |
| --- | --- |
| Global demand / 20% | EIA STEO Table 3a `PATC_WORLD`: world petroleum and other liquids consumption, monthly average million barrels/day |
| Global supply / 20% | Same table `PAPR_WORLD`: world petroleum and other liquids production, monthly average million barrels/day |
| Commercial inventories / 15% | Same table `PASC_OECD_T3`: OECD end-of-period commercial crude oil and other liquids stocks, million barrels; not U.S. weekly inventories |
| Spare capacity / 15% | EIA STEO Fig6 `COPS_OPEC`: OPEC surplus crude oil production capacity, annual-average historical estimates, million barrels/day |
| Broad dollar / 10% | FRED `DTWEXBGS`, existing permission flag and server-side FRED key; not ICE DXY |
| Geopolitical risk / 5% | Caldara-Iacoviello monthly Recent GPR, CC BY 4.0; `GPR_CI_PUBLIC_USE_CONFIRMED=true` |
| WTI positioning / 5% | CFTC `72hh-3qpy`, contract `067651` (WTI Physical, NYMEX), Disaggregated Futures Only, Managed Money long minus short / 1,000; `CFTC_COT_WTI_PUBLIC_USE_CONFIRMED=true` |

EIA public downloads [STEO_m.xlsx](https://www.eia.gov/outlooks/steo/xls/STEO_m.xlsx) and [Fig6.xlsx](https://www.eia.gov/outlooks/steo/xls/Fig6.xlsx) require no EIA key. Both editions must match. Table series/units/scope are validated and only months explicitly marked historical in the `Dates` sheet are accepted. Spare-capacity years require twelve historical months in that calendar; the current year and future forecasts are excluded. These historical figures are EIA estimates, not final measurements. Monthly inputs use a two-calendar-month lag limit; annual capacity uses sixteen months after year-end and exact prior-year comparisons. CFTC/FRED use fourteen-day freshness. Successful EIA downloads are cached for one hour in memory, not archived; request/parser failures are logged and excluded, never replaced with samples. Retrieval dates are not publication dates; exact publication/revision metadata remains unknown. No dependency or EIA API key was added.

With all seven healthy, eligible original coverage is **90%**, not the full eight-factor model. Any positive eligible coverage publishes a normalized partial score; zero yields no score. The remaining 10% refinery factor has no verified accessible global feed and its sample values/charts stay hidden. No U.S.-only or incomplete-country substitute is used. Separate weekly U.S. inventory context still requires `EIA_API_KEY`; the named-contract WTI futures curve remains unavailable.

The default factor score is `clamp(50 + 50 * year_over_year_change * direction / scale, 0, 100)`, comparing observations at the source's reporting frequency. Percentage changes divide by the absolute previous value; legacy annual samples treat a zero prior value as neutral, while sourced zero baselines are unavailable. Percentage-point and index-point changes use the raw difference. With full coverage, the Macro Score is the rounded sum of `factor_score * weight / 100`.

Sourced factors use dated observations and an equivalent reporting-period comparison, not adjacent daily values. FRED missing/blank rows are omitted, never parsed as zero yields. Daily sourced observations older than five calendar days, missing feeds, or unusable YoY comparisons are unavailable. M2 uses the separate monthly policy below. Seeded values are never used as a fallback. Eligible weights are rescaled only after publication gates pass; otherwise aggregate contributions and total are withheld. Score headers disclose eligible approved weight and excluded original weight. Sample/reference weight is a subset of excluded weight, not an additional contribution. Confidence is a separate concept and is not generated for a withheld aggregate.

FRED observations preserve reporting-period start/end and label, source series/provider/URL, raw and normalized units/value conversion, geography, stock/rate semantics, aggregation, seasonal adjustment and retrieval time. The CSV does not supply exact publication times, vintage identifiers or revision status: those fields remain explicitly unknown, not guessed from retrieval or archive-capture time. Forecast-marked, future-release and inconsistent conversion metadata is rejected. The CSV alone is not adequate for publication-vintage historical backtests.

Gold's U.S. M2 factor uses monthly seasonally adjusted `M2SL`, a monthly average stock level in USD billions converted to USD trillions with multiplier 0.001. Its source date identifies the month, not publication; the normalized timeline uses the reporting-period end and the UI displays the reporting month. Monthly/quarterly/YoY comparisons match exact reporting months rather than a nearby previous observation, so missing months are unavailable. M2 freshness requires a completed reference month at most two calendar months behind the current month AND a matching official H.6 release-period check made within the last 24 hours. Unknown/failed/expired release evidence makes health unavailable; a lagging or mismatched feed is stale. Gold's five-year breakeven uses `T5YIE` in percent with point changes; Silver separately uses ten-year `T10YIE`, also with point changes, never substituted by the five-year series.

### Release Evidence and Optional Archive

H.6 checks use the Federal Reserve's [structured release-date index](https://www.federalreserve.gov/releases/h6/releaseDates.json), the same resource its release page uses. The latest listed nonfuture date selects a dated official release; its declared date and Table 1 reference month must agree with the FRED observation. This is an actual-release check, not an inferred fourth-Tuesday or holiday calendar. The small calendar requests bypass HTTP caching so the displayed check time records a real check. Permitted FRED series are also fetched without caching. This verifies the reference month, not every value or revision; it does not populate exact observation publication timestamps, clear third-party rights, or grant scoring approval.

### Provider Rights Gate

Yahoo Finance's [terms](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html) prohibit automated collection without express prior permission and limit reuse; Yahoo also states that financial quotes may be third-party content. Yahoo requests are disabled unless both `YAHOO_FINANCE_AUTOMATED_ACCESS_CONFIRMED=true` and `MARKET_DATA_PUBLIC_DISTRIBUTION_CONFIRMED=true` are set after permission and underlying quote rights have been documented.

FRED's [terms](https://fred.stlouisfed.org/legal/) apply source-specific restrictions and prohibit storing, caching, or archiving FRED content by default. The current [M2SL page](https://fred.stlouisfed.org/series/M2SL) tags that series Public Domain: Citation Requested; [T5YIE](https://fred.stlouisfed.org/series/T5YIE) is tagged Copyrighted: Citation Required; DFII10's page showed no copyright tag in the current review. These tags do not remove FRED's service terms. Each feed is disabled unless its corresponding `FRED_<SERIES>_PUBLIC_USE_CONFIRMED=true` permission record is approved. When permitted, FRED requests bypass caching. FRED publication rights and archival rights are separate.

EIA's [copyright policy](https://www.eia.gov/about/copyrights_reuse.php) permits use and distribution of its public-domain data with source acknowledgment, and its [API terms](https://www.eia.gov/opendata/terms-of-service.php) permit services that display, analyze, retrieve, or view EIA data. The current EIA inventory card names `U.S. Energy Information Administration (EIA)` and its series. Protected third-party material, if present, remains excluded from that general permission.

Permission environment flags are operator assertions, not legal determinations. Record the evidence, scope, attribution, expiration/review date and matching flag in [DATA_RIGHTS_REGISTER.md](DATA_RIGHTS_REGISTER.md). Keep flags false until the exact series, acquisition method, public display, derived outputs, cache period and third-party rights are covered. The Yahoo Finance permissions form is linked from its [permissions page](https://legal.yahoo.com/us/en/yahoo/permissions/requests/index.html).

Raw FRED response archival is **off by default**. FRED's terms prohibit storage/cache/archive absent permission, so do not enable this migration for FRED data until written archival permission is recorded for each series. To enable an approved series in a staging environment:

1. Apply [web/supabase/migrations/20261111010000_source_snapshot_archive.sql](web/supabase/migrations/20261111010000_source_snapshot_archive.sql) after the existing migrations. No application startup applies it automatically.
2. Set server-only `SUPABASE_URL`, a new-format `SUPABASE_SECRET_KEY` (`sb_secret_...`), `SOURCE_ARCHIVE_ENABLED=true`, and `FRED_ARCHIVE_PERMITTED_SERIES` to only the series with explicit archival permission. Also set that series' `FRED_<SERIES>_PUBLIC_USE_CONFIRMED=true`. Never put the secret in a `NEXT_PUBLIC_*` setting. Normal login continues using the existing SSR client.
3. Request a sourced dashboard and confirm "Raw response archive: Retained" in Source metadata. "Not enabled" and "Retention failed" explicitly mean that response has not been confirmed retained by this request. A missing migration/configuration or failed write cannot claim successful storage.

The restricted migration stores immutable UTF-8 CSV response text, SHA-256 integrity hashes, parser/normalization definitions and database-assigned first-capture dates. A server-only atomic function appends content-change capture events, including reversions to an earlier response, without overwriting earlier captures. Identical adjacent responses do not create duplicate events. Browser roles have no table access; the server role has read access and the append function, not update/delete grants. Hashes detect alteration, not publisher authenticity. Never expose the admin client or raw archive through an unauthenticated API. The migration and writer stay unusable for a FRED series until that series appears in the explicit archival-permission allowlist.

Capture is request-driven, not a scheduled ingestion service. Permitted FRED requests bypass HTTP caching, but archive writes additionally require per-series archival permission. A capture proves only what the app received at that time, not when the provider first published it. Per-check added/changed/removed row counts compare raw source dates/values; an initial capture adds the baseline and these counts are not provider revision labels or economic changes. Private `archivedSnapshotKnownAt` replay selects only captures at or before the requested time and rechecks integrity; it returns no invented history before the first capture. Failed captures create gaps. No historical vintages are backfilled, and the archive does not make pre-capture backtests point-in-time safe.

The migration has not been applied to a live project, and database execution/permissions require staging verification. Archive error handling and source/revision logic have automated coverage; no live storage certification, source license, or dataset approval is implied.

Sourced-only configurations can supply dated observations without placeholder annual `values`/`years`. Sample arrays remain supported for reference and explicit internal research fixtures. Chart props contain only plotting fields; Recent Changes receives only the history needed for supported comparisons, rather than duplicate full provenance histories.

Every indicator shows a Data Health block with source/link, observation date or sample year, frequency, and a recent/stale/unavailable/illustrative status. Weekly context histories use a ten-day freshness allowance; EIA uses fourteen days. Source quotes may be delayed. Source outages are handled independently, so one failed feed does not prevent other factors rendering. Sourced charts retain up to ten years of observations. Freshness is assessed on observation time, not the current page-load time; sample datasets are explicitly labeled, not treated as fresh.

Derived context cards inherit every required dependency's health and expose the component observation dates in a collapsible Data Health disclosure. A chart-end or retrieval timestamp cannot establish freshness. Current ratio values and impact labels are suppressed if either quote source or the aligned historical reference is stale/missing; Oil uses a five-day dependency allowance and the weekly Gold/Silver/Copper ratios use ten days. Historical reference charts may remain visible but are not evidence of a valid current value.

Gold/S&P and Gold/Oil comparison baselines are arithmetic means of trailing five-year aligned weekly closes; their charts show ten years and are labeled as weekly matched closes. Weekly YoY references must be within ten days before the exact one-year target, otherwise the comparison is unavailable. Header daily return uses Yahoo's exchange timezone and regular-market timestamp to choose the previous session close: a same-session daily bar is treated as in progress, while an older last bar is the latest available close. Live Gold, Silver and Copper ratios are shown only when both current quotes identify the same exchange-local session. Missing timezone/session metadata fails closed for the combined value.

Zero is a valid prior real-yield reference for point changes; only a missing observation is unavailable. Factor labels, aggregate status, narrative direction and confidence use the same configured bullish/bearish thresholds with a `1e-10` floating-point boundary tolerance. Under current thresholds, 40 is bearish and values numerically indistinguishable from 60 are bullish. These correctness rules do not certify inputs or approve scoring datasets.

Silver's Monetary Stress Index now calculates all three changes at one common as-of time, the oldest latest available component observation. Each component's current and 90-day reference observations must be on or before that calculation time and within the applicable carry-forward bound: ten days for the weekly Gold/DXY histories and fourteen days for daily FRED yields. Daily FRED score inputs and real-rate context use the same fourteen-day freshness window. Zero/negative real yields are valid point-change inputs; percentage price inputs need positive reference/current values. Actual used component dates are checked against the current request time, and no future observation is used. Missing/stale inputs or unusable comparisons withhold the current stress value, impact and meter. Historical stress-chart points use the same bounded evaluator at their own calculation dates, so old inputs cannot be extended across long gaps. This does not resolve other audit findings about reference-average windows, header trading-session alignment or release/vintage metadata.

The score coverage information tooltip explains the sourced-only policy, explicit approvals, critical-factor requirements and excluded-weight accounting. Source freshness labels do not imply approval, independent certification, forecast accuracy or validated model weights.

When a sourced DXY or real-rate score factor is configured, its duplicate context card is omitted. The score-factor card retains a secondary 90-day change from the same observation history, using the latest observation on or before 90 days earlier with a seven-day reference tolerance. Real-rate changes use percentage points, including a valid zero-yield reference; DXY uses percentages. Missing/stale data remains unavailable. This display change does not change score weights or the annual scoring horizon.

For a publishable score, Top Drivers ranks the signed contribution `(factor_score - neutral_baseline) * effective_weight / 100`, before rounding. Effective weights equal configured weights at full coverage and are rescaled only after approval/coverage gates pass. Positive and negative lists show up to three factors each, largest absolute impact first; neutral factors are excluded and ties use indicator IDs. Withheld scores have no driver contributions. For published scores, signed impacts across all factors sum to the unrounded score minus the neutral baseline.

Run the focused engine and configuration tests with `npm --prefix web run test:commodities`. Tests cover ranking, ties, neutral/zero/negative inputs, validation, all four existing scores, and an additional configuration-only commodity with no context fetch and a mocked price feed.

Score Drivers and Recent Changes share one keyboard-accessible tabbed section below the Macro Summary. Only the selected panel is visible; arrow keys and Home/End navigate tabs. The reusable `WhatsChangedCard` is in Recent Changes. It accepts `commodity`, indicator metadata (including favorable direction), `weights`, `currentValues`, and `historicalValues`, plus the UI locale. Observations use `{ time, value }` with Unix timestamps in seconds. The adapter passes actual sourced histories or explicit sample histories to the same change engine.

The selected tab and preferred comparison period are saved per browser under `macro-metals.dashboard.driver-tab` and `macro-metals.dashboard.change-period`, shared across commodities. Stored values are validated, server rendering uses safe defaults, and storage-disabled browsers retain working in-memory controls. If the preferred period lacks suitable observations on a page, a usable period is shown without overwriting the saved preference.

Monthly, quarterly and YoY comparisons use calendar lookbacks of 1, 3 and 12 months. Month-end dates are clamped to the destination month's last day. The reference is the latest observation on or before the comparison date, with maximum staleness of 7, 14 and 31 days respectively. Missing or stale references and zero percentage baselines are unavailable; histories are never interpolated. Public Recent Changes accepts only approved, fresh sourced factors with usable comparisons. Sample and unapproved factors are excluded. Explicit internal research fixtures can still exercise annual sample comparisons.

Developments rank by `indicator_weight * abs(period_change)`, using configured percentage or point changes without normalization. Favorable direction determines positive/negative grouping, independently of the numeric sign; unchanged indicators are omitted. Each direction shows up to three developments and includes hover/focus tooltips. This ranking is distinct from Top Drivers' normalized score-point contributions and does not alter the Macro Score. Mixed-unit magnitudes are a heuristic, not directly comparable physical quantities.

`MacroSummaryCard` appears between the Macro Score and the tabbed driver section. For a publishable public score, its separate deterministic generator uses only eligible approved factor scores and trends, the top three positive and top two negative weighted score contributors, and optional commodity framing in `summaryTone`. It makes no network calls or AI model requests. When the score is withheld, an explanation replaces the outlook, confidence badge and narrative. The card can accept an already generated `result` without changing its presentation.

Summary outlook bands are strongly bullish above 80, bullish from 60 through 80, neutral from 40 through 59, bearish from 20 through 39, and strongly bearish below 20. Confidence is the fraction of total configured weight whose valid indicator scores agree with that outlook, using configured bullish/bearish factor thresholds: high at 70% or more, medium at 50% to below 70%, otherwise low. Missing scores remain in the denominator and do not inflate confidence. Confidence measures agreement, not data freshness or forecast reliability. Instead of a timestamp, each summary displays its active-indicator count: distinct indicators with a valid score in [0, 100] and a finite positive weight. Neutral and zero scores count; missing/invalid scores and zero-weight entries do not. Annual sample narratives remain explicitly labeled illustrative.

Every indicator card includes a Price Relationship section after its interpretation. Optional `priceRelationships` configuration maps indicator IDs (including context-card IDs) to coefficients in [-1, 1]. Initially, only the supplied Gold examples are configured: ETF holdings +0.81, DXY -0.74, real rates -0.65, central-bank purchases +0.48 and M2 +0.55. They are illustrative, not independently verified estimates; no sample period, methodology or source was provided. Missing/invalid coefficients remain unavailable rather than being substituted with zero or invented values for other commodities.

Relationship strength uses signed boundaries of +/-0.30 and +/-0.70. Absolute correlation determines stars: 0.80+ five (Very High), 0.60+ four (High), 0.40+ three (Medium), 0.20+ two (Low), otherwise one (Minimal). A genuine zero is weak/minimal; an unavailable coefficient has no star rating. These ratings are separate from score weights and bullish/bearish impacts. Hover/focus tooltips describe the indicated direction and clarify that correlation does not establish causation or constitute a price forecast.

### Gold

Gold is treated as a monetary asset. Falling 10-year real yields and a weaker U.S. dollar are generally supportive. Gold/S&P compares gold with equities; Gold/Oil estimates how many oil barrels one ounce of gold can buy; Gold/Silver shows gold's relative strength against silver. These relationships provide context, not forecasts.

### Silver

Silver has both monetary and industrial uses. Real yields and the U.S. dollar provide the same broad macro backdrop as for gold. The Gold/Silver ratio is ounces of silver per ounce of gold: a higher ratio means silver is relatively cheaper than gold, while a lower ratio means silver has outperformed. This ratio alone is not a forecast.

### Copper

The Copper page tracks copper futures (`HG=F`, USD per pound), real rates (`DFII10`), DXY, and the copper/gold price ratio. Its ratio divides the copper price per pound by the gold price per troy ounce; it is not a comparison of equal physical weights. The five-year average uses matching weekly closing dates. Price momentum and ratio trend compare the latest historical close with the last observation on or before 90 days earlier; changes greater than 1% in either direction are classified as rising or falling. Copper's momentum impact follows the same threshold; the ratio's impact uses a 5% deviation from its five-year average. The indicators are heuristics, not forecasts.

### Oil

The Oil page uses Yahoo Finance WTI (`CL=F`), Brent (`BZ=F`), gold (`GC=F`) futures and DXY (`DX-Y.NYB`). Prices are futures, not spot prices. The 90-day change compares the latest daily close to the latest close at least 90 days earlier. Gold/oil divides matched daily gold and WTI futures closes, comparing the latest ratio with the arithmetic mean of up to five years of matched daily ratios; its oil impact uses a 5% threshold. WTI momentum and ratio trends use a 1% threshold, and DXY uses 0.75%.

EIA series `WCESTUS1` measures U.S. commercial crude inventories excluding the Strategic Petroleum Reserve. Weekly change is the difference between consecutive weekly observations, in million barrels. The seasonal average is the arithmetic mean of the weekly changes closest to the same calendar date in each of the previous five years, within four days. It is unavailable unless all five are present. A change more than 0.1 million barrels below or above the average is interpreted as supportive or negative, respectively. Obtain a free EIA API key at https://www.eia.gov/opendata/register.php and set server-only `EIA_API_KEY` locally and in the Vercel project; redeploy after configuring it. Without a key or when EIA cannot be reached, inventory is unavailable.

The futures spread card is unavailable until a current, reliable source of two identified WTI maturities is integrated. EIA discontinued its futures series after April 5, 2024. The intended spread is near contract minus later contract: positive indicates backwardation and negative indicates contango. Observation dates and stale markers are shown per card; market observations older than five days and inventory observations older than fourteen days are marked stale. Data and interpretations are not forecasts.

### Sampling and formulas

Yahoo Finance chart data is sampled from five years of weekly closes for gold futures (`GC=F`), silver futures (`SI=F`), WTI crude futures (`CL=F`), the U.S. Dollar Index (`DX-Y.NYB`), and the S&P 500 (`^GSPC`). Ratio history uses only dates present in both series. Ratio averages are arithmetic means of those aligned weekly observations. Current ratios use the latest available quotes.

Real rates use FRED `DFII10`, the 10-year Treasury inflation-indexed security yield, sampled daily. Trend changes compare the latest observation with the nearest available observation 90 calendar days earlier. Real rates are measured in percentage points; DXY and ratio trends are measured as percentages. Impact labels use a 0.1 percentage-point threshold for real rates, a 0.75% threshold for DXY, and a 5% deviation from the historical ratio average.

The Monetary Stress Index maps each input to 0-100 using `clamp(50 + 50 * adjusted_change / scale, 0, 100)`, then weights gold momentum at 40%, real rates at 35%, and DXY at 25%. Adjusted signals are gold's 90-day return, the negative 90-day real-rate change (scale 0.75 percentage points), and the negative 90-day DXY return. Gold momentum is scaled by 12% and DXY by 5%. The rounded score bands are Low (<25), Moderate (<50), Elevated (<75), and High (75-100).

### Data refresh

Yahoo Finance and FRED requests are disabled until source-specific reuse permission is recorded; permitted requests bypass caching. EIA data is cached for up to six hours. Yahoo futures and index quotes may be delayed; continuous futures contracts are not spot prices. Missing, blocked, or failed feeds display as unavailable rather than being replaced with invented data.

### Legal disclaimer

**English:** For informational and educational purposes only. This material is not investment, financial, legal, or tax advice, and is not a recommendation to buy, sell, or hold any asset. Data may be delayed, incomplete, or revised; indicator interpretations are heuristic and can be wrong. Do your own research and consult a qualified professional. Past performance does not guarantee future results.

**Türkçe:** Yalnızca bilgilendirme ve eğitim amacı taşır. Bu içerik yatırım, finans, hukuk veya vergi tavsiyesi ya da herhangi bir varlığı alma, satma veya elde tutma önerisi değildir. Veriler gecikmeli, eksik veya sonradan düzeltilmiş olabilir; gösterge yorumları sezgiseldir ve hatalı çıkabilir. Kendi araştırmanızı yapın ve yetkin bir uzmana danışın. Geçmiş performans gelecekteki sonuçları garanti etmez.

Email login is passwordless by default. Replies, voting, likes, forums, messaging, AI chat, and paid subscriptions are not implemented.
