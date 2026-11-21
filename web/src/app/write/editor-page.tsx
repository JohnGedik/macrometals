import { notFound, redirect } from "next/navigation";
import { ArticleEditor, type ArticleEditorValues } from "@/components/article-editor";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { messages, type Locale } from "@/lib/i18n";

export async function WritePage({ slug, searchParams }: { slug?: string; searchParams?: Promise<{ error?: string; saved?: string }> }) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?error=Supabase+is+not+configured");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const locale: Locale = await getLocale();
  const t = messages[locale].editor;
  let values: ArticleEditorValues = {};
  if (slug) {
    const { data: article } = await supabase.from("articles")
      .select("id, author_id, slug, title, summary, body, featured_image, cover_image, language, category_id, published")
      .eq("slug", slug).eq("author_id", user.id).maybeSingle();
    if (!article) notFound();
    const [{ data: links }, { data: category }] = await Promise.all([
      supabase.from("article_tags").select("tag_id").eq("article_id", article.id),
      article.category_id ? supabase.from("categories").select("slug").eq("id", article.category_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    const tagIds = (links ?? []).map((link) => link.tag_id);
    const tagResult = tagIds.length ? await supabase.from("tags").select("name").in("id", tagIds) : null;
    const { data: translations, error: translationsError } = await supabase.from("article_translations")
      .select("language, title, summary, body").eq("article_id", article.id);
    if (translationsError) {
      console.error("Could not load article translations for editing", translationsError.code);
      throw new Error("Could not load article translations for editing.");
    }
    const byLanguage = new Map((translations ?? []).map((translation) => [translation.language, translation]));
    const fallback = {
      language: article.language === "tr" ? "tr" as const : "en" as const,
      title: article.title,
      summary: article.summary,
      body: article.body,
    };
    const english = byLanguage.get("en") ?? (fallback.language === "en" ? fallback : null);
    const turkish = byLanguage.get("tr") ?? (fallback.language === "tr" ? fallback : null);
    values = {
      id: article.id,
      published: article.published,
      translations: {
        en: english ? { title: english.title, summary: english.summary, content: english.body } : undefined,
        tr: turkish ? { title: turkish.title, summary: turkish.summary, content: turkish.body } : undefined,
      },
      category: category?.slug,
      tags: (tagResult?.data ?? []).map((tag) => tag.name),
      image: article.featured_image || article.cover_image || "",
    };
  }
  const params = await searchParams;

  return (
    <section className="community-page content-width">
      <div className="section-kicker"><span className="eyebrow">{messages[locale].community.title}</span><span className="kicker-line" /></div>
      <h1>{slug ? t.editTitle : t.title}</h1>
      <ArticleEditor locale={locale} values={values} error={params?.error} saved={params?.saved === "1"} />
    </section>
  );
}
