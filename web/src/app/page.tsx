import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Suspense } from "react";
import { ArticleCard } from "@/components/article-card";
import { HomeMacroScores } from "@/components/home-macro-scores";
import { getArticles } from "@/lib/articles";
import { getTagLabel, messages } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

const topics = ["Gold", "Silver", "Copper", "Oil", "Inflation", "Debt", "Dollar", "Geopolitics"];

export default async function HomePage() {
  const locale = await getLocale();
  const t = messages[locale].home;
  const articles = await getArticles(locale);

  return (
    <>
      <div className="market-note"><span>{t.strapline}</span><span>{t.englishTurkish}</span></div>
      <Suspense fallback={<p className="home-macro-scores-loading content-width" role="status">{t.loadingScores}</p>}>
        <HomeMacroScores locale={locale} />
      </Suspense>

      <section className="topic-rail" aria-label={t.followSignal}>
        <span className="eyebrow">{t.followSignal}</span>
        <div className="topic-list">
          {topics.map((topic) => <Link key={topic} href={`/tag/${topic.toLowerCase()}`}>{getTagLabel(topic, locale)}<ArrowUpRight size={13} /></Link>)}
        </div>
      </section>

      <section className="latest-section content-width">
        <div className="section-heading">
          <div><p className="eyebrow">{t.journal}</p><h2>{t.allAnalysis}</h2></div>
          <Link className="text-link" href="/search">{t.exploreAll} <ArrowUpRight size={15} /></Link>
        </div>
        <div className="article-grid">
          {articles.map((article, index) => <ArticleCard key={article.id} article={article} index={index + 1} locale={locale} />)}
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
