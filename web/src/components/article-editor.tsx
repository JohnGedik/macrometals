"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import MDEditor from "@uiw/react-md-editor";
import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";
import { saveArticleAction, deleteArticleAction } from "@/app/write/actions";
import { messages, type Locale } from "@/lib/i18n";

const categorySlugs = ["gold", "silver", "oil", "copper", "macro", "inflation", "debt", "dollar", "central-banks", "geopolitics"];

export type ArticleEditorValues = {
  id?: string;
  translations?: Partial<Record<Locale, {
    title: string;
    summary: string;
    content: string;
  }>>;
  category?: string;
  tags?: string[];
  image?: string;
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
  const router = useRouter();
  const [content, setContent] = useState({
    en: values.translations?.en?.content ?? "",
    tr: values.translations?.tr?.content ?? "",
  });
  const [submitError, setSubmitError] = useState<"invalid" | "save" | "auth" | "profile" | null>(null);
  const [pending, setPending] = useState(false);
  const categories = t.categories as readonly string[];

  async function submitArticle(event: FormEvent<HTMLFormElement>) {
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (!(submitter instanceof HTMLButtonElement) || submitter.name !== "intent") return;
    event.preventDefault();
    if (pending) return;
    const formData = new FormData(event.currentTarget, submitter);
    setPending(true);
    setSubmitError(null);
    try {
      const result = await saveArticleAction(formData);
      if (result.error) setSubmitError(result.error);
      else router.push(result.redirectTo);
    } catch (error) {
      console.error("Article submission failed", error);
      setSubmitError("save");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="community-editor-wrap">
      <p className="muted-copy">{t.description}</p>
      {error && <p className="form-alert error" role="alert">{error === "invalid" ? t.invalid : t.saveFailed}</p>}
      {submitError && <p className="form-alert error" role="alert">
        {submitError === "invalid" ? t.invalid : submitError === "auth" ? t.signInAgain : submitError === "profile" ? t.profileFailed : t.saveFailed}
        {submitError === "auth" && <> <a href="/login" target="_blank" rel="noopener noreferrer">{t.signInLink}</a></>}
      </p>}
      {saved && <p className="form-alert success" role="status">{t.saved}</p>}
      <form className="community-editor" method="post" onSubmit={submitArticle}>
        <input type="hidden" name="article_id" value={values.id ?? ""} />
        <div className="article-language-fields">
          {(["en", "tr"] as const).map((language) => <fieldset className="article-language-version" key={language}>
            <legend>{language === "en" ? t.englishVersion : t.turkishVersion}</legend>
            {language === "tr" && <p className="muted-copy">{t.translationOptional}</p>}
            <input type="hidden" name={`content_markdown_${language}`} value={content[language]} />
            <label htmlFor={`article-title-${language}`}>{t.articleTitle}</label>
            <input id={`article-title-${language}`} name={`title_${language}`} defaultValue={values.translations?.[language]?.title} maxLength={140} required={language === "en"} />
            <label htmlFor={`article-summary-${language}`}>{t.summary}</label>
            <textarea id={`article-summary-${language}`} name={`summary_${language}`} defaultValue={values.translations?.[language]?.summary} maxLength={300} rows={3} required={language === "en"} />
            <label>{t.content}</label>
            <div className="community-markdown-editor" data-color-mode="light">
              <MDEditor value={content[language]} onChange={(value) => setContent((current) => ({ ...current, [language]: value ?? "" }))} height={360} preview="live" textareaProps={{ placeholder: t.content, "aria-label": `${t.content} (${language.toUpperCase()})` }} />
            </div>
          </fieldset>)}
        </div>
        <div className="community-editor-fields">
          <div><label htmlFor="article-category">{t.category}</label><select id="article-category" name="category" defaultValue={values.category ?? "macro"}>{categories.map((category, index) => <option key={categorySlugs[index]} value={categorySlugs[index]}>{category}</option>)}</select></div>
        </div>
        <label htmlFor="article-tags">{t.tags}</label>
        <input id="article-tags" name="tags" defaultValue={values.tags?.join(", ")} placeholder={t.tagsHint} />
        <label htmlFor="article-image">{t.image}</label>
        <input id="article-image" name="featured_image" type="url" defaultValue={values.image} placeholder="https://" />
        <div className="community-editor-actions">
          {values.id && <button className="button-secondary" type="submit" formAction={deleteArticleAction} formNoValidate disabled={pending}>{t.delete}</button>}
          <span />
          <button className="button-secondary" type="submit" name="intent" value="draft" disabled={pending}>{pending ? t.saving : t.saveDraft}</button>
          <button className="button-primary" type="submit" name="intent" value="publish" disabled={pending}>{t.publish} <span>→</span></button>
        </div>
      </form>
    </div>
  );
}
