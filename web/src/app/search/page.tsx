import type { Metadata } from "next";
import { Search } from "lucide-react";
import { ArticleCard } from "@/components/article-card";
import { getArticles, searchArticles } from "@/lib/articles";

export const metadata: Metadata = { title: "Search the journal" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const articles = searchArticles(await getArticles(), q);

  return (
    <section className="listing-page content-width">
      <div className="section-kicker"><span className="eyebrow">The archive</span><span className="kicker-line" /></div>
      <h1>Search the journal</h1>
      <form className="search-page-form" action="/search"><Search size={19} /><label className="sr-only" htmlFor="article-search">Search titles, summaries, and tags</label><input id="article-search" name="q" type="search" placeholder="Try gold, inflation, or dollar" defaultValue={q} /><button type="submit">Search <span>→</span></button></form>
      {q ? <p className="result-count">{articles.length} {articles.length === 1 ? "article" : "articles"} for “{q}”</p> : <p className="result-count">Search article titles, summaries, and tags.</p>}
      {articles.length ? <div className="article-grid">{articles.map((article, index) => <ArticleCard key={article.id} article={article} index={index + 1} />)}</div> : q ? <div className="empty-state"><span className="eyebrow">No results</span><h2>Nothing matched that search.</h2><p>Try a market, theme, or a shorter phrase.</p></div> : null}
    </section>
  );
}