import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTagLabel, type Locale } from "@/lib/i18n";

export type Author = {
  id?: string;
  slug: string;
  username?: string;
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
  authorId?: string;
  category?: string;
  language?: Locale;
  upvotes?: number;
  downvotes?: number;
  score?: number;
  userVote?: -1 | 0 | 1;
  viewCount?: number;
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

async function getMarkdownArticles(locale: Locale): Promise<Article[]> {
  const articlesDirectory = join(process.cwd(), "content", "articles");
  const entries = await readdir(articlesDirectory, { withFileTypes: true });
  const articles = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const directory = join(articlesDirectory, entry.name);
        const source = await readFile(join(directory, "index.md"), "utf8");
        const article = parseMarkdownArticle(source);
        if (locale === "en") return article;

        let translatedSource: string;
        try {
          translatedSource = await readFile(join(directory, "index.tr.md"), "utf8");
        } catch (error) {
          if (error instanceof Error && "code" in error && error.code === "ENOENT") return article;
          throw error;
        }

        const translated = parseMarkdownArticle(translatedSource);
        return {
          ...article,
          title: translated.title,
          summary: translated.summary,
          body: translated.body,
          author: { ...article.author, bio: translated.author.bio },
        };
      }),
  );

  return articles.sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));
}

export async function getArticles(locale: Locale = "en"): Promise<Article[]> {
  const [editorial, community] = await Promise.all([getMarkdownArticles(locale), getCommunityArticles()]);
  const bySlug = new Map(community.map((article) => [article.slug, article]));
  for (const article of editorial) bySlug.set(article.slug, article);
  const articles = [...bySlug.values()];
  const supabase = await createSupabaseServerClient();
  if (supabase && articles.length) {
    const { data: summaries } = await supabase.rpc("get_article_vote_summaries", { article_ids: articles.map((article) => article.id) });
    const voteByArticle = new Map(((summaries ?? []) as VoteSummary[]).map((summary) => [summary.article_id, summary]));
    for (const article of articles) {
      const summary = voteByArticle.get(article.id);
      if (!summary) continue;
      article.upvotes = Number(summary.upvotes);
      article.downvotes = Number(summary.downvotes);
      article.score = article.upvotes - article.downvotes;
      article.userVote = Number(summary.user_vote) as -1 | 0 | 1;
    }
  }
  return articles.sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));
}

type CommunityRow = {
  id: string;
  author_id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  cover_image: string | null;
  featured_image: string | null;
  published_at: string | null;
  created_at: string;
  language: Locale;
  category_id: string | null;
  view_count: number;
};

type VoteSummary = { article_id: string; upvotes: number; downvotes: number; user_vote: number };

async function getCommunityArticles(): Promise<Article[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];

  const { data: rawArticles, error } = await supabase
    .from("articles")
    .select("id, author_id, slug, title, summary, body, cover_image, featured_image, published_at, created_at, language, category_id, view_count")
    .eq("published", true)
    .not("author_id", "is", null)
    .order("published_at", { ascending: false })
    .limit(100);
  if (error || !rawArticles?.length) return [];

  const rows = rawArticles as CommunityRow[];
  const articleIds = rows.map((row) => row.id);
  const authorIds = [...new Set(rows.map((row) => row.author_id))];
  const categoryIds = [...new Set(rows.flatMap((row) => row.category_id ? [row.category_id] : []))];
  const [profileResult, tagResult, categoryResult, voteResult] = await Promise.all([
    supabase.from("profiles").select("id, slug, username, display_name, bio, avatar_url").in("id", authorIds),
    supabase.from("article_tags").select("article_id, tag_id").in("article_id", articleIds),
    categoryIds.length ? supabase.from("categories").select("id, name").in("id", categoryIds) : Promise.resolve({ data: [], error: null }),
    supabase.rpc("get_article_vote_summaries", { article_ids: articleIds }),
  ]);

  const tagIds = [...new Set((tagResult.data ?? []).map((tag) => tag.tag_id))];
  const tagNamesResult = tagIds.length
    ? await supabase.from("tags").select("id, name").in("id", tagIds)
    : { data: [], error: null };
  const profiles = new Map((profileResult.data ?? []).map((profile) => [profile.id, profile]));
  const categories = new Map((categoryResult.data ?? []).map((category) => [category.id, category.name]));
  const tagNames = new Map((tagNamesResult.data ?? []).map((tag) => [tag.id, tag.name]));
  const tagsByArticle = new Map<string, string[]>();
  for (const link of tagResult.data ?? []) {
    const tagName = tagNames.get(link.tag_id);
    if (tagName) tagsByArticle.set(link.article_id, [...(tagsByArticle.get(link.article_id) ?? []), tagName]);
  }
  const voteRows = (voteResult.data ?? []) as VoteSummary[];
  const votes = new Map(voteRows.map((vote) => [vote.article_id, vote]));

  return rows.flatMap((row) => {
    const profile = profiles.get(row.author_id);
    if (!profile) return [];
    const vote = votes.get(row.id);
    const upvotes = Number(vote?.upvotes ?? 0);
    const downvotes = Number(vote?.downvotes ?? 0);
    return [{
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      body: row.body,
      coverImage: row.featured_image || row.cover_image || "",
      publishedAt: row.published_at ?? row.created_at,
      author: {
        id: profile.id,
        slug: profile.slug,
        username: profile.username,
        displayName: profile.display_name ?? "Author",
        bio: profile.bio ?? "",
        avatarUrl: profile.avatar_url,
      },
      authorId: row.author_id,
      category: row.category_id ? categories.get(row.category_id) : undefined,
      tags: [...new Set([...(row.category_id && categories.get(row.category_id) ? [categories.get(row.category_id)!] : []), ...(tagsByArticle.get(row.id) ?? [])])],
      language: row.language,
      upvotes,
      downvotes,
      score: upvotes - downvotes,
      userVote: (Number(vote?.user_vote ?? 0) as -1 | 0 | 1),
      viewCount: Number(row.view_count ?? 0),
    } satisfies Article];
  });
}

export async function getArticleBySlug(slug: string, locale: Locale = "en") {
  return (await getArticles(locale)).find((article) => article.slug === slug) ?? null;
}

export async function getAuthorBySlug(slug: string, locale: Locale = "en") {
  const articles = await getArticles(locale);
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
        bio: locale === "tr" && fallback ? fallback.bio : data.bio ?? "",
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

export function searchArticles(articles: Article[], query: string, locale: Locale = "en") {
  const localeCode = locale === "tr" ? "tr-TR" : "en-US";
  const normalized = query.trim().toLocaleLowerCase(localeCode);
  if (!normalized) return [];
  return articles.filter((article) =>
    [article.title, article.summary, article.body, article.category ?? "", article.author.displayName, ...article.tags, ...article.tags.map((tag) => getTagLabel(tag, locale))]
      .join(" ")
      .toLocaleLowerCase(localeCode)
      .includes(normalized),
  );
}