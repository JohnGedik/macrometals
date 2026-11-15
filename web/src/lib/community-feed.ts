export type Topic = "all" | "gold" | "silver" | "copper" | "oil" | "macro";
export type FeedSort = "latest" | "top" | "discussed";
type FeedArticle = { id: string; category?: string; tags: string[]; score?: number; publishedAt: string };

export function matchesTopic(article: FeedArticle, topic: Topic) {
  if (topic === "all") return true;
  const labels = [article.category ?? "", ...article.tags].map((label) => label.toLowerCase());
  return topic === "macro"
    ? labels.some((label) => ["macro", "inflation", "debt", "dollar", "geopolitics"].includes(label))
    : labels.includes(topic);
}

export function sortFeedArticles<T extends FeedArticle>(articles: T[], sort: FeedSort, commentCounts: Map<string, number>) {
  return [...articles].sort((a, b) => {
    const difference = sort === "top" ? (b.score ?? 0) - (a.score ?? 0)
      : sort === "discussed" ? (commentCounts.get(b.id) ?? 0) - (commentCounts.get(a.id) ?? 0) : 0;
    return difference || Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
  });
}
