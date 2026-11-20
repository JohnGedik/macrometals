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
import { JsonLd } from "@/components/json-ld";
import { CommunityNotice, ReportControl, SaveArticleControl } from "@/components/community-controls";
import { communityCopy } from "@/lib/community-copy";
import { getArticleBySlug, getArticles } from "@/lib/articles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTagLabel, messages } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { absoluteUrl } from "@/lib/seo";

type RouteProps = { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string; notice?: string }> };

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

export default async function ArticlePage({ params, searchParams }: RouteProps) {
  const { slug } = await params;
  const locale = await getLocale();
  const t = messages[locale].article;
  const article = await getArticleBySlug(slug, locale);
  if (!article) notFound();

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    description: article.summary,
    image: article.coverImage ? [article.coverImage] : undefined,
    datePublished: article.publishedAt,
    dateModified: article.publishedAt,
    mainEntityOfPage: absoluteUrl(`/articles/${article.slug}`),
    inLanguage: locale,
    author: {
      "@type": "Person",
      name: article.author.displayName,
      url: absoluteUrl(article.author.username ? `/profile/${article.author.username}` : `/author/${article.author.slug}`),
    },
    publisher: { "@id": absoluteUrl("/#organization") },
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: messages[locale].header.latest, item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: article.title, item: absoluteUrl(`/articles/${article.slug}`) },
    ],
  };
  const commodity = article.tags.map((tag) => tag.toLowerCase()).find((tag) => ["gold", "silver", "copper", "oil"].includes(tag));
  const commodityLabel = commodity
    ? getTagLabel(`${commodity[0].toUpperCase()}${commodity.slice(1)}`, locale)
    : "";

  const supabase = await createSupabaseServerClient();
  const status = await searchParams;
  let currentUserId: string | null = null;
  let saved = false;
  let saveError = false;
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
    if (user) {
      const { data: savedArticle, error } = await supabase.from("saved_articles")
        .select("article_id").eq("user_id", user.id).eq("article_id", article.id).maybeSingle();
      if (error) {
        console.error("Could not load saved article state", error.code);
        saveError = true;
      } else {
        saved = !!savedArticle;
      }
    }
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
      <JsonLd value={articleJsonLd} />
      <JsonLd value={breadcrumbJsonLd} />
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
          <nav className="article-breadcrumbs" aria-label={locale === "tr" ? "Sayfa yolu" : "Breadcrumb"}>
            <Link href="/">{messages[locale].header.latest}</Link><span aria-hidden="true">/</span>
            <span>{article.title}</span>
          </nav>
          <CommunityNotice error={status.error} notice={status.notice} locale={locale} />
          <div className="community-article-actions">
            {currentUserId && currentUserId === article.authorId && <Link className="button-secondary" href={`/write/${article.slug}`}>{communityCopy[locale].edit}</Link>}
            {saveError ? <p role="alert">{communityCopy[locale].failed}</p> : <SaveArticleControl id={article.id} path={`/articles/${article.slug}`} saved={saved} signedIn={!!currentUserId} locale={locale} />}
            <ReportControl type="article" id={article.id} path={`/articles/${article.slug}`} signedIn={!!currentUserId} locale={locale} />
          </div>
          <VoteWidget articleId={article.id} slug={article.slug} upvotes={article.upvotes ?? 0} downvotes={article.downvotes ?? 0} userVote={article.userVote ?? 0} signedIn={currentUserId !== null} locale={locale} />
          <div className="article-prose"><ReactMarkdown>{article.body}</ReactMarkdown></div>
          {commodity && <aside className="article-dashboard-link">
            <p className="eyebrow">{locale === "tr" ? "Canlı bağlam" : "Live context"}</p>
            <h2>{locale === "tr" ? `${commodityLabel} dashboardunu keşfedin` : `Explore the ${commodityLabel} dashboard`}</h2>
            <p>{locale === "tr" ? "Bu analizi fiyat, makro gösterge ve kaynak sağlık verileriyle birlikte inceleyin." : "Read this analysis alongside prices, macro indicators, and source-health details."}</p>
            <Link className="text-link" href={`/tag/${commodity}`}>{locale === "tr" ? "Dashboardu aç" : "Open the dashboard"} <span>→</span></Link>
          </aside>}
          <div className="article-author-card"><Avatar name={article.author.displayName} imageUrl={article.author.avatarUrl} size="large" /><div><span className="eyebrow">{t.writtenBy}</span><h2><Link href={article.author.username ? `/profile/${article.author.username}` : `/author/${article.author.slug}`}>{article.author.displayName}</Link></h2><p>{article.author.bio}</p></div></div>
          <CommentSection articleId={article.id} articleSlug={article.slug} comments={comments} currentUserId={currentUserId} locale={locale} />
        </div>
      </div>
      {related.length > 0 && <section className="related-section content-width"><div className="section-heading"><div><p className="eyebrow">{t.continueReading}</p><h2>{t.relatedAnalysis}</h2></div></div><div className="article-grid">{related.map((item, index) => <ArticleCard key={item.id} article={item} index={index + 1} locale={locale} />)}</div></section>}
    </article>
  );
}