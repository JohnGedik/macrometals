import type { Metadata } from "next";
import Link from "next/link";
import { ArticleCard } from "@/components/article-card";
import { getArticles } from "@/lib/articles";
import { getLocale } from "@/lib/locale";
import { messages } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: messages[locale].community.title };
}

type Sort = "latest" | "top" | "views" | "trending";
type PageProps = { searchParams: Promise<{ sort?: string }> };

function trendingScore(article: { score?: number; upvotes?: number; downvotes?: number; viewCount?: number; publishedAt: string }) {
  const ageHours = Math.max(1, (Date.now() - Date.parse(article.publishedAt)) / 3600000);
  const engagement = (article.upvotes ?? 0) + (article.downvotes ?? 0) + Math.log1p(article.viewCount ?? 0);
  return (Math.max(0, article.score ?? 0) + engagement * 0.5) / Math.pow(ageHours + 2, 1.15);
}

export default async function CommunityPage({ searchParams }: PageProps) {
  const locale = await getLocale();
  const t = messages[locale].community;
  const params = await searchParams;
  const requested = params.sort;
  const sort: Sort = requested === "top" || requested === "views" || requested === "trending" ? requested : "latest";
  const articles = (await getArticles(locale)).filter((article) => article.authorId);
  const featured = [...articles].sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0];
  const remaining = articles.filter((article) => article.id !== featured?.id);
  const sorted = [...remaining].sort((a, b) => {
    if (sort === "top") return (b.score ?? 0) - (a.score ?? 0) || Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
    if (sort === "views") return (b.viewCount ?? 0) - (a.viewCount ?? 0) || Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
    if (sort === "trending") return trendingScore(b) - trendingScore(a);
    return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
  });

  return (
    <section className="community-page content-width">
      <div className="section-kicker"><span className="eyebrow">{t.title}</span><span className="kicker-line" /></div>
      <div className="section-heading"><div><h1>{t.title}</h1><p className="listing-intro">{t.intro}</p></div><Link className="button-primary" href="/write">{messages[locale].profile.writeArticle}</Link></div>
      {featured && <section className="community-feature"><div className="section-heading"><div><p className="eyebrow">{t.featured}</p></div></div><div className="article-grid"><ArticleCard article={featured} index={1} locale={locale} /></div></section>}
      <div className="community-feed-heading"><h2>{t.recent}</h2><form action="/community" className="community-sort"><label htmlFor="community-sort">{t.sort}</label><select id="community-sort" name="sort" defaultValue={sort}><option value="latest">{t.latest}</option><option value="top">{t.topRated}</option><option value="views">{t.mostViewed}</option><option value="trending">{t.trending}</option></select><button className="button-secondary" type="submit">{locale === "tr" ? "Uygula" : "Apply"}</button></form></div>
      {sorted.length > 0 && <div className="article-grid">{sorted.map((article, index) => <ArticleCard key={article.id} article={article} index={index + 2} locale={locale} />)}</div>}
      {articles.length === 0 && <p className="empty-state">{t.empty}</p>}
    </section>
  );
}
