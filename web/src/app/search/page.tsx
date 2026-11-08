import type { Metadata } from "next";
import { Search } from "lucide-react";
import { ArticleCard } from "@/components/article-card";
import { getArticles, searchArticles } from "@/lib/articles";
import { getLocale } from "@/lib/locale";
import { messages } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  return { title: messages[(await getLocale())].search.title };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const locale = await getLocale();
  const t = messages[locale].search;
  const articles = searchArticles(await getArticles(locale), q, locale);

  return (
    <section className="listing-page content-width">
      <div className="section-kicker"><span className="eyebrow">{t.archive}</span><span className="kicker-line" /></div>
      <h1>{t.title}</h1>
      <form className="search-page-form" action="/search"><Search size={19} /><label className="sr-only" htmlFor="article-search">{t.label}</label><input id="article-search" name="q" type="search" placeholder={t.placeholder} defaultValue={q} /><button type="submit">{t.button} <span>→</span></button></form>
      {q ? <p className="result-count">{articles.length} {articles.length === 1 ? t.oneResult : t.manyResults} · “{q}”</p> : <p className="result-count">{t.noQuery}</p>}
      {articles.length ? <div className="article-grid">{articles.map((article, index) => <ArticleCard key={article.id} article={article} index={index + 1} locale={locale} />)}</div> : q ? <div className="empty-state"><span className="eyebrow">{t.noResults}</span><h2>{t.noMatch}</h2><p>{t.tryAgain}</p></div> : null}
    </section>
  );
}