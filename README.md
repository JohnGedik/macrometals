# Macro Metals Monitor

An editorial macro research site focused on gold, silver, oil, and their relationships to the wider economy. The web app lives in [`web/`](web/).

## Run locally

```powershell
cd web
npm install
npm run dev
```

Open http://localhost:3000. The journal and seeded sample articles render without Supabase credentials; authentication, comments, profile storage, and newsletter persistence require a Supabase project.

## Supabase setup

1. Copy `web/.env.example` to `web/.env.local` and set `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the Supabase project settings.
2. Apply [`web/supabase/migrations/20261107000000_initial_schema.sql`](web/supabase/migrations/20261107000000_initial_schema.sql) in the Supabase SQL editor or with the Supabase CLI.
3. In Supabase Authentication, enable Google and email providers. Email login uses a passwordless sign-in link. Add `http://localhost:3000/auth/callback` and the deployed callback URL to the allowed redirect URLs.
4. Configure the Google OAuth client ID and secret in Supabase, and set its callback URL to the Supabase-provided Google provider callback.

Profile and comment ownership is enforced by row-level security. Avatar uploads are limited to the signed-in user's storage folder. Newsletter addresses can be inserted but are not readable through the public API.

The Next.js site uses `@supabase/ssr` for its cookie-based login flow. `@supabase/server` is available for custom API handlers that need verified JWTs and an RLS-scoped Supabase client; it does not replace `@supabase/ssr`. For those handlers, configure `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_JWKS_URL` in local `.env.local` and Vercel. `SUPABASE_SECRET_KEY` is optional and must remain server-only; it bypasses RLS and is not required for normal user authentication.

## Routes

- `/` publication home
- `/articles/[slug]` article, comments, share links, and social metadata
- `/tag/[tag]` related articles
- `/search?q=...` title, summary, and tag search
- `/author/[slug]` author profile and articles
- `/login` Google or email-link sign-in
- `/profile` signed-in profile and avatar editor

## Writing articles

Each article is a Markdown document at `web/content/articles/<slug>/index.md`. YAML frontmatter defines its `id`, `slug`, `title`, `summary`, `coverImage`, `publishedAt`, `tags`, and `author`; the document body supports standard Markdown. Keep the article `id` aligned with its row in the Supabase `articles` table so comments continue to reference the correct article.

To provide a Turkish translation, add `index.tr.md` in the same article directory with matching `id`, `slug`, `tags`, and author identity. Translate the title, summary, author bio, and body. If `index.tr.md` is absent, that article displays in English while the rest of the interface remains Turkish.

## Macro indicator methodology

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
