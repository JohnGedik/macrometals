create table public.article_translations (
  article_id uuid not null references public.articles (id) on delete cascade,
  language text not null check (language in ('en', 'tr')),
  title text not null check (char_length(btrim(title)) between 1 and 140),
  summary text not null check (char_length(btrim(summary)) between 1 and 300),
  body text not null check (char_length(btrim(body)) between 1 and 100000),
  content_markdown text not null check (char_length(btrim(content_markdown)) between 1 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (article_id, language)
);

insert into public.article_translations (article_id, language, title, summary, body, content_markdown)
select id, language, title, summary, body, coalesce(content_markdown, body)
from public.articles
where author_id is not null;

create trigger article_translations_set_updated_at
before update on public.article_translations
for each row execute function public.set_updated_at();

alter table public.article_translations enable row level security;

create policy "Translations on published articles are public"
on public.article_translations for select to anon, authenticated
using (
  exists (
    select 1 from public.articles
    where id = article_id and published
  )
);

create policy "Authors read their article translations"
on public.article_translations for select to authenticated
using (
  exists (
    select 1 from public.articles
    where id = article_id and author_id = (select auth.uid())
  )
);

create policy "Authors create their article translations"
on public.article_translations for insert to authenticated
with check (
  exists (
    select 1 from public.articles
    where id = article_id and author_id = (select auth.uid())
  )
);

create policy "Authors update their article translations"
on public.article_translations for update to authenticated
using (
  exists (
    select 1 from public.articles
    where id = article_id and author_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.articles
    where id = article_id and author_id = (select auth.uid())
  )
);

create policy "Authors delete their article translations"
on public.article_translations for delete to authenticated
using (
  exists (
    select 1 from public.articles
    where id = article_id and author_id = (select auth.uid())
  )
);

grant select on public.article_translations to anon;
grant select, insert, update, delete on public.article_translations to authenticated;
