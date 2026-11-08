import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleCard } from "@/components/article-card";
import { Avatar } from "@/components/avatar";
import { getAuthorBySlug } from "@/lib/articles";
import { getLocale } from "@/lib/locale";
import { messages } from "@/lib/i18n";

type RouteProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const profile = await getAuthorBySlug(slug, locale);
  return profile
    ? { title: profile.author.displayName, description: profile.author.bio }
    : { title: "Author not found" };
}

export default async function AuthorPage({ params }: RouteProps) {
  const { slug } = await params;
  const locale = await getLocale();
  const t = messages[locale].author;
  const profile = await getAuthorBySlug(slug, locale);
  if (!profile) notFound();

  return (
    <section className="author-page content-width">
      <div className="section-kicker"><span className="eyebrow">{t.contributors}</span><span className="kicker-line" /></div>
      <div className="author-profile"><Avatar name={profile.author.displayName} imageUrl={profile.author.avatarUrl} size="large" /><div><p className="eyebrow">{t.author}</p><h1>{profile.author.displayName}</h1><p>{profile.author.bio}</p></div></div>
      <div className="section-heading"><div><p className="eyebrow">{t.fromDesk}</p><h2>{t.articlesBy.replace("{name}", profile.author.displayName)}</h2></div></div>
      {profile.articles.length ? <div className="article-grid">{profile.articles.map((article, index) => <ArticleCard key={article.id} article={article} index={index + 1} locale={locale} />)}</div> : <p className="empty-state">{t.empty}</p>}
    </section>
  );
}