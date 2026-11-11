alter table public.profiles add column username text;
update public.profiles set username = slug where username is null;
alter table public.profiles alter column username set not null;
create unique index profiles_username_lower_idx on public.profiles (lower(username));
grant select (username) on public.profiles to anon, authenticated;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique
);

insert into public.categories (name, slug) values
  ('Gold', 'gold'), ('Silver', 'silver'), ('Oil', 'oil'), ('Copper', 'copper'),
  ('Macro', 'macro'), ('Inflation', 'inflation'), ('Debt', 'debt'), ('Dollar', 'dollar'),
  ('Central Banks', 'central-banks'), ('Geopolitics', 'geopolitics')
on conflict (slug) do nothing;

alter table public.articles
  add column content_markdown text,
  add column content_html text,
  add column featured_image text,
  add column language text not null default 'en' check (language in ('en', 'tr')),
  add column category_id uuid references public.categories (id) on delete set null,
  add column updated_at timestamptz not null default now(),
  add column view_count bigint not null default 0 check (view_count >= 0);

update public.articles
set content_markdown = body,
    featured_image = cover_image,
    updated_at = coalesce(published_at, created_at, now())
where content_markdown is null;

update public.profiles
set username = slug
where username is null or btrim(username) = '';

create table public.article_votes (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  vote_type smallint not null check (vote_type in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (article_id, user_id)
);

create index article_votes_article_idx on public.article_votes (article_id, vote_type);
create index articles_author_published_idx on public.articles (author_id, published_at desc) where published;
create index articles_category_published_idx on public.articles (category_id, published_at desc) where published;

create trigger articles_set_updated_at
before update on public.articles
for each row execute function public.set_updated_at();
create trigger article_votes_set_updated_at
before update on public.article_votes
for each row execute function public.set_updated_at();

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  profile_name text;
  profile_slug text;
begin
  profile_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(new.email, '@', 1)
  );
  profile_slug := trim(both '-' from regexp_replace(lower(profile_name), '[^a-z0-9]+', '-', 'g'));
  if profile_slug = '' then
    profile_slug := 'author';
  end if;
  if exists (select 1 from public.profiles where lower(slug) = lower(profile_slug)) then
    profile_slug := profile_slug || '-' || left(new.id::text, 8);
  end if;

  insert into public.profiles (id, email, display_name, avatar_url, slug, username)
  values (
    new.id,
    new.email,
    profile_name,
    new.raw_user_meta_data ->> 'avatar_url',
    profile_slug,
    profile_slug
  );
  return new;
end;
$$;

alter table public.categories enable row level security;
alter table public.article_votes enable row level security;

create policy "Categories are public" on public.categories
  for select to anon, authenticated using (true);
create policy "Authenticated users add tags" on public.tags
  for insert to authenticated with check (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(name) between 1 and 40
  );
create policy "Authors read their own drafts" on public.articles
  for select to authenticated using (author_id = (select auth.uid()));
create policy "Authenticated users create their own articles" on public.articles
  for insert to authenticated with check (author_id = (select auth.uid()));
create policy "Authors update their own articles" on public.articles
  for update to authenticated using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));
create policy "Authors delete their own articles" on public.articles
  for delete to authenticated using (author_id = (select auth.uid()));
create policy "Authors manage tags on their own articles" on public.article_tags
  for insert to authenticated with check (
    exists (select 1 from public.articles where id = article_id and author_id = (select auth.uid()))
  );
create policy "Authors remove tags on their own articles" on public.article_tags
  for delete to authenticated using (
    exists (select 1 from public.articles where id = article_id and author_id = (select auth.uid()))
  );
create policy "Users read their own votes" on public.article_votes
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Authenticated users vote as themselves" on public.article_votes
  for insert to authenticated with check (
    user_id = (select auth.uid()) and
    exists (select 1 from public.articles where id = article_id and published)
  );
create policy "Users change their own votes" on public.article_votes
  for update to authenticated using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid()) and
    exists (select 1 from public.articles where id = article_id and published)
  );
create policy "Users remove their own votes" on public.article_votes
  for delete to authenticated using (user_id = (select auth.uid()));

create function public.get_article_vote_summaries(article_ids uuid[])
returns table (article_id uuid, upvotes bigint, downvotes bigint, user_vote smallint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.id,
    count(v.id) filter (where v.vote_type = 1),
    count(v.id) filter (where v.vote_type = -1),
    coalesce(max(v.vote_type) filter (where v.user_id = auth.uid()), 0)::smallint
  from public.articles a
  left join public.article_votes v on v.article_id = a.id
  where a.id = any(article_ids) and a.published
  group by a.id;
$$;

grant execute on function public.get_article_vote_summaries(uuid[]) to anon, authenticated;

create function public.increment_article_view(target_article_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.articles set view_count = view_count + 1
  where id = target_article_id and published;
$$;

grant execute on function public.increment_article_view(uuid) to anon, authenticated;

revoke all on public.categories, public.article_votes from anon, authenticated;
grant select on public.categories to anon, authenticated;
grant select, insert, update, delete on public.articles to authenticated;
grant insert on public.tags to authenticated;
grant insert, delete on public.article_tags to authenticated;
grant select (article_id, user_id, vote_type) on public.article_votes to authenticated;
grant insert (article_id, user_id, vote_type), update (vote_type), delete on public.article_votes to authenticated;
