import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { ArticleCard } from "@/components/article-card";
import { getArticles } from "@/lib/articles";

const topics = ["Gold", "Silver", "Oil", "Inflation", "Debt", "Dollar", "Geopolitics"];

export default async function HomePage() {
  const articles = await getArticles();
  const [featured, ...latest] = articles;

  return (
    <>
      <div className="market-note"><span>Macro, read through the metals</span><span>Independent research · English / Türkçe</span></div>
      {featured && (
        <section className="lead-story" style={{ backgroundImage: `url("${featured.coverImage}")` }}>
          <div className="lead-overlay" />
          <div className="lead-copy">
            <p className="eyebrow eyebrow-light"><span className="live-dot" /> Latest analysis</p>
            <h1>{featured.title}</h1>
            <p className="lead-summary">{featured.summary}</p>
            <div className="lead-meta"><span>{featured.author.displayName}</span><span>{new Date(featured.publishedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}</span></div>
            <Link className="lead-cta" href={`/articles/${featured.slug}`}>Read the analysis <ArrowUpRight size={17} /></Link>
          </div>
          <span className="lead-index">01 <i /> 03</span>
        </section>
      )}

      <section className="topic-rail" aria-label="Browse topics">
        <span className="eyebrow">Follow a signal</span>
        <div className="topic-list">
          {topics.map((topic) => <Link key={topic} href={`/tag/${topic.toLowerCase()}`}>{topic}<ArrowUpRight size={13} /></Link>)}
        </div>
      </section>

      <section className="latest-section content-width">
        <div className="section-heading">
          <div><p className="eyebrow">The journal</p><h2>Latest thinking</h2></div>
          <Link className="text-link" href="/search">Explore all articles <ArrowUpRight size={15} /></Link>
        </div>
        <div className="article-grid">
          {latest.map((article, index) => <ArticleCard key={article.id} article={article} index={index + 2} />)}
        </div>
      </section>

      <section className="field-note">
        <div className="field-note-inner content-width">
          <ArrowDownRight className="field-note-icon" size={26} />
          <div><p className="eyebrow">A way of looking</p><h2>One market rarely tells the whole story.</h2></div>
          <p>Gold, silver, and oil are not forecasts. Together, their relationships can help frame the forces moving beneath the headlines.</p>
        </div>
      </section>
    </>
  );
}
