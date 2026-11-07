import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type Author = {
  slug: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
};

export type Article = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  coverImage: string;
  publishedAt: string;
  author: Author;
  tags: string[];
};

type ArticleMetadata = Omit<Article, "body">;

function parseMarkdownArticle(source: string): Article {
  const { data, content } = matter(source);
  const author = data.author as Record<string, unknown> | undefined;
  const tags = Array.isArray(data.tags) ? data.tags.map(String) : [];

  if (!author || typeof data.slug !== "string" || typeof data.title !== "string") {
    throw new Error("Article Markdown is missing required frontmatter: slug, title, or author.");
  }

  const metadata: ArticleMetadata = {
    id: String(data.id ?? data.slug),
    slug: data.slug,
    title: data.title,
    summary: String(data.summary ?? ""),
    coverImage: String(data.coverImage ?? ""),
    publishedAt: String(data.publishedAt ?? ""),
    author: {
      slug: String(author.slug ?? ""),
      displayName: String(author.displayName ?? "Author"),
      bio: String(author.bio ?? ""),
      avatarUrl: typeof author.avatarUrl === "string" ? author.avatarUrl : null,
    },
    tags,
  };

  return { ...metadata, body: content.trim() };
}

async function getMarkdownArticles(): Promise<Article[]> {
  const articlesDirectory = join(process.cwd(), "content", "articles");
  const entries = await readdir(articlesDirectory, { withFileTypes: true });
  const sources = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => readFile(join(articlesDirectory, entry.name, "index.md"), "utf8")),
  );

  return sources
    .map(parseMarkdownArticle)
    .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));
}

export async function getArticles(): Promise<Article[]> {
  return getMarkdownArticles();
}

export async function getArticleBySlug(slug: string) {
  return (await getArticles()).find((article) => article.slug === slug) ?? null;
}

export async function getAuthorBySlug(slug: string) {
  const articles = await getArticles();
  const fallback = articles.find((article) => article.author.slug === slug)?.author ?? null;
  const supabase = await createSupabaseServerClient();

  if (supabase) {
    const { data } = await supabase
      .from("profiles")
      .select("slug, display_name, bio, avatar_url")
      .eq("slug", slug)
      .maybeSingle();

    if (data) {
      const author: Author = {
        slug: data.slug,
        displayName: data.display_name ?? "Author",
        bio: data.bio ?? "",
        avatarUrl: data.avatar_url,
      };
      return {
        author,
        articles: articles.filter((article) => article.author.slug === slug),
      };
    }
  }

  if (!fallback) return null;
  return {
    author: fallback,
    articles: articles.filter((article) => article.author.slug === slug),
  };
}

export function searchArticles(articles: Article[], query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [];
  return articles.filter((article) =>
    [article.title, article.summary, ...article.tags]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalized),
  );
}