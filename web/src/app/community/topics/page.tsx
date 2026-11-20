import Link from "next/link";
import type { Metadata } from "next";
import { ArticleCard } from "@/components/article-card";
import { CommunityNotice } from "@/components/community-controls";
import { getArticles } from "@/lib/articles";
import { communityCopy } from "@/lib/community-copy";
import { matchesTopic, sortFeedArticles } from "@/lib/community-feed";
import { getDiscussions } from "@/lib/discussions";
import { getLocale } from "@/lib/locale";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const topics = ["gold", "silver", "copper", "oil", "macro"] as const;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: communityCopy[locale].topicFeeds,
    description: communityCopy[locale].topicsIntro,
    alternates: { canonical: "/community/topics" },
  };
}

export default async function TopicsPage({ searchParams }: { searchParams: Promise<{ topic?: string; sort?: string; error?: string; notice?: string }> }) {
  const locale = await getLocale();
  const t = communityCopy[locale];
  const params = await searchParams;
  const topic = topics.find((item) => item === params.topic) ?? "all";
  const sort = params.sort === "top" || params.sort === "discussed" ? params.sort : "latest";
  const [discussions, articles, supabase] = await Promise.all([getDiscussions(topic, sort), getArticles(locale), createSupabaseServerClient()]);
  if (!supabase || !discussions) return <section className="community-page content-width community-social"><h1>{t.topicFeeds}</h1><p role="alert">{t.failed}</p></section>;
  const selectedArticles = articles.filter((article) => matchesTopic(article, topic));
  let commentCounts = new Map<string, number>();
  if (sort === "discussed" && selectedArticles.length) {
    const { data, error } = await supabase.rpc("get_article_comment_counts", { article_ids: selectedArticles.map((article) => article.id) });
    if (error) {
      console.error("Could not load article comment counts", error.code);
      return <section className="community-page content-width community-social"><h1>{t.topicFeeds}</h1><p role="alert">{t.failed}</p></section>;
    }
    commentCounts = new Map((data ?? []).map((item: { article_id: string; comment_count: number }) => [item.article_id, Number(item.comment_count)]));
  }
  const sortedArticles = sortFeedArticles(selectedArticles, sort, commentCounts);
  return <section className="community-page content-width community-social">
    <div className="section-heading"><div><h1>{t.topicFeeds}</h1><p>{t.topicsIntro}</p></div><Link className="button-primary" href="/discussions/new">{t.newDiscussion}</Link></div>
    <CommunityNotice error={params.error} notice={params.notice} locale={locale} />
    <form action="/community/topics" className="community-sort">
      <label htmlFor="topic">{t.topic}</label>
      <select id="topic" name="topic" defaultValue={topic}><option value="all">{t.allTopics}</option>{topics.map((item) => <option key={item} value={item}>{t[item]}</option>)}</select>
      <label htmlFor="sort">{t.sort}</label>
      <select id="sort" name="sort" defaultValue={sort}><option value="latest">{t.latest}</option><option value="top">{t.top}</option><option value="discussed">{t.discussed}</option></select>
      <button className="button-secondary" type="submit">{t.apply}</button>
    </form>
    <p>{t.feedLimit}</p>
    <h2>{t.discussions}</h2>
    {discussions.length ? <ul className="discussion-list">{discussions.map((post) => {
      const postTopic = topics.find((item) => item === post.topic);
      return <li key={post.id}>
        <Link href={`/discussions/${post.id}`}>{post.title}</Link>
        <p>{postTopic ? t[postTopic] : post.topic} · {post.author} · {new Date(post.created_at).toLocaleDateString(locale === "tr" ? "tr-TR" : "en-US")} · ▲ {post.score} · {post.replyCount} {t.replies}</p>
      </li>;
    })}</ul> : <p>{t.noDiscussions}</p>}
    <h2>{t.articles}</h2>
    {sortedArticles.length ? <div className="article-grid">{sortedArticles.map((article, index) => <ArticleCard key={article.id} article={article} index={index + 1} locale={locale} />)}</div> : <p>{t.noArticles}</p>}
  </section>;
}
