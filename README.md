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

Email login is passwordless by default. Replies, voting, likes, forums, messaging, AI chat, and paid subscriptions are not implemented.
