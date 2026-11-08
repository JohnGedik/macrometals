import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Article } from "@/lib/articles";
import { getTagLabel, messages, type Locale } from "@/lib/i18n";

export function ArticleCard({ article, index, locale = "en" }: { article: Article; index: number; locale?: Locale }) {
  const t = messages[locale].article;

  return (
    <article className="article-card">
      <Link className="article-image" href={`/articles/${article.slug}`} aria-label={`${t.readArticle} ${article.title}`} style={{ backgroundImage: `url("${article.coverImage}")` }}>
        <span className="article-number">{String(index).padStart(2, "0")}</span>
      </Link>
      <div className="article-card-body">
        <div className="tag-row">{article.tags.slice(0, 3).map((tag) => <Link key={tag} href={`/tag/${tag.toLowerCase()}`}>{getTagLabel(tag, locale)}</Link>)}</div>
        <h3><Link href={`/articles/${article.slug}`}>{article.title}</Link></h3>
        <p>{article.summary}</p>
        <div className="article-card-bottom"><span>{article.author.displayName}</span><Link href={`/articles/${article.slug}`} aria-label={`${t.readArticle} ${article.title}`}><ArrowUpRight size={17} /></Link></div>
      </div>
    </article>
  );
}