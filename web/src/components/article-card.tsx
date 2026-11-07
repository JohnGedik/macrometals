import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Article } from "@/lib/articles";

export function ArticleCard({ article, index }: { article: Article; index: number }) {
  return (
    <article className="article-card">
      <Link className="article-image" href={`/articles/${article.slug}`} aria-label={`Read ${article.title}`} style={{ backgroundImage: `url("${article.coverImage}")` }}>
        <span className="article-number">{String(index).padStart(2, "0")}</span>
      </Link>
      <div className="article-card-body">
        <div className="tag-row">{article.tags.slice(0, 3).map((tag) => <Link key={tag} href={`/tag/${tag.toLowerCase()}`}>{tag}</Link>)}</div>
        <h3><Link href={`/articles/${article.slug}`}>{article.title}</Link></h3>
        <p>{article.summary}</p>
        <div className="article-card-bottom"><span>{article.author.displayName}</span><Link href={`/articles/${article.slug}`} aria-label={`Read ${article.title}`}><ArrowUpRight size={17} /></Link></div>
      </div>
    </article>
  );
}