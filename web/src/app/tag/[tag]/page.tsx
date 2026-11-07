import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleCard } from "@/components/article-card";
import { getArticles } from "@/lib/articles";

type RouteProps = { params: Promise<{ tag: string }> };

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { tag } = await params;
  const title = decodeURIComponent(tag).replaceAll("-", " ");
  return { title: `${title[0]?.toUpperCase()}${title.slice(1)} analysis` };
}

export default async function TagPage({ params }: RouteProps) {
  const { tag } = await params;
  const title = decodeURIComponent(tag).replaceAll("-", " ");
  const articles = (await getArticles()).filter((article) => article.tags.some((item) => item.toLowerCase() === title.toLowerCase()));
  if (!articles.length) notFound();

  return (
    <section className="listing-page content-width">
      <div className="section-kicker"><span className="eyebrow">Topic file</span><span className="kicker-line" /></div>
      <h1>{title[0].toUpperCase()}{title.slice(1)}</h1>
      <p className="listing-intro">Analysis connected to {title.toLowerCase()} and the forces around it.</p>
      <div className="article-grid">{articles.map((article, index) => <ArticleCard key={article.id} article={article} index={index + 1} />)}</div>
    </section>
  );
}