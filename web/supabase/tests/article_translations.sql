-- Run against an isolated Supabase database after applying migrations.
begin;

insert into auth.users (id, email) values
  ('32000000-0000-4000-8000-000000000001', 'translation-test@example.test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '32000000-0000-4000-8000-000000000001', true);

do $$
declare
  test_article_id uuid;
begin
  insert into public.articles (author_id, slug, title, summary, body)
  values (auth.uid(), 'translation-test', 'English title', 'English summary', 'English body')
  returning id into test_article_id;

  insert into public.article_translations (article_id, language, title, summary, body, content_markdown)
  values (test_article_id, 'tr', 'Turkish title', '', '', '');
  if not exists (
    select 1 from public.article_translations t
    where t.article_id = test_article_id and t.language = 'tr'
      and t.title = 'Turkish title' and t.summary = '' and t.body = ''
  ) then
    raise exception 'Partial Turkish translation did not persist';
  end if;

  begin
    insert into public.article_translations (article_id, language, title, summary, body, content_markdown)
    values (test_article_id, 'en', '', 'English summary', 'English body', 'English body');
    raise exception 'Accepted an empty English title';
  exception when check_violation then null;
  end;
end;
$$;

rollback;
