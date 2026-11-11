"use client";

import { useState } from "react";
import MDEditor from "@uiw/react-md-editor";
import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";
import { saveArticleAction, deleteArticleAction } from "@/app/write/actions";
import { messages, type Locale } from "@/lib/i18n";

const categorySlugs = ["gold", "silver", "oil", "copper", "macro", "inflation", "debt", "dollar", "central-banks", "geopolitics"];

export type ArticleEditorValues = {
  id?: string;
  title?: string;
  summary?: string;
  content?: string;
  category?: string;
  tags?: string[];
  image?: string;
  language?: Locale;
};

export function ArticleEditor({
  locale,
  values = {},
  error,
  saved,
}: {
  locale: Locale;
  values?: ArticleEditorValues;
  error?: string;
  saved?: boolean;
}) {
  const t = messages[locale].editor;
  const [content, setContent] = useState(values.content ?? "");
  const categories = t.categories as readonly string[];

  return (
    <div className="community-editor-wrap">
      <p className="muted-copy">{t.description}</p>
      {error && <p className="form-alert error" role="alert">{error === "invalid" ? t.invalid : t.saveFailed}</p>}
      {saved && <p className="form-alert success" role="status">{t.saved}</p>}
      <form className="community-editor" action={saveArticleAction}>
        <input type="hidden" name="article_id" value={values.id ?? ""} />
        <input type="hidden" name="content_markdown" value={content} />
        <label htmlFor="article-title">{t.articleTitle}</label>
        <input id="article-title" name="title" defaultValue={values.title} maxLength={140} required />
        <label htmlFor="article-summary">{t.summary}</label>
        <textarea id="article-summary" name="summary" defaultValue={values.summary} maxLength={300} rows={3} required />
        <div className="community-editor-fields">
          <div><label htmlFor="article-category">{t.category}</label><select id="article-category" name="category" defaultValue={values.category ?? "macro"}>{categories.map((category, index) => <option key={categorySlugs[index]} value={categorySlugs[index]}>{category}</option>)}</select></div>
          <div><label htmlFor="article-language">{t.language}</label><select id="article-language" name="language" defaultValue={values.language ?? locale}><option value="en">English</option><option value="tr">Türkçe</option></select></div>
        </div>
        <label htmlFor="article-tags">{t.tags}</label>
        <input id="article-tags" name="tags" defaultValue={values.tags?.join(", ")} placeholder={t.tagsHint} />
        <label htmlFor="article-image">{t.image}</label>
        <input id="article-image" name="featured_image" type="url" defaultValue={values.image} placeholder="https://" />
        <label>{t.content}</label>
        <div className="community-markdown-editor" data-color-mode="light">
          <MDEditor value={content} onChange={(value) => setContent(value ?? "")} height={440} preview="live" textareaProps={{ placeholder: t.content, "aria-label": t.content }} />
        </div>
        <div className="community-editor-actions">
          {values.id && <button className="button-secondary" type="submit" formAction={deleteArticleAction} formNoValidate>{t.delete}</button>}
          <span />
          <button className="button-secondary" type="submit" name="intent" value="draft">{t.saveDraft}</button>
          <button className="button-primary" type="submit" name="intent" value="publish">{t.publish} <span>→</span></button>
        </div>
      </form>
    </div>
  );
}
