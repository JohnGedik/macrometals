import type { Metadata } from "next";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { CommentSection } from "@/components/comment-section";
import { ShareActions } from "@/components/share-actions";
import { VoteWidget } from "@/components/vote-widget";
import { ArticleViewTracker } from "@/components/article-view-tracker";
import { ArticleCard } from "@/components/article-card";
import { getArticleBySlug, getArticles } from "@/lib/articles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTagLabel, messages } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

type RouteProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const article = await getArticleBySlug(slug, locale);
  if (!article) return { title: messages[locale].generic.articleNotFound };
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
  const locale = await getLocale();
  const t = messages[locale].article;
  const article = await getArticleBySlug(slug, locale);
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

  const allArticles = await getArticles(locale);
  const related = allArticles.filter((item) => item.slug !== article.slug && item.tags.some((tag) => article.tags.includes(tag))).slice(0, 2);

  return (
    <article className="article-page">
      <ArticleViewTracker articleId={article.id} />
      <header className="article-hero">
        <div className="article-hero-image" style={{ backgroundImage: `url("${article.coverImage}")` }} />
        <div className="article-hero-content content-width">
          <div className="tag-row">{article.tags.map((tag) => <Link key={tag} href={`/tag/${tag.toLowerCase()}`}>{getTagLabel(tag, locale)}</Link>)}</div>
          <h1>{article.title}</h1>
          <p className="article-deck">{article.summary}</p>
          <div className="article-author-line"><Avatar name={article.author.displayName} imageUrl={article.author.avatarUrl} /><div><Link href={article.author.username ? `/profile/${article.author.username}` : `/author/${article.author.slug}`}>{article.author.displayName}</Link><span>{new Date(article.publishedAt).toLocaleDateString(locale === "tr" ? "tr-TR" : "en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })} · {Math.max(1, Math.ceil(article.body.trim().split(/\s+/).length / 225))} {t.readingTime}</span></div></div>
        </div>
      </header>
      <div className="article-body-layout content-width">
        <aside className="article-share-rail"><ShareActions title={article.title} locale={locale} /></aside>
        <div className="article-reading-column">
          <VoteWidget articleId={article.id} slug={article.slug} upvotes={article.upvotes ?? 0} downvotes={article.downvotes ?? 0} userVote={article.userVote ?? 0} signedIn={currentUserId !== null} locale={locale} />
          <div className="article-prose"><ReactMarkdown>{article.body}</ReactMarkdown></div>
          <div className="article-author-card"><Avatar name={article.author.displayName} imageUrl={article.author.avatarUrl} size="large" /><div><span className="eyebrow">{t.writtenBy}</span><h2><Link href={article.author.username ? `/profile/${article.author.username}` : `/author/${article.author.slug}`}>{article.author.displayName}</Link></h2><p>{article.author.bio}</p></div></div>
          <CommentSection articleId={article.id} articleSlug={article.slug} comments={comments} currentUserId={currentUserId} locale={locale} />
        </div>
      </div>
      {related.length > 0 && <section className="related-section content-width"><div className="section-heading"><div><p className="eyebrow">{t.continueReading}</p><h2>{t.relatedAnalysis}</h2></div></div><div className="article-grid">{related.map((item, index) => <ArticleCard key={item.id} article={item} index={index + 1} locale={locale} />)}</div></section>}
    </article>
  );
}