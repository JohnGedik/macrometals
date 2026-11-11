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
2. Apply [`web/supabase/migrations/20261107000000_initial_schema.sql`](web/supabase/migrations/20261107000000_initial_schema.sql), then [`web/supabase/migrations/20261111000000_community_publishing.sql`](web/supabase/migrations/20261111000000_community_publishing.sql), in order, in the Supabase SQL editor or with the Supabase CLI.
3. In Supabase Authentication, enable Google and email providers. Email login uses a passwordless sign-in link. Add `http://localhost:3000/auth/callback` and the deployed callback URL to the allowed redirect URLs.
4. Configure the Google OAuth client ID and secret in Supabase, and set its callback URL to the Supabase-provided Google provider callback.

Profile and comment ownership is enforced by row-level security. Avatar uploads are limited to the signed-in user's storage folder. Newsletter addresses can be inserted but are not readable through the public API.

The Next.js site uses `@supabase/ssr` for its cookie-based login flow. `@supabase/server` is available for custom API handlers that need verified JWTs and an RLS-scoped Supabase client; it does not replace `@supabase/ssr`. For those handlers, configure `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_JWKS_URL` in local `.env.local` and Vercel. `SUPABASE_SECRET_KEY` is optional and must remain server-only; it bypasses RLS and is not required for normal user authentication.

## Routes

- `/` publication home
- `/articles/[slug]` article, comments, share links, and social metadata
- `/community` member-published articles with latest, top-rated, most-viewed, and trending sorts
- `/write` create articles and drafts; `/write/[slug]` edit your own articles
- `/tag/[tag]` related articles
- `/search?q=...` article content, title, summary, category, author, and tag search
- `/author/[slug]` author profile and articles
- `/profile/[username]` public member profile, published articles, and received votes
- `/login` Google or email-link sign-in
- `/profile` signed-in profile and avatar editor, draft list, and writing link

## Writing articles

Each article is a Markdown document at `web/content/articles/<slug>/index.md`. YAML frontmatter defines its `id`, `slug`, `title`, `summary`, `coverImage`, `publishedAt`, `tags`, and `author`; the document body supports standard Markdown. Keep the article `id` aligned with its row in the Supabase `articles` table so comments continue to reference the correct article.

To provide a Turkish translation, add `index.tr.md` in the same article directory with matching `id`, `slug`, `tags`, and author identity. Translate the title, summary, author bio, and body. If `index.tr.md` is absent, that article displays in English while the rest of the interface remains Turkish.

Members can publish Markdown articles from `/write`. Drafts are private to their author; publishing makes the article available in the Community feed and existing article routes. Voting is one vote per account per article; selecting the active direction removes the vote, and selecting the opposite direction changes it. Commenting continues to use the existing flat comment system.

## Macro indicator methodology

### Commodity configuration and Macro Scores

All commodity dashboards use the registry in [`web/src/lib/commodity-config.ts`](web/src/lib/commodity-config.ts), the pure score engine in [`web/src/lib/commodity-score.ts`](web/src/lib/commodity-score.ts), and the same `/tag/[tag]` route and renderer. Configured DXY and real-rate factors fetch sourced observations, but source availability is not approval for scoring. Remaining annual histories are illustrative samples, not verified or live market data. Market/EIA context cards are not additional score factors.

Public dashboards use a fail-closed `scoringPolicy`: `mode: "sourced-only"`, `minimumCoverage: 80`, all Tier 1 factors required, and an explicit `approvedIndicators` allowlist. No inputs have been approved by the implementation itself; the current allowlists are empty. All four public Macro Scores are therefore withheld. Do not populate approvals until definition, data verification and permitted-use checks are completed. The 80% threshold is a conservative publication guardrail, not an empirically validated accuracy threshold. See [DATA_AUDIT.md](DATA_AUDIT.md) for the approval checklist and remaining issues.

Samples and unapproved inputs have null factor scores and zero contribution. They cannot influence aggregate score, confidence, narratives, score drivers or Recent Changes. Their values/charts remain visible as reference-only, with explicit exclusion notes. If eligible approved weight is below the minimum or a critical factor is missing, no aggregate number, bullish/bearish outlook, confidence badge or market narrative is published. Even a small set of approved factors is not silently presented as the full eight-factor model. Explicit `mode: "research"` remains available for internal fixtures; the public registry and route do not expose a research-mode switch.

A `CommodityConfiguration` contains:

- `commodity`: a URL slug, such as `natural-gas`.
- `indicators`: localized names, interpretations, unit suffixes/prefixes, tier, display precision, change kind, and values aligned to `years`.
- `weights`: indicator ID to percentage weight; weights must total 100.
- `scoreRules`: neutral baseline, sensitivity, bullish/bearish thresholds, and per-indicator favorable direction, positive scale, and trend threshold.
- `market`: a Yahoo Finance symbol and display unit for the shared price header. Failed feeds remain unavailable.
- Localized name, dashboard/score titles, disclosure, source, refresh policy, and methodology.
- Optional `contextProvider`: one of the existing legacy market contexts. Omit it for a new commodity unless that context is appropriate; no context is fetched by default.
- Optional `scoreSources`: maps indicator IDs to `dxy` (Yahoo Finance `DX-Y.NYB`) or `real-yields` (FRED `DFII10`). Gold, Silver and Copper use both; Oil uses DXY. These feeds need no API key.

To add Platinum, Palladium, Uranium, Natural Gas, or Steel, register a new configuration under its slug with suitable data and metadata. No new route, score function, or dashboard component is needed. New external data feeds may still require adapters; registration does not invent missing prices or historical observations. The existing seed files are mapped into the normalized configuration, including `weights` and `scoreRules`.

The default factor score is `clamp(50 + 50 * annual_change * direction / scale, 0, 100)`. Percentage changes divide by the absolute previous value; the legacy annual samples treat a zero prior value as neutral, while sourced zero baselines are unavailable. Percentage-point and index-point changes use the raw difference. With full coverage, the Macro Score is the rounded sum of `factor_score * weight / 100`.

Sourced factors use the latest dated observation and a calendar-year comparison, not adjacent daily values. FRED missing/blank rows are omitted, never parsed as zero yields. Sourced observations older than five calendar days, missing feeds, or unusable YoY comparisons produce an unavailable factor score; seeded values are never used as a fallback. Eligible weights are rescaled only after the publication gates pass; otherwise aggregate contributions and total are withheld. Score headers disclose eligible approved weight and excluded original weight. Sample/reference weight is a subset of excluded weight, not an additional contribution. Confidence is a separate concept and is not generated for a withheld aggregate.

Every indicator shows a Data Health block with source/link, observation date or sample year, frequency, and a recent/stale/unavailable/illustrative status. Weekly context histories use a ten-day freshness allowance; EIA uses fourteen days. Source quotes may be delayed. Source outages are handled independently, so one failed feed does not prevent other factors rendering. Sourced charts retain up to ten years of observations. Freshness is assessed on observation time, not the current page-load time; sample datasets are explicitly labeled, not treated as fresh.

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

Yahoo Finance requests use a 15-minute server cache. FRED requests use a six-hour cache, while the underlying real-yield series is published daily. Yahoo futures and index quotes may be delayed; continuous futures contracts are not spot prices. Missing or failed feeds display as unavailable rather than being replaced with invented data.

### Legal disclaimer

**English:** For informational and educational purposes only. This material is not investment, financial, legal, or tax advice, and is not a recommendation to buy, sell, or hold any asset. Data may be delayed, incomplete, or revised; indicator interpretations are heuristic and can be wrong. Do your own research and consult a qualified professional. Past performance does not guarantee future results.

**Türkçe:** Yalnızca bilgilendirme ve eğitim amacı taşır. Bu içerik yatırım, finans, hukuk veya vergi tavsiyesi ya da herhangi bir varlığı alma, satma veya elde tutma önerisi değildir. Veriler gecikmeli, eksik veya sonradan düzeltilmiş olabilir; gösterge yorumları sezgiseldir ve hatalı çıkabilir. Kendi araştırmanızı yapın ve yetkin bir uzmana danışın. Geçmiş performans gelecekteki sonuçları garanti etmez.

Email login is passwordless by default. Replies, voting, likes, forums, messaging, AI chat, and paid subscriptions are not implemented.
