create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  bio text not null default '',
  avatar_url text,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles (id) on delete set null,
  slug text not null unique,
  title text not null,
  summary text not null,
  body text not null,
  cover_image text,
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique
);

create table public.article_tags (
  article_id uuid not null references public.articles (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (article_id, tag_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.newsletter_subscribers (
  email text not null,
  created_at timestamptz not null default now()
);

create unique index newsletter_subscribers_email_lower_idx
  on public.newsletter_subscribers (lower(email));
create index articles_published_at_idx on public.articles (published_at desc) where published;
create index comments_article_created_idx on public.comments (article_id, created_at);
create index article_tags_tag_idx on public.article_tags (tag_id, article_id);

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger comments_set_updated_at
before update on public.comments
for each row execute function public.set_updated_at();

create function public.create_profile_for_auth_user()
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
  if exists (select 1 from public.profiles where slug = profile_slug) then
    profile_slug := profile_slug || '-' || left(new.id::text, 8);
  end if;

  insert into public.profiles (id, email, display_name, avatar_url, slug)
  values (
    new.id,
    new.email,
    profile_name,
    new.raw_user_meta_data ->> 'avatar_url',
    profile_slug
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.create_profile_for_auth_user();

create function public.sync_profile_email()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_email_changed
after update of email on auth.users
for each row execute function public.sync_profile_email();

alter table public.profiles enable row level security;
alter table public.articles enable row level security;
alter table public.tags enable row level security;
alter table public.article_tags enable row level security;
alter table public.comments enable row level security;
alter table public.newsletter_subscribers enable row level security;

create policy "Profiles are publicly readable"
  on public.profiles for select to anon, authenticated using (true);
create policy "Users update their own profile"
  on public.profiles for update to authenticated using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Published articles are public"
  on public.articles for select to anon, authenticated using (published);
create policy "Tags are public"
  on public.tags for select to anon, authenticated using (true);
create policy "Published article tags are public"
  on public.article_tags for select to anon, authenticated using (
    exists (select 1 from public.articles where id = article_id and published)
  );

create policy "Comments on published articles are public"
  on public.comments for select to anon, authenticated using (
    exists (select 1 from public.articles where id = article_id and published)
  );
create policy "Authenticated users comment as themselves"
  on public.comments for insert to authenticated with check (
    user_id = (select auth.uid()) and
    exists (select 1 from public.articles where id = article_id and published)
  );
create policy "Users edit their own comments"
  on public.comments for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Users delete their own comments"
  on public.comments for delete to authenticated using (user_id = (select auth.uid()));

create policy "Anyone can subscribe by email"
  on public.newsletter_subscribers for insert to anon, authenticated with check (
    position('@' in email) > 1 and position('.' in split_part(email, '@', 2)) > 1
  );

revoke all on public.profiles, public.articles, public.tags, public.article_tags,
  public.comments, public.newsletter_subscribers from anon, authenticated;
grant select (id, display_name, bio, avatar_url, slug, created_at)
  on public.profiles to anon, authenticated;
grant select on public.articles, public.tags, public.article_tags, public.comments
  to anon, authenticated;
grant update (display_name, bio, avatar_url) on public.profiles to authenticated;
grant insert (article_id, user_id, content) on public.comments to authenticated;
grant update (content) on public.comments to authenticated;
grant delete on public.comments to authenticated;
grant insert (email) on public.newsletter_subscribers to anon, authenticated;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'avatars';

create policy "Avatar images are public"
  on storage.objects for select to anon, authenticated using (bucket_id = 'avatars');
create policy "Users upload their own avatar"
  on storage.objects for insert to authenticated with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Users replace their own avatar"
  on storage.objects for update to authenticated using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
  ) with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Users delete their own avatar"
  on storage.objects for delete to authenticated using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

insert into public.tags (name, slug) values
  ('Gold', 'gold'), ('Silver', 'silver'), ('Oil', 'oil'),
  ('Inflation', 'inflation'), ('Debt', 'debt'), ('Dollar', 'dollar'),
  ('Geopolitics', 'geopolitics')
on conflict (slug) do nothing;

insert into public.articles (id, slug, title, summary, body, cover_image, published, published_at) values
  ('11111111-1111-4111-8111-111111111111', 'gold-and-the-price-of-patience', 'Gold and the price of patience', 'What a quiet gold market can reveal about real rates, risk, and the cost of waiting.', E'Gold is often treated as a verdict on the economy. In practice, it is closer to a running argument between confidence in money and the return available elsewhere.\n\nWhen nominal yields rise faster than inflation expectations, the opportunity cost of holding a non-yielding asset can increase. When confidence in purchasing power weakens, that arithmetic starts to look different.\n\nThe useful signal is rarely a single daily move. Watch the relationship between gold, real yields, and the dollar over a full cycle, then ask which part of the story is changing.', 'https://images.unsplash.com/photo-1610375461246-83df859d849d?auto=format&fit=crop&w=1800&q=85', true, '2026-10-28T09:00:00Z'),
  ('22222222-2222-4222-8222-222222222222', 'silver-between-industry-and-money', 'Silver, between industry and money', 'The dual identity of silver makes its price action a useful, if noisy, macro cross-check.', E'Silver carries two histories at once. It is a monetary metal, but it is also an industrial input whose demand depends on factories, grids, and electronics.\n\nThat combination can make silver lag gold during defensive episodes and catch up when industrial expectations improve. The gold-to-silver ratio is one way to frame that changing balance.\n\nRatios are context, not forecasts. Their value is in helping investors notice when the market''s emphasis is shifting from monetary protection to cyclical growth, or back again.', 'https://images.unsplash.com/photo-1610375461246-83df859d849d?auto=format&fit=crop&w=1800&q=85&sat=-70', true, '2026-10-19T09:00:00Z'),
  ('33333333-3333-4333-8333-333333333333', 'oil-is-a-macro-variable-again', 'Oil is a macro variable again', 'Energy prices connect geopolitics, household budgets, and the inflation outlook in one market.', E'Oil can move from background input to headline variable quickly. A supply disruption, a change in transport routes, or a shift in demand can alter inflation expectations before it appears in official data.\n\nFor investors, the important distinction is between a temporary price shock and a persistent change in the cost of energy. The first can squeeze consumers; the second can reshape policy expectations.\n\nReading oil alongside the dollar and precious metals helps separate a growth story from a currency story. The same move in crude can mean very different things depending on what else is moving with it.', 'https://images.unsplash.com/photo-1516937941344-00b4e0337589?auto=format&fit=crop&w=1800&q=85', true, '2026-10-08T09:00:00Z')
on conflict (id) do nothing;

insert into public.article_tags (article_id, tag_id)
select seed.article_id, tags.id
from (values
  ('11111111-1111-4111-8111-111111111111'::uuid, 'gold'),
  ('11111111-1111-4111-8111-111111111111'::uuid, 'inflation'),
  ('11111111-1111-4111-8111-111111111111'::uuid, 'dollar'),
  ('22222222-2222-4222-8222-222222222222'::uuid, 'silver'),
  ('22222222-2222-4222-8222-222222222222'::uuid, 'debt'),
  ('22222222-2222-4222-8222-222222222222'::uuid, 'inflation'),
  ('33333333-3333-4333-8333-333333333333'::uuid, 'oil'),
  ('33333333-3333-4333-8333-333333333333'::uuid, 'geopolitics'),
  ('33333333-3333-4333-8333-333333333333'::uuid, 'inflation')
) as seed(article_id, slug)
join public.tags on tags.slug = seed.slug
on conflict do nothing;