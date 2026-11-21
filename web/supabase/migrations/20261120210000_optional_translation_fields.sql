alter table public.article_translations
  drop constraint article_translations_title_check,
  drop constraint article_translations_summary_check,
  drop constraint article_translations_body_check,
  drop constraint article_translations_content_markdown_check,
  add constraint article_translations_title_check check (char_length(btrim(title)) <= 140 and (language = 'tr' or char_length(btrim(title)) >= 1)),
  add constraint article_translations_summary_check check (char_length(btrim(summary)) <= 300 and (language = 'tr' or char_length(btrim(summary)) >= 1)),
  add constraint article_translations_body_check check (char_length(btrim(body)) <= 100000 and (language = 'tr' or char_length(btrim(body)) >= 1)),
  add constraint article_translations_content_markdown_check check (char_length(btrim(content_markdown)) <= 100000 and (language = 'tr' or char_length(btrim(content_markdown)) >= 1));
