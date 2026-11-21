export function readArticleTranslations(formData: FormData) {
  const english = {
    language: "en" as const,
    title: String(formData.get("title_en") ?? "").trim(),
    summary: String(formData.get("summary_en") ?? "").trim(),
    content: String(formData.get("content_markdown_en") ?? "").trim(),
  };
  const turkish = {
    language: "tr" as const,
    title: String(formData.get("title_tr") ?? "").trim(),
    summary: String(formData.get("summary_tr") ?? "").trim(),
    content: String(formData.get("content_markdown_tr") ?? "").trim(),
  };
  const translations = [english, turkish]
    .filter((translation) => translation.title || translation.summary || translation.content);

  return { english, turkish, translations };
}
