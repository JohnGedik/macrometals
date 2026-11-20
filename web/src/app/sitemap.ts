import type { MetadataRoute } from "next";
import { getArticles } from "@/lib/articles";
import { getDiscussions } from "@/lib/discussions";
import { absoluteUrl } from "@/lib/seo";

const staticPages = [
  { path: "/", priority: 1, changeFrequency: "daily" as const },
  { path: "/community", priority: 0.6, changeFrequency: "daily" as const },
  { path: "/community/topics", priority: 0.5, changeFrequency: "daily" as const },
  { path: "/tag/gold", priority: 0.9, changeFrequency: "daily" as const },
  { path: "/tag/silver", priority: 0.9, changeFrequency: "daily" as const },
  { path: "/tag/copper", priority: 0.9, changeFrequency: "daily" as const },
  { path: "/tag/oil", priority: 0.9, changeFrequency: "daily" as const },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [articles, discussions] = await Promise.all([
    getArticles("en"),
    getDiscussions(),
  ]);
  const authors = new Map<string, { path: string; date: string }>();
  for (const article of articles) {
    const path = article.author.username
      ? `/profile/${article.author.username}`
      : `/author/${article.author.slug}`;
    if (!authors.has(path)) authors.set(path, { path, date: article.publishedAt });
  }

  return [
    ...staticPages.map(({ path, ...entry }) => ({
      url: absoluteUrl(path),
      ...entry,
    })),
    ...articles.map((article) => ({
      url: absoluteUrl(`/articles/${article.slug}`),
      lastModified: new Date(article.publishedAt),
      changeFrequency: "monthly" as const,
      priority: 0.8,
      images: article.coverImage ? [article.coverImage] : undefined,
    })),
    ...[...authors.values()].map((author) => ({
      url: absoluteUrl(author.path),
      lastModified: new Date(author.date),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    ...(discussions ?? []).map((discussion) => ({
      url: absoluteUrl(`/discussions/${discussion.id}`),
      lastModified: new Date(discussion.created_at),
      changeFrequency: "weekly" as const,
      priority: 0.4,
    })),
  ];
}
