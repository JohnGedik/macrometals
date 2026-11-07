import type { Metadata } from "next";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { CommentSection } from "@/components/comment-section";
import { ShareActions } from "@/components/share-actions";
import { ArticleCard } from "@/components/article-card";
import { getArticleBySlug, getArticles } from "@/lib/articles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) return { title: "Article not found" };
  const url = `/articles/${article.slug}`;

  return {
    title: article.title,
    description: article.summary,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title: article.title,
      description: article.summary,
      url,
      publishedTime: article.publishedAt,
      images: [{ url: article.coverImage, width: 1800, height: 1200, alt: article.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.summary,
      images: [article.coverImage],
    },
  };
}

export default async function ArticlePage({ params }: RouteProps) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) notFound();

  const supabase = await createSupabaseServerClient();
  let currentUserId: string | null = null;
  let comments: Array<{
    id: string;
    user_id: string;
    content: string;
    created_at: string;
    updated_at: string;
    profiles: { display_name: string | null; avatar_url: string | null } | null;
  }> = [];

  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    currentUserId = user?.id ?? null;
    const { data } = await supabase
      .from("comments")
      .select("id, user_id, content, created_at, updated_at, profiles(display_name, avatar_url)")
      .eq("article_id", article.id)
      .order("created_at", { ascending: true });
    comments = (data ?? []) as unknown as typeof comments;
  }

  const allArticles = await getArticles();
  const related = allArticles.filter((item) => item.slug !== article.slug && item.tags.some((tag) => article.tags.includes(tag))).slice(0, 2);

  return (
    <article className="article-page">
      <header className="article-hero">
        <div className="article-hero-image" style={{ backgroundImage: `url("${article.coverImage}")` }} />
        <div className="article-hero-content content-width">
          <div className="tag-row">{article.tags.map((tag) => <Link key={tag} href={`/tag/${tag.toLowerCase()}`}>{tag}</Link>)}</div>
          <h1>{article.title}</h1>
          <p className="article-deck">{article.summary}</p>
          <div className="article-author-line"><Avatar name={article.author.displayName} imageUrl={article.author.avatarUrl} /><div><Link href={`/author/${article.author.slug}`}>{article.author.displayName}</Link><span>{new Date(article.publishedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}</span></div></div>
        </div>
      </header>
      <div className="article-body-layout content-width">
        <aside className="article-share-rail"><ShareActions title={article.title} /></aside>
        <div className="article-reading-column">
          <div className="article-prose"><ReactMarkdown>{article.body}</ReactMarkdown></div>
          <div className="article-author-card"><Avatar name={article.author.displayName} imageUrl={article.author.avatarUrl} size="large" /><div><span className="eyebrow">Written by</span><h2><Link href={`/author/${article.author.slug}`}>{article.author.displayName}</Link></h2><p>{article.author.bio}</p></div></div>
          <CommentSection articleId={article.id} articleSlug={article.slug} comments={comments} currentUserId={currentUserId} />
        </div>
      </div>
      {related.length > 0 && <section className="related-section content-width"><div className="section-heading"><div><p className="eyebrow">Continue reading</p><h2>Related analysis</h2></div></div><div className="article-grid">{related.map((item, index) => <ArticleCard key={item.id} article={item} index={index + 1} />)}</div></section>}
    </article>
  );
}