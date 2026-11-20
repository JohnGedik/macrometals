import Link from "next/link";
import { redirect } from "next/navigation";
import { CommunityNotice, SaveArticleControl } from "@/components/community-controls";
import { getArticles } from "@/lib/articles";
import { communityCopy } from "@/lib/community-copy";
import { getLocale } from "@/lib/locale";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

type OwnedArticle = { id: string; slug: string; title: string; published: boolean };
type SavedArticle = { article_id: string };
type ArticleLink = { id: string; slug: string; title: string };

export const metadata: Metadata = {
  title: "Library",
  robots: { index: false, follow: false },
};

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const locale = await getLocale();
  const t = communityCopy[locale];
  const status = await searchParams;
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    console.error("Library is not configured");
    return <section className="community-page content-width community-social"><h1>{t.library}</h1><p role="alert">{t.failed}</p></section>;
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const owned: OwnedArticle[] = [];
  const saved: SavedArticle[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await supabase.from("articles").select("id, slug, title, published")
      .eq("author_id", user.id).order("updated_at", { ascending: false }).order("id").range(offset, offset + 499);
    if (result.error) {
      console.error("Could not load authored articles", result.error.code);
      return <section className="community-page content-width community-social"><h1>{t.library}</h1><p role="alert">{t.failed}</p></section>;
    }
    owned.push(...result.data);
    if (result.data.length < 500) break;
  }
  for (let offset = 0; ; offset += 500) {
    const result = await supabase.from("saved_articles").select("article_id")
      .eq("user_id", user.id).order("created_at", { ascending: false }).order("article_id").range(offset, offset + 499);
    if (result.error) {
      console.error("Could not load saved articles", result.error.code);
      return <section className="community-page content-width community-social"><h1>{t.library}</h1><p role="alert">{t.failed}</p></section>;
    }
    saved.push(...result.data);
    if (result.data.length < 500) break;
  }
  const articles = await getArticles(locale);
  const ids = saved.map((item) => item.article_id);
  const missingIds = ids.filter((id) => !articles.some((article) => article.id === id));
  const extra: ArticleLink[] = [];
  for (let offset = 0; offset < missingIds.length; offset += 100) {
    const result = await supabase.from("articles").select("id, slug, title")
      .in("id", missingIds.slice(offset, offset + 100)).eq("published", true).not("author_id", "is", null);
    if (result.error) {
      console.error("Could not load saved article details", result.error.code);
      return <section className="community-page content-width community-social"><h1>{t.library}</h1><p role="alert">{t.failed}</p></section>;
    }
    extra.push(...result.data);
  }
  const savedById = new Map([...articles, ...extra].map((article) => [article.id, article]));
  const drafts = owned.filter((article) => !article.published);
  const published = owned.filter((article) => article.published);

  return <section className="community-page content-width community-social">
    <h1>{t.library}</h1>
    <CommunityNotice error={status.error} notice={status.notice} locale={locale} />
    <h2>{t.myArticles}</h2>
    <section><h3>{t.drafts}</h3>
      {drafts.length ? <ul>{drafts.map((article) => <li key={article.id}><Link href={`/write/${article.slug}`}>{article.title}</Link> · {t.edit}</li>)}</ul> : <p>{t.noDrafts}</p>}
    </section>
    <section><h3>{t.published}</h3>
      {published.length ? <ul>{published.map((article) => <li key={article.id}><Link href={`/articles/${article.slug}`}>{article.title}</Link> · <Link href={`/write/${article.slug}`}>{t.edit}</Link></li>)}</ul> : <p>{t.noPublished}</p>}
    </section>
    <section><h2>{t.savedArticles}</h2>
      {ids.length ? <ul className="saved-article-list">{ids.map((id) => {
        const article = savedById.get(id);
        return <li key={id}>
          {article ? <Link href={`/articles/${article.slug}`}>{article.title}</Link> : <span>{t.unavailableSaved}</span>}
          <SaveArticleControl id={id} path="/library" saved signedIn locale={locale} />
        </li>;
      })}</ul> : <p>{t.noSaved}</p>}
    </section>
  </section>;
}
