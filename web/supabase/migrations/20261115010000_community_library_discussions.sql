create table public.saved_articles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  article_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, article_id)
);

create table public.discussion_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  topic text not null check (topic in ('gold', 'silver', 'copper', 'oil', 'macro')),
  title text not null check (char_length(btrim(title)) between 1 and 140),
  content text not null check (char_length(btrim(content)) between 1 and 3000),
  created_at timestamptz not null default now()
);

create table public.discussion_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.discussion_posts (id) on delete cascade,
  parent_id uuid,
  author_id uuid not null references public.profiles (id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 3000),
  created_at timestamptz not null default now(),
  unique (id, post_id),
  foreign key (parent_id, post_id) references public.discussion_replies (id, post_id) on delete cascade
);

create table public.discussion_votes (
  post_id uuid not null references public.discussion_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  vote_type smallint not null check (vote_type in (-1, 1)),
  primary key (post_id, user_id)
);

create table public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('article', 'discussion', 'reply')),
  target_id uuid not null,
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  created_at timestamptz not null default now()
);

create index discussion_posts_topic_created_idx on public.discussion_posts (topic, created_at desc);
create index discussion_replies_post_created_idx on public.discussion_replies (post_id, created_at);
create index discussion_votes_post_idx on public.discussion_votes (post_id);
create index community_reports_created_idx on public.community_reports (created_at desc);

create function public.check_discussion_reply_depth()
returns trigger language plpgsql set search_path = '' as $$
declare
  ancestor_id uuid := new.parent_id;
  depth integer := 0;
begin
  while ancestor_id is not null loop
    depth := depth + 1;
    if depth > 2 then
      raise exception 'Discussion replies are limited to three levels';
    end if;
    select parent_id into ancestor_id
      from public.discussion_replies where id = ancestor_id and post_id = new.post_id;
    if not found then
      raise exception 'Reply parent not found in discussion';
    end if;
  end loop;
  return new;
end;
$$;

create trigger discussion_reply_depth
before insert on public.discussion_replies
for each row execute function public.check_discussion_reply_depth();

alter table public.saved_articles enable row level security;
alter table public.discussion_posts enable row level security;
alter table public.discussion_replies enable row level security;
alter table public.discussion_votes enable row level security;
alter table public.community_reports enable row level security;

create policy "Users read their saved articles" on public.saved_articles for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users save articles for themselves" on public.saved_articles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Users remove their saved articles" on public.saved_articles for delete to authenticated
  using (user_id = (select auth.uid()));
create policy "Discussions are public" on public.discussion_posts for select to anon, authenticated using (true);
create policy "Users create discussions as themselves" on public.discussion_posts for insert to authenticated
  with check (author_id = (select auth.uid()));
create policy "Discussion replies are public" on public.discussion_replies for select to anon, authenticated using (true);
create policy "Users reply as themselves" on public.discussion_replies for insert to authenticated
  with check (author_id = (select auth.uid()));
create policy "Users read their discussion votes" on public.discussion_votes for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users cast their discussion votes" on public.discussion_votes for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Users change their discussion votes" on public.discussion_votes for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Users remove their discussion votes" on public.discussion_votes for delete to authenticated
  using (user_id = (select auth.uid()));
create policy "Users submit their own reports" on public.community_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));

create function public.get_discussion_summaries(post_ids uuid[])
returns table (post_id uuid, score bigint, reply_count bigint, user_vote smallint)
language sql stable security definer set search_path = '' as $$
  select p.id,
    coalesce((select sum(v.vote_type) from public.discussion_votes v where v.post_id = p.id), 0),
    (select count(*) from public.discussion_replies r where r.post_id = p.id),
    coalesce((select v.vote_type from public.discussion_votes v where v.post_id = p.id and v.user_id = auth.uid()), 0)::smallint
  from public.discussion_posts p where p.id = any(post_ids);
$$;
revoke all on function public.get_discussion_summaries(uuid[]) from public;
grant execute on function public.get_discussion_summaries(uuid[]) to anon, authenticated;

create function public.get_discussion_feed(feed_topic text, feed_sort text)
returns table (id uuid, topic text, title text, content text, created_at timestamptz,
  author_id uuid, author text, score bigint, reply_count bigint, user_vote smallint)
language sql stable security definer set search_path = '' as $$
  select p.id, p.topic, p.title, p.content, p.created_at, p.author_id,
    coalesce(profile.display_name, 'Reader'),
    coalesce((select sum(v.vote_type) from public.discussion_votes v where v.post_id = p.id), 0),
    (select count(*) from public.discussion_replies r where r.post_id = p.id),
    coalesce((select v.vote_type from public.discussion_votes v where v.post_id = p.id and v.user_id = auth.uid()), 0)::smallint
  from public.discussion_posts p
  join public.profiles profile on profile.id = p.author_id
  where feed_topic = 'all' or p.topic = feed_topic
  order by
    case when feed_sort = 'top' then coalesce((select sum(v.vote_type) from public.discussion_votes v where v.post_id = p.id), 0) end desc,
    case when feed_sort = 'discussed' then (select count(*) from public.discussion_replies r where r.post_id = p.id) end desc,
    p.created_at desc, p.id
  limit 100;
$$;
revoke all on function public.get_discussion_feed(text, text) from public;
grant execute on function public.get_discussion_feed(text, text) to anon, authenticated;

create function public.get_article_comment_counts(article_ids uuid[])
returns table (article_id uuid, comment_count bigint)
language sql stable set search_path = '' as $$
  select c.article_id, count(*) from public.comments c
  where c.article_id = any(article_ids) group by c.article_id;
$$;
revoke all on function public.get_article_comment_counts(uuid[]) from public;
grant execute on function public.get_article_comment_counts(uuid[]) to anon, authenticated;

revoke all on public.saved_articles, public.discussion_posts, public.discussion_replies,
  public.discussion_votes, public.community_reports from anon, authenticated;
grant select, insert, delete on public.saved_articles to authenticated;
grant select on public.discussion_posts, public.discussion_replies to anon, authenticated;
grant insert on public.discussion_posts, public.discussion_replies to authenticated;
grant select, insert, update, delete on public.discussion_votes to authenticated;
grant insert (reporter_id, target_type, target_id, reason) on public.community_reports to authenticated;
