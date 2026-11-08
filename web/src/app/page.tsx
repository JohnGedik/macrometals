import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { ArticleCard } from "@/components/article-card";
import { getArticles } from "@/lib/articles";
import { getTagLabel, messages } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

const topics = ["Gold", "Silver", "Copper", "Oil", "Inflation", "Debt", "Dollar", "Geopolitics"];

export default async function HomePage() {
  const locale = await getLocale();
  const t = messages[locale].home;
  const articles = await getArticles(locale);
  const [featured, ...latest] = articles;

  return (
    <>
      <div className="market-note"><span>{t.strapline}</span><span>{t.englishTurkish}</span></div>
      {featured && (
        <section className="lead-story" style={{ backgroundImage: `url("${featured.coverImage}")` }}>
          <div className="lead-overlay" />
          <div className="lead-copy">
            <p className="eyebrow eyebrow-light"><span className="live-dot" /> {t.latestAnalysis}</p>
            <h1>{featured.title}</h1>
            <p className="lead-summary">{featured.summary}</p>
            <div className="lead-meta"><span>{featured.author.displayName}</span><span>{new Date(featured.publishedAt).toLocaleDateString(locale === "tr" ? "tr-TR" : "en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}</span></div>
            <Link className="lead-cta" href={`/articles/${featured.slug}`}>{t.readAnalysis} <ArrowUpRight size={17} /></Link>
          </div>
          <span className="lead-index">01 <i /> 03</span>
        </section>
      )}

      <section className="topic-rail" aria-label={t.followSignal}>
        <span className="eyebrow">{t.followSignal}</span>
        <div className="topic-list">
          {topics.map((topic) => <Link key={topic} href={`/tag/${topic.toLowerCase()}`}>{getTagLabel(topic, locale)}<ArrowUpRight size={13} /></Link>)}
        </div>
      </section>

      <section className="latest-section content-width">
        <div className="section-heading">
          <div><p className="eyebrow">{t.journal}</p><h2>{t.latestThinking}</h2></div>
          <Link className="text-link" href="/search">{t.exploreAll} <ArrowUpRight size={15} /></Link>
        </div>
        <div className="article-grid">
          {latest.map((article, index) => <ArticleCard key={article.id} article={article} index={index + 2} locale={locale} />)}
        </div>
      </section>

      <section className="field-note">
        <div className="field-note-inner content-width">
          <ArrowDownRight className="field-note-icon" size={26} />
          <div><p className="eyebrow">{t.wayOfLooking}</p><h2>{t.wholeStory}</h2></div>
          <p>{t.explanation}</p>
        </div>
      </section>
    </>
  );
}
